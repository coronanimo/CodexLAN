import assert from "node:assert/strict";
import test from "node:test";
import { CodexCatalog } from "../server/agents/codex/catalog.mjs";

test("catalog preserves preferred access, creation order, cross-project pagination and per-user scope", async () => {
  const projects = [{ id: "a", path: "D:/catalog-a" }, { id: "b", path: "D:/catalog-b" }];
  const threads = [{ id: "a-new", cwd: projects[0].path, name: "Newest", updatedAt: 30 }, { id: "a-used", cwd: projects[0].path, name: "Preferred", updatedAt: 10 }, { id: "b-used", cwd: projects[1].path, name: "Other project", updatedAt: 20 }, { id: "private", cwd: "D:/private", name: "Private" }];
  const calls = [], store = { threadProjects: { "a-new": "a", "a-used": "a", "b-used": "b", private: "private-project" }, threadAccesses: { user: { "a-used": "2026-11-07T10:00:00Z", "b-used": "2026-11-07T11:00:00Z", private: "2026-11-07T12:00:00Z" } }, queues: {},
    threadAccess(user, id) { return this.threadAccesses[user]?.[id] || null; }, threadIdsForProject(projectId) { return Object.keys(this.threadProjects).filter((id) => this.threadProjects[id] === projectId); },
    async bindProjectThreads(rows, userId, projectId) { return rows.filter((row) => this.threadProjects[row.id] === projectId); } };
  const catalog = new CodexCatalog({ request: async (method, params) => { calls.push({ method, params }); if (method === "thread/read") return { thread: threads.find((row) => row.id === params.threadId) }; const rows = threads.filter((row) => !params.cwd || row.cwd === params.cwd); return { data: params.limit === 1 ? [rows.at(-1)] : rows, nextCursor: null }; } }, store);
  const page = await catalog.list(projects[0], { id: "user" });
  assert.deepEqual(page.conversations.map((row) => row.id), ["a-new", "a-used"]); assert.equal(page.preferred.id, "a-used");
  const first = await catalog.listAll(projects, { id: "user" }, { order: "original" });
  assert.deepEqual(first.conversations.map((row) => row.projectId), ["a", "a", "b"]); assert.equal(first.nextCursor, null);
  const access = await catalog.listAll(projects, { id: "user" }, { order: "recent" });
  assert.deepEqual(access.conversations.map((row) => row.id), ["b-used", "a-used"]);
  const native = await catalog.listAll(projects, { id: "user" }, { order: "recent", cursor: access.nextCursor });
  assert.deepEqual(native.conversations.map((row) => row.id), ["a-new"]);
  assert.ok(calls.filter((call) => call.method === "thread/read").every((call) => call.params.includeTurns === false));
  assert.ok(calls.every((call) => call.params.threadId !== "private"));
  await assert.rejects(catalog.listAll(projects, { id: "user" }, { order: "original", cursor: access.nextCursor }), /位置无效/);
});

test("a stored paginated thread refusing metadata reads does not fail the project or recent catalog", async () => {
  const threads = [{ id: "old", cwd: "D:/project", name: "Stored name", updatedAt: 20 }];
  const calls = [], store = { threadProjects: { old: "p" }, threadAccesses: { u: { old: "2026-11-08T00:00:00Z" } }, queues: {}, threadAccess: () => "2026-11-08T00:00:00Z", threadIdsForProject: () => ["old"], bindProjectThreads: async (rows) => rows };
  const catalog = new CodexCatalog({ request: async (method) => { calls.push(method); if (method === "thread/read") throw new Error("thread not loaded: old"); assert.equal(method, "thread/list"); return { data: threads, nextCursor: null }; } }, store);
  const project = { id: "p", path: "D:/project" }, user = { id: "u" };
  const recent = await catalog.listAll([project], user, { order: "recent" });
  assert.equal(recent.conversations[0].title, "Stored name");
  const page = await catalog.list(project, user);
  assert.equal(page.preferred.id, "old"); assert.equal(page.conversations.length, 1);
  assert.ok(!calls.includes("thread/resume"), "catalog metadata must not acquire a native writer");
});
