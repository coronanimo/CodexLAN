import { resolve } from "node:path";
import { httpError } from "../../workspace-store.mjs";
import { running } from "./protocol-values.mjs";

export class CodexCatalog {
  constructor(connection, store) { this.connection = connection; this.store = store; }
  async list(project, user, { cursor = null } = {}) {
    let page;
    if (cursor?.startsWith("bound:")) {
      const offset = Number(cursor.slice(6));
      if (!Number.isSafeInteger(offset) || offset < 0) throw httpError(400, "会话列表位置无效。");
      const ids = this.store.threadIdsForProject(project.id);
      const threads = await Promise.all(ids.slice(offset, offset + 30).map(async (threadId) => {
        try { return (await this.connection.request("thread/read", { threadId, includeTurns: false })).thread; }
        catch (error) { if (/not found|not exist|no rollout/i.test(error.message)) return null; throw error; }
      }));
      page = { data: threads.filter((thread) => thread && resolve(thread.cwd || "").toLowerCase() !== resolve(project.path).toLowerCase()),
        nextCursor: offset + 30 < ids.length ? `bound:${offset + 30}` : null };
    } else {
      if (cursor && !cursor.startsWith("native:")) throw httpError(400, "会话列表位置无效。");
      page = await this.connection.request("thread/list", { cwd: project.path, limit: 30, useStateDbOnly: true, sortKey: "created_at", sortDirection: "desc",
        ...(cursor ? { cursor: cursor.slice(7) } : {}) });
      page.nextCursor = page.nextCursor ? `native:${page.nextCursor}` : this.store.threadIdsForProject(project.id).length ? "bound:0" : null;
    }
    const bound = await this.store.bindProjectThreads(page.data || [], user.id, project.id);
    return { conversations: bound.map((thread) => ({ id: thread.id, agentInstanceId: "codex-local", projectId: project.id,
      title: String(thread.name || "未命名会话").slice(0, 300), status: running(thread.status) ? "running" : "idle" })), nextCursor: page.nextCursor || null };
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
