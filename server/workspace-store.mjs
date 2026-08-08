import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import { mkdir, readFile, readdir, realpath, rename, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { commandExecutionSnapshot } from "../public/execution-events.js";
import { turnPlanSnapshot } from "../public/plan.js";

export const LEGACY_SESSION_COOKIE = "codex_workspace_session";
export const SESSION_MAX_AGE_SECONDS = 90 * 24 * 60 * 60;
const SESSION_MAX_AGE_MS = SESSION_MAX_AGE_SECONDS * 1000;
export const SESSION_TIMER_MAX_MS = 2_147_000_000;
const MAX_LOGIN_ATTEMPTS = 2_000;
const LOGIN_ATTEMPT_RETENTION_MS = 10 * 60_000;
const STATE_VERSION = 13;
const V9_STATE_FIELDS = ["version", "projects", "queues", "queueRevisions", "threadSettings", "turnMetrics", "users", "threadOwners", "sessions", "legacyProjectIds"];
const scryptAsync = promisify(scrypt);

async function migrateWorkspaceState(input) {
  if (!isRecord(input)) throw new Error("workspace-state.json 的顶层格式无效。");
  if (![9, STATE_VERSION].includes(input.version)) {
    throw new Error(`Unsupported workspace state version: ${input.version ?? "missing"}.`);
  }
  const state = input.version === 9 ? await migrateV9State(structuredClone(input)) : input;
  if (!Array.isArray(state.projects)
    || !Array.isArray(state.users)
    || ["queues", "queueRevisions", "threadSettings", "turnMetrics", "threadProjects", "threadAccesses", "sessions"].some((field) => !isRecord(state[field]))) {
    throw new Error("workspace-state.json 的内容无效。");
  }
  state.sessions = activeStoredSessions(state.sessions);
  return state;
}

async function migrateV9State(state) {
  requireStateFields(state, V9_STATE_FIELDS);
  if (!Array.isArray(state.projects) || !state.projects.every(isProject)) throw new Error("workspace-state.json 的 projects 无效。");
  if (!Array.isArray(state.users) || !state.users.every(isStoredUser)) throw new Error("workspace-state.json 的 users 无效。");
  requireStoredQueues(state.queues, isLegacyQueueItem);
  requireQueueRevisions(state.queueRevisions);
  if (!isRecord(state.threadSettings) || !Object.entries(state.threadSettings).every(([threadId, settings]) => /^[0-9a-f-]+$/i.test(threadId)
    && isRecord(settings)
    && Object.entries(settings).every(([key, value]) => ["model", "effort", "serviceTier", "summary", "collaborationMode"].includes(key)
      && typeof value === "string" && value.trim() === value && value.length <= 120))) {
    throw new Error("workspace-state.json 的 threadSettings 无效。");
  }
  if (!isRecord(state.turnMetrics)) throw new Error("workspace-state.json 的 turnMetrics 无效。");
  const userIds = new Set(state.users.map((user) => user.id));
  const projectIds = new Set(state.projects.map((project) => project.id));
  if (!isRecord(state.threadOwners) || !Object.entries(state.threadOwners).every(([threadId, ownerId]) => /^[0-9a-f-]+$/i.test(threadId) && userIds.has(ownerId))) {
    throw new Error("workspace-state.json 的 v9 聊天所有者记录无效。");
  }
  if (!Array.isArray(state.legacyProjectIds) || state.legacyProjectIds.some((projectId) => !projectIds.has(projectId))) {
    throw new Error("workspace-state.json 的 v9 待认领项目记录无效。");
  }
  const projects = state.projects;
  for (const project of projects) {
    if (!Object.hasOwn(project, "legacyPaths")) continue;
    if (!Array.isArray(project.legacyPaths) || project.legacyPaths.some((path) => typeof path !== "string" || !isAbsolute(path))) {
      throw new Error(`项目“${project.name}”的旧目录记录无效。`);
    }
    const oldPaths = [...new Set(project.legacyPaths.map((path) => resolve(path)).filter((path) => !samePath(path, project.path)))];
    delete project.legacyPaths;
    if (oldPaths.length === 0) continue;
    if (oldPaths.length !== 1) throw new Error(`项目“${project.name}”同时关联多个旧目录，无法确定唯一项目目录。`);
    const oldPath = oldPaths[0];
    if (!projectDirectoryAvailable(oldPath)) throw new Error(`项目“${project.name}”的原目录当前不可用：${oldPath}`);
    if (existsSync(project.path) && !projectDirectoryAvailable(project.path)) {
      throw new Error(`项目“${project.name}”的替代路径不是可访问目录：${project.path}`);
    }
    if (projectDirectoryAvailable(project.path) && (await readdir(project.path)).length > 0) {
      throw new Error(`项目“${project.name}”的替代目录已有文件，不能自动恢复原目录：${project.path}`);
    }
    project.path = oldPath;
  }
  const threadProjects = {};
  for (const [threadId, queue] of Object.entries(state.queues)) {
    const queuedProjects = new Set(queue.map((item) => item.projectId));
    if (queuedProjects.size > 1) throw new Error("workspace-state.json 的 v9 聊天队列跨越多个项目。");
    const [projectId] = queuedProjects;
    if (!projectId) continue;
    const project = projects.find((entry) => entry.id === projectId);
    const ownerId = state.threadOwners[threadId];
    if (!project || (ownerId && project.ownerId !== ownerId)) throw new Error("workspace-state.json 的 v9 聊天队列与所有者不一致。");
    threadProjects[threadId] = projectId;
  }
  return {
    version: STATE_VERSION,
    projects,
    queues: Object.fromEntries(Object.entries(state.queues).map(([threadId, queue]) => [threadId, queue.map(({ delivery, ...item }) => item)])),
    queueRevisions: state.queueRevisions,
    threadSettings: Object.fromEntries(Object.entries(state.threadSettings).map(([threadId, settings]) => [threadId, cleanSettings(settings)])),
    turnMetrics: cleanStoredTurnMetrics(state.turnMetrics),
    users: state.users,
    threadProjects,
    threadAccesses: {},
    sessions: state.sessions,
  };
}

function requireStateFields(state, fields) {
  const actual = Object.keys(state);
  if (actual.length !== fields.length || fields.some((field) => !Object.hasOwn(state, field))) {
    throw new Error(`workspace-state.json 的 v${state.version} 顶层字段不完整或包含未知字段。`);
  }
}

function requireStoredQueues(queues, validator) {
  if (!isRecord(queues) || !Object.entries(queues).every(([threadId, queue]) => /^[0-9a-f-]+$/i.test(threadId) && Array.isArray(queue) && queue.every(validator))) {
    throw new Error("workspace-state.json 的 queues 无效。");
  }
}

function requireQueueRevisions(revisions) {
  if (!isRecord(revisions) || !Object.entries(revisions).every(([threadId, revision]) => /^[0-9a-f-]+$/i.test(threadId) && Number.isInteger(revision) && revision >= 0)) {
    throw new Error("workspace-state.json 的 queueRevisions 无效。");
  }
}

function activeStoredSessions(sessions) {
  if (!isRecord(sessions) || !Object.values(sessions).every(isStoredSessionRecord)) throw new Error("workspace-state.json 的 sessions 包含无效记录。");
  return Object.fromEntries(Object.entries(sessions).filter(([, session]) => session.expiresAt > Date.now()));
}

export class WorkspaceStore {
  constructor({ dataRoot, stateFile, workspace }) {
    this.dataRoot = dataRoot;
    this.stateFile = stateFile;
    this.workspace = workspace;
    this.projects = [];
    this.queues = {};
    this.queueRevisions = {};
    this.threadSettings = {};
    this.turnMetrics = {};
    this.users = [];
    this.threadProjects = {};
    this.threadAccesses = {};
    this.sessions = {};
    this.persistence = Promise.resolve();
    this.ready = this.load();
  }

  async load() {
    await mkdir(this.dataRoot, { recursive: true });
    try {
      const state = await migrateWorkspaceState(JSON.parse(await readFile(this.stateFile, "utf8")));
      this.projects = state.projects;
      this.queues = state.queues;
      this.queueRevisions = state.queueRevisions;
      this.threadSettings = state.threadSettings;
      this.turnMetrics = state.turnMetrics;
      this.users = state.users;
      this.threadProjects = state.threadProjects;
      this.threadAccesses = state.threadAccesses;
      this.sessions = state.sessions;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }

    await this.persist();
  }

  async listProjects(ownerId) {
    await this.ready;
    const projects = ownerId ? this.projects.filter((project) => project.ownerId === ownerId) : this.projects;
    return structuredClone(projects.map((project) => ({ ...project, available: projectDirectoryAvailable(project.path) })));
  }

  async getProject(id, ownerId = null, { requireAvailable = true } = {}) {
    await this.ready;
    const project = this.projects.find((entry) => entry.id === id);
    if (!project || (ownerId && project.ownerId !== ownerId)) throw httpError(404, "项目不存在或已删除。");
    if (requireAvailable && !projectDirectoryAvailable(project.path)) throw httpError(409, "项目目录当前不可用，请恢复目录后重试。");
    return project;
  }

  async createProject(input, ownerId) {
    await this.ready;
    const owner = await this.getUser(ownerId);
    const name = validateProjectName(input.name);
    let path;
    if (Object.hasOwn(input, "path") && String(input.path || "").trim()) {
      const candidate = projectDirectoryPath(input.path);
      if (owner.role !== "admin") requireStrictPathInside(managedUserRoot(this.workspace, owner.username), candidate, "成员只能在自己的项目目录下添加项目。");
      path = await createProjectDirectory(candidate);
      if (owner.role !== "admin") {
        requireStrictPathInside(await realpath(managedUserRoot(this.workspace, owner.username)), path, "成员只能在自己的项目目录下添加项目。");
      }
    } else {
      path = await createManagedProjectDirectory(this.workspace, owner.username, name);
    }
    this.requireUniqueProjectPath(path);
    const project = { ...makeProject({ ...input, name, path }), ownerId };
    this.projects.push(project);
    await this.persist();
    return structuredClone({ ...project, available: true });
  }

  async updateProject(id, input, ownerId = null) {
    const project = await this.getProject(id, ownerId, { requireAvailable: false });
    if (Object.hasOwn(input, "path") && resolve(String(input.path || "")) !== resolve(project.path)) {
      const owner = await this.getUser(project.ownerId);
      if (owner.role !== "admin") throw httpError(403, "成员不能修改项目目录。");
      if (Object.values(this.queues).some((queue) => queue.some((item) => item.projectId === project.id))) {
        throw httpError(409, "项目仍有等待任务，处理完后才能修改目录。");
      }
      const path = await createProjectDirectory(input.path);
      this.requireUniqueProjectPath(path, project.id);
      for (const [threadId, projectId] of Object.entries(this.threadProjects)) {
        if (projectId !== project.id) continue;
        delete this.threadProjects[threadId];
        this.deleteThreadAccess(threadId);
      }
      project.path = path;
    }
    if (Object.hasOwn(input, "name")) project.name = validateProjectName(input.name);
    if (Object.hasOwn(input, "settings")) project.settings = cleanSettings(input.settings);
    project.updatedAt = new Date().toISOString();
    await this.persist();
    return structuredClone({ ...project, available: projectDirectoryAvailable(project.path) });
  }

  requireUniqueProjectPath(path, exceptProjectId = null) {
    const duplicate = this.projects.find((project) => project.id !== exceptProjectId && samePath(project.path, path));
    if (duplicate) throw httpError(409, `目录已经属于项目“${duplicate.name}”。`);
  }

  async removeProject(id, ownerId = null) {
    await this.ready;
    const index = this.projects.findIndex((project) => project.id === id && (!ownerId || project.ownerId === ownerId));
    if (index === -1) throw httpError(404, "项目不存在或已删除。");
    if (Object.values(this.queues).some((queue) => queue.some((item) => item.projectId === id))) {
      throw httpError(409, "项目仍有等待任务，处理完后才能删除。");
    }
    const [project] = this.projects.splice(index, 1);
    for (const [threadId, projectId] of Object.entries(this.threadProjects)) {
      if (projectId !== id) continue;
      delete this.threadProjects[threadId];
      this.deleteThreadAccess(threadId);
    }
    await this.persist();
    return structuredClone(project);
  }

  async hasUsers() {
    await this.ready;
    return this.users.length > 0;
  }

  async createFirstAdmin(input) {
    await this.ready;
    if (this.users.length > 0) throw httpError(409, "管理员已经创建。");
    if (this.projects.length > 0 || Object.keys(this.queues).length > 0 || Object.keys(this.threadSettings).length > 0) {
      throw httpError(409, "检测到尚未迁移的旧版工作台数据，不能将其自动归给新管理员。");
    }
    const user = await makeStoredUser({ ...input, role: "admin" });
    const defaultProjectPath = await createManagedProjectDirectory(this.workspace, user.username, "默认项目");
    const defaultProject = { ...makeProject({ name: "默认项目", path: defaultProjectPath }), ownerId: user.id };
    this.users.push(user);
    this.projects.push(defaultProject);
    await this.persist();
    return publicUser(user);
  }

  async listUsers() {
    await this.ready;
    return this.users.map(publicUser);
  }

  async getUser(id) {
    await this.ready;
    const user = this.users.find((entry) => entry.id === id);
    if (!user) throw httpError(404, "账号不存在。");
    return user;
  }

  async findUserByUsername(username) {
    await this.ready;
    return this.users.find((user) => user.username === normalizeUsername(username)) || null;
  }

  async createUser(input) {
    await this.ready;
    const username = validateUsername(input.username);
    if (this.users.some((user) => user.username === username)) throw httpError(409, "这个用户名已经被使用。");
    const user = await makeStoredUser({ ...input, username, role: "member", mustChangePassword: true });
    this.users.push(user);
    await this.persist();
    return publicUser(user);
  }

  async setUserPassword(userId, password, { mustChangePassword = false } = {}) {
    const user = await this.getUser(userId);
    const passwordRecord = await hashPassword(validatePassword(password));
    Object.assign(user, passwordRecord, { mustChangePassword, updatedAt: new Date().toISOString() });
    await this.persist();
    return publicUser(user);
  }

  async updateUser(userId, input) {
    const user = await this.getUser(userId);
    if (Object.hasOwn(input, "displayName")) user.displayName = validateDisplayName(input.displayName);
    if (Object.hasOwn(input, "active")) user.active = Boolean(input.active);
    user.updatedAt = new Date().toISOString();
    await this.persist();
    return publicUser(user);
  }

  async setThreadProject(threadId, projectId) {
    await this.ready;
    const existingProject = this.threadProjects[threadId];
    if (existingProject && existingProject !== projectId) throw httpError(409, "聊天已经属于另一个项目。");
    if (existingProject === projectId) return false;
    this.threadProjects[threadId] = projectId;
    await this.persist();
    return true;
  }

  async requireThreadOwner(threadId, ownerId, projectId = null) {
    await this.ready;
    const boundProjectId = this.threadProjects[threadId];
    const project = this.projects.find((entry) => entry.id === boundProjectId);
    if (!project || project.ownerId !== ownerId) throw httpError(404, "聊天不存在或不属于当前账号。");
    if (projectId && boundProjectId !== projectId) throw httpError(404, "聊天不存在或不属于当前项目。");
    return boundProjectId;
  }

  threadIdsForProject(projectId) {
    return Object.entries(this.threadProjects).filter(([, boundProjectId]) => boundProjectId === projectId).map(([threadId]) => threadId);
  }

  async bindProjectThreads(threads, ownerId, projectId) {
    await this.ready;
    const project = this.projects.find((entry) => entry.id === projectId);
    if (!project || project.ownerId !== ownerId) throw httpError(404, "项目不存在或已删除。");
    let changed = false;
    for (const thread of threads) {
      if (!Object.hasOwn(this.threadProjects, thread.id)) {
        this.threadProjects[thread.id] = projectId;
        changed = true;
      }
    }
    if (changed) await this.persist();
    return threads.filter((thread) => this.threadProjects[thread.id] === projectId);
  }

  threadAccess(ownerId, threadId) {
    return this.threadAccesses[ownerId]?.[threadId] || null;
  }

  async recordThreadAccess(ownerId, threadId, { deferred = false } = {}) {
    await this.ready;
    const accessedAt = new Date().toISOString();
    this.threadAccesses[ownerId] ||= {};
    delete this.threadAccesses[ownerId][threadId];
    this.threadAccesses[ownerId][threadId] = accessedAt;
    const entries = Object.entries(this.threadAccesses[ownerId]);
    this.threadAccesses[ownerId] = Object.fromEntries(entries.slice(-300));
    if (deferred) this.deferPersist();
    else await this.persist();
    return accessedAt;
  }

  deferPersist() {
    if (this.deferredPersistTimer) return;
    this.deferredPersistTimer = setTimeout(() => {
      this.deferredPersistTimer = null;
      void this.persist().catch((error) => {
        process.stderr.write(`[data] 无法保存工作区状态：${error.message}\n`);
      });
    }, 200);
    this.deferredPersistTimer.unref?.();
  }

  deleteThreadAccess(threadId) {
    let deleted = false;
    for (const [ownerId, accesses] of Object.entries(this.threadAccesses)) {
      if (!Object.hasOwn(accesses, threadId)) continue;
      delete accesses[threadId];
      if (Object.keys(accesses).length === 0) delete this.threadAccesses[ownerId];
      deleted = true;
    }
    return deleted;
  }

  async getQueueItem(threadId, itemId) {
    await this.ready;
    const item = (this.queues[threadId] || []).find((entry) => entry.id === itemId);
    if (!item) throw httpError(404, "排队任务不存在或已经处理。");
    return structuredClone(item);
  }

  async listQueue(threadId) {
    await this.ready;
    return structuredClone(this.queues[threadId] || []);
  }

  async listQueuedThreadIds() {
    await this.ready;
    return Object.entries(this.queues)
      .filter(([, queue]) => Array.isArray(queue) && queue.length > 0)
      .map(([threadId]) => threadId);
  }

  async getQueueSnapshot(threadId) {
    await this.ready;
    return {
      queue: structuredClone(this.queues[threadId] || []),
      queueRevision: this.queueRevisions[threadId] || 0,
    };
  }

  bumpQueueRevision(threadId) {
    this.queueRevisions[threadId] = (this.queueRevisions[threadId] || 0) + 1;
  }

  async getThreadSettings(threadId, defaults = {}) {
    await this.ready;
    const settings = Object.hasOwn(this.threadSettings, threadId) ? this.threadSettings[threadId] : cleanSettings(defaults);
    return structuredClone(settings);
  }

  async setThreadSettings(threadId, settings) {
    await this.ready;
    this.threadSettings[threadId] = cleanSettings(settings);
    await this.persist();
    return structuredClone(this.threadSettings[threadId]);
  }

  async getTurnMetrics(threadId, turnIds = null) {
    await this.ready;
    const metrics = this.turnMetrics[threadId] || {};
    if (!Array.isArray(turnIds)) return structuredClone(metrics);
    const selected = {};
    for (const turnId of turnIds) if (metrics[turnId]) selected[turnId] = metrics[turnId];
    return structuredClone(selected);
  }

  async recordTurnMetric(threadId, turnId, patch) {
    await this.ready;
    if (!threadId || !turnId) return;
    this.turnMetrics[threadId] ||= {};
    const current = this.turnMetrics[threadId][turnId] || { items: {} };
    this.turnMetrics[threadId][turnId] = { ...current, ...cleanTimingPatch(patch), items: current.items || {} };
    this.pruneTurnMetrics(threadId);
    await this.persist();
  }

  async recordTurnPlan(threadId, turnId, plan) {
    await this.ready;
    if (!threadId || !turnId) return;
    this.turnMetrics[threadId] ||= {};
    const current = this.turnMetrics[threadId][turnId] || { items: {} };
    this.turnMetrics[threadId][turnId] = { ...current, plan: turnPlanSnapshot(plan), items: current.items || {} };
    this.pruneTurnMetrics(threadId);
    await this.persist();
  }

  async recordItemMetric(threadId, turnId, itemId, patch) {
    await this.ready;
    if (!threadId || !turnId || !itemId) return;
    this.turnMetrics[threadId] ||= {};
    const turn = this.turnMetrics[threadId][turnId] || { items: {} };
    turn.items ||= {};
    const current = turn.items[itemId] || {};
    const cleaned = cleanTimingPatch(patch, { includeType: true, includeSnapshot: true });
    if (current.snapshot && cleaned.snapshot) cleaned.snapshot = { ...current.snapshot, ...cleaned.snapshot };
    turn.items[itemId] = { ...current, ...cleaned };
    this.turnMetrics[threadId][turnId] = turn;
    this.pruneTurnMetrics(threadId);
    await this.persist();
  }

  pruneTurnMetrics(threadId) {
    const metrics = this.turnMetrics[threadId];
    if (!metrics) return;
    const turnIds = Object.keys(metrics);
    for (const turnId of turnIds.slice(0, Math.max(0, turnIds.length - 80))) delete metrics[turnId];
  }

  async removeThread(threadId) {
    await this.ready;
    const hadQueue = Object.hasOwn(this.queues, threadId);
    const hadQueueRevision = Object.hasOwn(this.queueRevisions, threadId);
    const hadSettings = Object.hasOwn(this.threadSettings, threadId);
    const hadMetrics = Object.hasOwn(this.turnMetrics, threadId);
    const hadProject = Object.hasOwn(this.threadProjects, threadId);
    const hadAccess = this.deleteThreadAccess(threadId);
    if (hadQueue) delete this.queues[threadId];
    if (hadQueueRevision) delete this.queueRevisions[threadId];
    if (hadSettings) delete this.threadSettings[threadId];
    if (hadMetrics) delete this.turnMetrics[threadId];
    if (hadProject) delete this.threadProjects[threadId];
    if (hadQueue || hadQueueRevision || hadSettings || hadMetrics || hadProject || hadAccess) await this.persist();
  }

  async getSession(token) {
    await this.ready;
    const key = sessionKey(token);
    const session = this.sessions[key];
    if (!session) return null;
    if (session.expiresAt <= Date.now()) {
      delete this.sessions[key];
      await this.persist();
      return null;
    }
    return structuredClone(session);
  }

  async setSession(token, session) {
    await this.ready;
    this.sessions[sessionKey(token)] = structuredClone(session);
    await this.persist();
  }

  async removeSession(token) {
    await this.ready;
    const key = sessionKey(token);
    if (!Object.hasOwn(this.sessions, key)) return;
    delete this.sessions[key];
    await this.persist();
  }

  async removeUserSessions(userId) {
    await this.ready;
    let changed = false;
    for (const [key, session] of Object.entries(this.sessions)) {
      if (session.userId !== userId) continue;
      delete this.sessions[key];
      changed = true;
    }
    if (changed) await this.persist();
  }

  async enqueue(threadId, projectId, text) {
    await this.ready;
    const item = { id: randomUUID(), projectId, text, createdAt: new Date().toISOString() };
    this.queues[threadId] ||= [];
    this.queues[threadId].push(item);
    this.bumpQueueRevision(threadId);
    await this.persist();
    return structuredClone(item);
  }

  async removeQueueItem(threadId, itemId) {
    await this.ready;
    const queue = this.queues[threadId] || [];
    const index = queue.findIndex((item) => item.id === itemId);
    if (index === -1) throw httpError(404, "排队任务不存在。");
    const [item] = queue.splice(index, 1);
    if (queue.length === 0) delete this.queues[threadId];
    this.bumpQueueRevision(threadId);
    await this.persist();
    return structuredClone(item);
  }

  async moveQueueItem(threadId, itemId, direction) {
    await this.ready;
    const queue = this.queues[threadId] || [];
    const index = queue.findIndex((item) => item.id === itemId);
    if (index === -1) throw httpError(404, "排队任务不存在。");
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= queue.length) return structuredClone(queue);
    [queue[index], queue[target]] = [queue[target], queue[index]];
    this.bumpQueueRevision(threadId);
    await this.persist();
    return structuredClone(queue);
  }

  async updateQueueItem(threadId, itemId, text) {
    await this.ready;
    const queue = this.queues[threadId] || [];
    const item = queue.find((entry) => entry.id === itemId);
    if (!item) throw httpError(404, "排队任务不存在或已经开始执行。");
    item.text = text;
    item.updatedAt = new Date().toISOString();
    this.bumpQueueRevision(threadId);
    await this.persist();
    return structuredClone(item);
  }

  async completeQueueItem(threadId, itemId) {
    await this.ready;
    const queue = this.queues[threadId] || [];
    const index = queue.findIndex((item) => item.id === itemId);
    if (index === -1) return false;
    queue.splice(index, 1);
    if (queue.length === 0) delete this.queues[threadId];
    this.bumpQueueRevision(threadId);
    await this.persist();
    return true;
  }

  async persist() {
    const contents = `${JSON.stringify({
      version: STATE_VERSION,
      projects: this.projects,
      queues: this.queues,
      queueRevisions: this.queueRevisions,
      threadSettings: this.threadSettings,
      turnMetrics: this.turnMetrics,
      users: this.users,
      threadProjects: this.threadProjects,
      threadAccesses: this.threadAccesses,
      sessions: this.sessions,
    }, null, 2)}\n`;
    const save = async () => {
      const temporary = `${this.stateFile}.${process.pid}.${randomUUID()}.tmp`;
      await writeFile(temporary, contents, "utf8");
      await rename(temporary, this.stateFile);
    };
    this.persistence = this.persistence.then(save, save);
    await this.persistence;
  }
}

