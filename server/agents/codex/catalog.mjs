import { resolve } from "node:path";
import { httpError } from "../../workspace-store.mjs";
import { running } from "./protocol-values.mjs";

const samePath = (left, right) => resolve(left || "").toLowerCase() === resolve(right || "").toLowerCase();
const encode = (value) => value ? Buffer.from(JSON.stringify(value)).toString("base64url") : null;
function position(cursor, scope, order, phase) {
  if (!cursor) return { scope, order, phase, offset: 0, native: null };
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString());
    if (value.scope !== scope || value.order !== order || !["access", "native", "bound", "project"].includes(value.phase) || !Number.isSafeInteger(value.offset) || value.offset < 0 || !(value.native === null || typeof value.native === "string")) throw new Error();
    return value;
  } catch { throw httpError(400, "会话列表位置无效。"); }
}
export class CodexCatalog {
  constructor(connection, store, readGoal = async () => null, readName = () => undefined) { this.connection = connection; this.store = store; this.readGoal = readGoal; this.readName = readName; this.paths = new Map(); this.metadataCache = new Map(); this.metadataPass = null; }
  remember(thread) {
    if (!thread?.id) return;
    const { id, cwd, name, status, updatedAt, createdAt } = thread;
    this.paths.set(id, cwd); this.metadataCache.delete(id); this.metadataCache.set(id, { id, cwd, name, status, updatedAt, createdAt });
    if (this.metadataCache.size > 2048) this.metadataCache.delete(this.metadataCache.keys().next().value);
  }
  async storedMetadata(id) {
    if (this.metadataCache.has(id)) return this.metadataCache.get(id);
    if (!this.metadataPass) {
      this.metadataPass = (async () => {
        const found = new Map(), seen = new Set(); let cursor = null;
        do {
          const page = await this.connection.request("thread/list", { limit: 100, useStateDbOnly: true, ...(cursor ? { cursor } : {}) });
          for (const thread of page.data || []) { this.remember(thread); if (this.store.threadProjects[thread.id]) found.set(thread.id, this.metadataCache.get(thread.id)); }
          cursor = page.nextCursor || null;
          if (cursor) { if (seen.has(cursor)) throw new Error("会话目录位置重复，请刷新后重试。"); seen.add(cursor); }
        } while (cursor);
        return found;
      })().finally(() => { this.metadataPass = null; });
    }
    return (await this.metadataPass).get(id) || null;
  }
  accesses(projects, user) {
    const ids = new Set(projects.map((project) => project.id));
    return Object.entries(this.store.threadAccesses[user.id] || {}).filter(([id]) => ids.has(this.store.threadProjects[id])).sort((a, b) => Date.parse(b[1]) - Date.parse(a[1])).map(([id]) => id);
  }
  async metadata(id) {
    try { const thread = (await this.connection.request("thread/read", { threadId: id, includeTurns: false })).thread; this.remember(thread); return thread; }
    catch (error) { if (/thread not loaded/i.test(error.message)) return this.storedMetadata(id); if (/not found|not exist|no rollout/i.test(error.message)) return null; throw error; }
  }
  async summary(thread, project, user) {
    const goal = await this.readGoal(thread.id);
    return { id: thread.id, agentInstanceId: "codex-local", projectId: project.id, title: String(this.readName(thread.id) || thread.name || "未命名聊天").slice(0, 300),
      status: running(thread.status) ? "running" : "idle", queueCount: this.store.queues[thread.id]?.length || 0, ...(goal?.status ? { goalStatus: goal.status } : {}),
      accessedAt: this.store.threadAccess(user.id, thread.id), updatedAt: thread.updatedAt, createdAt: thread.createdAt };
  }
  async readIds(ids, projects, user) {
    const byId = new Map(projects.map((project) => [project.id, project]));
    const threads = await Promise.all(ids.filter((id) => byId.has(this.store.threadProjects[id])).map((id) => this.metadata(id)));
    return Promise.all(threads.filter(Boolean).map((thread) => this.summary(thread, byId.get(this.store.threadProjects[thread.id]), user)));
  }
  async list(project, user, { cursor = null, order = "original" } = {}) {
    const p = position(cursor, project.id, order, order === "recent" ? "access" : "native"), accessed = order === "recent" ? this.accesses([project], user) : [];
    let conversations, next;
    if (p.phase === "access" && p.offset < accessed.length) {
      conversations = await this.readIds(accessed.slice(p.offset, p.offset + 30), [project], user);
      next = p.offset + 30 < accessed.length ? { ...p, offset: p.offset + 30 } : { ...p, phase: "native", offset: 0 };
    } else if (p.phase === "bound") {
      const ids = this.store.threadIdsForProject(project.id).filter((id) => !accessed.includes(id) && (!this.paths.has(id) || !samePath(this.paths.get(id), project.path)));
      const threads = (await Promise.all(ids.slice(p.offset, p.offset + 30).map((id) => this.metadata(id)))).filter((thread) => thread && !samePath(thread.cwd, project.path));
      conversations = await Promise.all(threads.map((thread) => this.summary(thread, project, user)));
      next = p.offset + 30 < ids.length ? { ...p, offset: p.offset + 30 } : null;
    } else {
      const page = await this.connection.request("thread/list", { cwd: project.path, limit: 30, useStateDbOnly: true, ...(order === "recent" ? { sortKey: "updated_at" } : {}), ...(p.native ? { cursor: p.native } : {}) });
      for (const thread of page.data || []) this.remember(thread);
      const bound = await this.store.bindProjectThreads((page.data || []).filter((thread) => !accessed.includes(thread.id)), user.id, project.id);
      conversations = await Promise.all(bound.map((thread) => this.summary(thread, project, user)));
      const relocated = this.store.threadIdsForProject(project.id).some((id) => !accessed.includes(id) && (!this.paths.has(id) || !samePath(this.paths.get(id), project.path)));
      next = page.nextCursor ? { ...p, phase: "native", native: page.nextCursor, offset: 0 } : relocated ? { ...p, phase: "bound", native: null, offset: 0 } : null;
    }
    let preferred = null;
    if (!cursor) {
      const recent = this.accesses([project], user);
      for (const id of recent) { const [row] = await this.readIds([id], [project], user); if (row) { preferred = row; break; } }
      if (!preferred) {
        const page = await this.connection.request("thread/list", { cwd: project.path, limit: 1, sortKey: "updated_at", useStateDbOnly: true });
        for (const thread of page.data || []) this.remember(thread);
        const bound = await this.store.bindProjectThreads(page.data || [], user.id, project.id);
        if (bound[0]) preferred = conversations.find((row) => row.id === bound[0].id) || await this.summary(bound[0], project, user);
      }
    }
    return { conversations, nextCursor: encode(next), preferred };
  }
  async listAll(projects, user, { cursor = null, order = "original" } = {}) {
    const p = position(cursor, "workspace", order, order === "recent" ? "access" : "project");
    const accessed = this.accesses(projects, user);
    if (p.phase === "project") {
      const conversations = [];
      let next = p;
      while (next && conversations.length < 30) {
        const project = projects[next.offset];
        if (!project) { next = null; break; }
        const page = await this.list(project, user, { cursor: next.native, order });
        conversations.push(...page.conversations);
        next = page.nextCursor ? { ...next, native: page.nextCursor } : next.offset + 1 < projects.length ? { ...next, native: null, offset: next.offset + 1 } : null;
      }
      return { conversations, nextCursor: encode(next) };
    }
    if (p.phase === "access" && p.offset < accessed.length) {
      return { conversations: await this.readIds(accessed.slice(p.offset, p.offset + 30), projects, user), nextCursor: encode(p.offset + 30 < accessed.length ? { ...p, offset: p.offset + 30 } : { ...p, phase: "native", offset: 0 }) };
    }
    if (!projects.length) return { conversations: [], nextCursor: null };
    const page = await this.connection.request("thread/list", { limit: 30, sortKey: "updated_at", useStateDbOnly: true, ...(p.native ? { cursor: p.native } : {}) });
    const rows = [];
    for (const thread of page.data || []) {
      this.remember(thread);
      if (accessed.includes(thread.id)) continue;
      const bound = this.store.threadProjects[thread.id], project = projects.find((project) => bound ? project.id === bound : samePath(project.path, thread.cwd));
      if (!project) continue;
      if ((await this.store.bindProjectThreads([thread], user.id, project.id)).length) rows.push(await this.summary(thread, project, user));
    }
    return { conversations: rows, nextCursor: encode(page.nextCursor ? { ...p, phase: "native", native: page.nextCursor, offset: 0 } : null) };
  }
  async search(projects, user, query, cursor) {
    if (typeof query !== "string" || !query.trim() || query.length > 200) throw httpError(400, "搜索内容必须是 1 到 200 个字符。");
    const page = await this.connection.request("thread/search", { searchTerm: query.trim(), limit: 30, ...(cursor ? { cursor } : {}) });
    const results = [];
    for (const match of page.data || []) {
      const thread = match.thread;
      if (!thread?.id) continue;
      const existing = this.store.threadProjects[thread.id];
      const project = projects.find((project) => existing ? project.id === existing : resolve(project.path).toLowerCase() === resolve(thread.cwd || "").toLowerCase());
      if (!project) continue;
      const allowed = await this.store.bindProjectThreads([thread], user.id, project.id);
      if (!allowed.length) continue;
      results.push({ id: thread.id, projectId: project.id, agentInstanceId: "codex-local", title: String(thread.name || "未命名会话").slice(0, 300),
        projectName: project.name, snippet: String(match.snippet || "").slice(0, 1500) });
    }
    return { results, nextCursor: page.nextCursor || null };
  }
}