export class AuthService {
  constructor(workspaceStore) {
    this.store = workspaceStore;
    const dataRootIdentity = process.platform === "win32" ? workspaceStore.dataRoot.toLowerCase() : workspaceStore.dataRoot;
    this.cookieName = `${LEGACY_SESSION_COOKIE}_${createHash("sha256").update(dataRootIdentity).digest("hex").slice(0, 12)}`;
    this.loginAttempts = new Map();
  }

  async setupRequired() {
    return !(await this.store.hasUsers());
  }

  async createFirstAdmin(input) {
    if (!(await this.setupRequired())) throw httpError(409, "管理员已经创建。");
    return this.store.createFirstAdmin(input);
  }

  async authenticate(request) {
    const cookies = parseCookies(request.headers.cookie || "");
    for (const cookieName of [this.cookieName, LEGACY_SESSION_COOKIE]) {
      const token = cookies[cookieName];
      if (!token) continue;
      const session = await this.store.getSession(token);
      if (!session) continue;
      let user;
      try {
        user = await this.store.getUser(session.userId);
      } catch {
        await this.store.removeSession(token);
        continue;
      }
      if (!user.active) {
        await this.store.removeSession(token);
        continue;
      }
      return { token, cookieName, session, user };
    }
    return null;
  }

  async login(username, password, remoteAddress) {
    const normalized = normalizeUsername(username);
    const key = `${remoteAddress || "unknown"}:${normalized}`;
    const now = Date.now();
    for (const [attemptKey, entry] of this.loginAttempts) {
      if (entry.lastAttemptAt <= now - LOGIN_ATTEMPT_RETENTION_MS) this.loginAttempts.delete(attemptKey);
    }
    const attempt = this.loginAttempts.get(key);
    if (attempt?.blockedUntil > now) throw httpError(429, "登录尝试过多，请一分钟后再试。");
    const user = await this.store.findUserByUsername(normalized);
    const valid = await verifyPassword(password, user || await dummyUserRecord());
    if (!user || !user.active || !valid) {
      const failures = (attempt?.failures || 0) + 1;
      this.loginAttempts.delete(key);
      this.loginAttempts.set(key, { failures, blockedUntil: failures >= 5 ? now + 60_000 : 0, lastAttemptAt: now });
      while (this.loginAttempts.size > MAX_LOGIN_ATTEMPTS) this.loginAttempts.delete(this.loginAttempts.keys().next().value);
      throw httpError(401, "用户名或密码不正确。");
    }
    this.loginAttempts.delete(key);
    return { user: publicUser(user), ...await this.createSession(user.id) };
  }

  async createSession(userId) {
    const token = randomBytes(32).toString("base64url");
    const csrfToken = randomBytes(24).toString("base64url");
    const expiresAt = Date.now() + SESSION_MAX_AGE_MS;
    await this.store.setSession(token, { userId, csrfToken, expiresAt });
    return { token, csrfToken, expiresAt };
  }

  async destroySession(token) {
    if (token) await this.store.removeSession(token);
  }

  async destroyUserSessions(userId) {
    await this.store.removeUserSessions(userId);
  }
}

function parseCookies(header) {
  const cookies = {};
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      continue;
    }
  }
  return cookies;
}

function sessionKey(token) {
  return createHash("sha256").update(token).digest("base64url");
}

function isStoredSessionRecord(value) {
  return isRecord(value)
    && hasOnlyFields(value, ["userId", "csrfToken", "expiresAt"])
    && typeof value.userId === "string"
    && typeof value.csrfToken === "string"
    && Number.isFinite(value.expiresAt);
}

function normalizeUsername(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function validateUsername(value) {
  const username = normalizeUsername(value);
  if (!/^[a-z0-9][a-z0-9._-]{1,31}$/.test(username)) {
    throw httpError(400, "用户名需为 2–32 位小写字母、数字、点、横线或下划线，并以字母或数字开头。");
  }
  return username;
}

function validateDisplayName(value) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 40) throw httpError(400, "显示名称需为 1–40 个字符。");
  return value.trim();
}

function validatePassword(value) {
  if (typeof value !== "string" || value.length < 6 || value.length > 128) throw httpError(400, "密码需为 6–128 个字符。");
  return value;
}

async function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = await scryptAsync(password, salt, 64);
  return { passwordSalt: salt.toString("base64"), passwordHash: Buffer.from(derived).toString("base64") };
}

export async function verifyPassword(password, user) {
  if (typeof password !== "string" || password.length > 128 || !user?.passwordSalt || !user?.passwordHash) return false;
  const expected = Buffer.from(user.passwordHash, "base64");
  const actual = Buffer.from(await scryptAsync(password, Buffer.from(user.passwordSalt, "base64"), expected.length));
  return timingSafeEqual(expected, actual);
}

let dummyUserPromise;
function dummyUserRecord() {
  dummyUserPromise ||= hashPassword("invalid-login-password").then((record) => ({ ...record, active: false }));
  return dummyUserPromise;
}

async function makeStoredUser(input) {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    username: validateUsername(input.username),
    displayName: validateDisplayName(input.displayName),
    role: input.role === "admin" ? "admin" : "member",
    active: true,
    mustChangePassword: Boolean(input.mustChangePassword),
    ...await hashPassword(validatePassword(input.password)),
    createdAt: now,
    updatedAt: now,
  };
}

function isStoredUser(user) {
  return isRecord(user)
    && /^[0-9a-f-]+$/i.test(user.id)
    && /^[a-z0-9][a-z0-9._-]{1,31}$/.test(user.username)
    && typeof user.displayName === "string" && user.displayName.trim() === user.displayName && user.displayName.length <= 40
    && (user.role === "admin" || user.role === "member")
    && typeof user.active === "boolean"
    && typeof user.mustChangePassword === "boolean"
    && isCanonicalBase64(user.passwordSalt, 16)
    && isCanonicalBase64(user.passwordHash, 64)
    && Number.isFinite(Date.parse(user.createdAt))
    && Number.isFinite(Date.parse(user.updatedAt));
}

export function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    active: user.active,
    mustChangePassword: Boolean(user.mustChangePassword),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export function safeEqualText(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function isCanonicalBase64(value, byteLength) {
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
  const decoded = Buffer.from(value, "base64");
  return decoded.length === byteLength && decoded.toString("base64") === value;
}

function makeProject(input) {
  return {
    id: randomUUID(),
    name: validateProjectName(input.name),
    path: validateProjectPath(input.path),
    settings: cleanSettings(input.settings),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function isProject(project) {
  return isRecord(project)
    && /^[0-9a-f-]+$/i.test(project.id)
    && typeof project.name === "string"
    && project.name.trim() === project.name
    && project.name.length > 0
    && project.name.length <= 80
    && typeof project.path === "string"
    && isAbsolute(project.path)
    && (project.ownerId === undefined || typeof project.ownerId === "string")
    && (project.settings === undefined || isStoredSettings(project.settings))
    && Number.isFinite(Date.parse(project.createdAt))
    && Number.isFinite(Date.parse(project.updatedAt));
}

function projectDirectoryAvailable(path) {
  try {
    return existsSync(path) && statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function validateProjectName(value) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 80) throw httpError(400, "项目名称需为 1–80 个字符。");
  return value.trim();
}

function validateProjectPath(value) {
  if (typeof value !== "string" || !value.trim()) throw httpError(400, "请输入项目的绝对路径。");
  const path = resolve(value.trim());
  if (!existsSync(path) || !statSync(path).isDirectory()) throw httpError(400, "该路径不是这台电脑上的目录。");
  return path;
}

async function createProjectDirectory(value) {
  const path = projectDirectoryPath(value);
  await mkdir(path, { recursive: true });
  if (!statSync(path).isDirectory()) throw httpError(400, "项目路径不是目录。");
  return realpath(path);
}

function projectDirectoryPath(value) {
  if (typeof value !== "string" || !value.trim() || !isAbsolute(value.trim())) {
    throw httpError(400, "项目目录必须是这台电脑上的绝对路径。");
  }
  return resolve(value.trim());
}

export function samePath(left, right) {
  const normalizePath = (value) => process.platform === "win32" ? resolve(value).toLowerCase() : resolve(value);
  return normalizePath(left) === normalizePath(right);
}

function managedUserRoot(workspace, username) {
  return join(workspace, normalizeUsername(username));
}

function requireStrictPathInside(root, candidate, message) {
  const relativePath = relative(resolve(root), resolve(candidate));
  if (!relativePath || relativePath.startsWith(`..${sep}`) || relativePath === ".." || isAbsolute(relativePath)) {
    throw httpError(403, message);
  }
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isStoredQueueItem(item) {
  if (!isRecord(item)
    || !hasOnlyFields(item, ["id", "projectId", "text", "createdAt", "updatedAt"])
    || !/^[0-9a-f-]+$/i.test(item.id)
    || typeof item.projectId !== "string"
    || typeof item.text !== "string"
    || !item.text.trim()
    || item.text.length > 200_000
    || !Number.isFinite(Date.parse(item.createdAt))
    || (item.updatedAt !== undefined && !Number.isFinite(Date.parse(item.updatedAt)))) return false;
  return true;
}

function isLegacyQueueItem(item) {
  if (!isRecord(item)) return false;
  const { delivery, ...current } = item;
  if (!isStoredQueueItem(current)) return false;
  if (delivery === undefined) return true;
  return isRecord(delivery)
    && hasOnlyFields(delivery, ["status", "expectedTurnId", "startedAt"])
    && delivery.status === "steering"
    && /^[0-9a-f-]+$/i.test(delivery.expectedTurnId)
    && Number.isFinite(Date.parse(delivery.startedAt));
}

function hasOnlyFields(record, allowed) {
  return Object.keys(record).every((field) => allowed.includes(field));
}

function isStoredSettings(value) {
  if (!isRecord(value)) return false;
  const allowed = new Set(["model", "effort", "serviceTier", "summary"]);
  return Object.entries(value).every(([key, setting]) => allowed.has(key)
    && typeof setting === "string"
    && setting.trim() === setting
    && setting.length > 0
    && setting.length <= 120);
}

async function createManagedProjectDirectory(workspace, username, projectName) {
  const userRoot = managedUserRoot(workspace, username);
  await mkdir(userRoot, { recursive: true });
  const baseName = safeProjectDirectoryName(projectName);
  let candidate = join(userRoot, baseName);
  let suffix = 2;
  while (existsSync(candidate)) candidate = join(userRoot, `${baseName} (${suffix++})`);
  await mkdir(candidate);
  return candidate;
}

function safeProjectDirectoryName(projectName) {
  const cleaned = Array.from(validateProjectName(projectName)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[ .]+$/g, "")
    .trim()).slice(0, 60).join("");
  if (!cleaned) throw httpError(400, "项目名称无法用作 Windows 文件夹名称。");
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(cleaned)) {
    throw httpError(400, "该项目名称是 Windows 保留名称，请换一个名称。");
  }
  return cleaned;
}

export function cleanSettings(value = {}) {
  const settings = {};
  for (const key of ["model", "effort", "serviceTier", "summary", "collaborationMode"]) {
    const setting = typeof value[key] === "string" ? value[key].trim() : "";
    if (setting.length > 0 && setting.length <= 120) settings[key] = setting;
  }
  return settings;
}

export function cleanTimingPatch(value = {}, { includeType = false, includeSnapshot = false } = {}) {
  const timing = {};
  for (const key of ["startedAt", "completedAt", "durationMs"]) {
    if (value?.[key] === null || value?.[key] === undefined) continue;
    const number = Number(value?.[key]);
    if (Number.isFinite(number) && number >= 0) timing[key] = Math.round(number);
  }
  if (includeType && typeof value?.type === "string" && value.type.length <= 80) timing.type = value.type;
  if (includeSnapshot) {
    const snapshot = commandExecutionSnapshot(value?.snapshot);
    if (snapshot) timing.snapshot = snapshot;
  }
  return timing;
}

function cleanStoredTurnMetrics(value) {
  if (!value || typeof value !== "object") return {};
  const stored = {};
  for (const [threadId, turns] of Object.entries(value)) {
    if (!/^[0-9a-f-]+$/i.test(threadId) || !turns || typeof turns !== "object") continue;
    const cleanedTurns = {};
    for (const [turnId, metric] of Object.entries(turns)) {
      if (!/^[0-9a-f-]+$/i.test(turnId) || !metric || typeof metric !== "object") continue;
      const items = {};
      for (const [itemId, itemMetric] of Object.entries(metric.items || {})) {
        if (typeof itemId !== "string" || !itemId || !itemMetric || typeof itemMetric !== "object") continue;
        items[itemId] = cleanTimingPatch(itemMetric, { includeType: true, includeSnapshot: true });
      }
      cleanedTurns[turnId] = {
        ...cleanTimingPatch(metric),
        ...(metric.plan ? { plan: turnPlanSnapshot(metric.plan) } : {}),
        items,
      };
    }
    if (Object.keys(cleanedTurns).length) stored[threadId] = cleanedTurns;
  }
  return stored;
}

export function mergeSettings(existing = {}, update = {}) {
  const merged = cleanSettings(existing);
  for (const key of ["model", "effort", "serviceTier", "summary", "collaborationMode"]) {
    const setting = typeof update[key] === "string" ? update[key].trim() : null;
    if (update[key] === null || setting === "") delete merged[key];
    else if (setting && setting.length <= 120) merged[key] = setting;
  }
  return merged;
}

export function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
