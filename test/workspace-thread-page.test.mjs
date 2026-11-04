import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { createConversations } from "../server/conversations.mjs";

function fixture() {
  const projects = [{ id: "project", path: "C:/work/project", available: true, settings: {} }];
  const threads = Array.from({ length: 1000 }, (_, index) => ({
    id: `thread-${index}`, cwd: projects[0].path, name: `Conversation ${index}`,
    createdAt: 2000 - index, updatedAt: 2000 - index, status: "idle",
  }));
  const store = {
    projects, threadProjects: {}, threadAccesses: { user: {} }, queues: {}, queueRevisions: {},
    listProjects: async () => projects,
    threadAccess: (_user, id) => store.threadAccesses.user[id] || null,
    threadIdsForProject: (id) => Object.keys(store.threadProjects).filter((key) => store.threadProjects[key] === id),
    getThreadSettings: async () => ({}),
    bindProjectThreads: async (listed, _user, projectId) => {
      for (const thread of listed) store.threadProjects[thread.id] ||= projectId;
      return listed.filter((thread) => store.threadProjects[thread.id] === projectId);
    },
  };
  const calls = [];
  const codex = {
    events: new EventEmitter(),
    request: async (method, params) => {
      calls.push({ method, params });
      if (method === "thread/list") {
        assert.equal(params.useStateDbOnly, true);
        const matching = threads.filter((thread) => !params.cwd || thread.cwd === params.cwd);
        const start = Number(params.cursor || 0);
        return { data: matching.slice(start, start + params.limit),
          nextCursor: start + params.limit < matching.length ? String(start + params.limit) : null };
      }
      if (method === "thread/read") {
        const thread = threads.find((thread) => thread.id === params.threadId);
        if (!thread) throw new Error("thread not found");
        return { thread };
      }
      if (method === "thread/goal/get") return { goal: null };
      assert.fail(`unexpected request: ${method}`);
    },
  };
  const conversations = createConversations({ store, codex });
  const routes = new Map();
  conversations.registerRoutes({ get: (path, handler) => routes.set(path, handler), post() {}, patch() {}, delete() {} });
  const read = async (query = "order=recent&limit=3") => {
    let body;
    await routes.get("/api/workspace/threads")({ identity: { user: { id: "user" } }, codexUrl: new URL(`http://localhost/api/workspace/threads?${query}`) },
      { writeHead() {}, end(value) { body = JSON.parse(value); } });
    return body;
  };
  return { store, threads, calls, read };
}

test("recent first paint queries one database page rather than all 1000 conversations", async () => {
  const { calls, read } = fixture();
  const first = await read();
  assert.deepEqual(first.pageThreadIds, ["thread-0", "thread-1", "thread-2"]);
  assert.equal(calls.filter((call) => call.method === "thread/list").length, 1);
  assert.equal(calls.filter((call) => call.method === "thread/read").length, 0);
  assert.equal(calls.filter((call) => call.method === "thread/goal/get").length, 3);
  const second = await read(`order=recent&limit=3&cursor=${first.nextCursor}`);
  assert.deepEqual(second.pageThreadIds, ["thread-3", "thread-4", "thread-5"]);
  assert.equal(calls.filter((call) => call.method === "thread/list").length, 2);
});

test("recent accesses stay first, moved threads remain visible, and foreign bindings never leak", async () => {
  const { store, threads, calls, read } = fixture();
  store.threadProjects["thread-900"] = "project";
  store.threadProjects["thread-800"] = "project";
  store.threadProjects["thread-0"] = "foreign-project";
  store.threadAccesses.user = { "thread-900": "2026-11-04T02:00:00Z", "thread-800": "2026-11-04T01:00:00Z", "thread-0": "2026-11-04T03:00:00Z" };
  threads[900].cwd = "C:/moved/outside-project";
  const accessed = await read();
  assert.deepEqual(accessed.pageThreadIds, ["thread-900", "thread-800"]);
  assert.equal(calls.some((call) => call.method === "thread/list"), false);
  const native = await read(`order=recent&limit=3&cursor=${accessed.nextCursor}`);
  assert.deepEqual(native.pageThreadIds, ["thread-1", "thread-2"]);
  assert.equal(native.threads.some((thread) => thread.id === "thread-0"), false);
  assert.equal(calls.some((call) => call.method === "thread/goal/get" && call.params.threadId === "thread-0"), false);
  // An unaccessed moved thread retains its global updated-order position.
  store.threadProjects["thread-3"] = "project";
  threads[3].cwd = "C:/another-moved-path";
  const next = await read(`order=recent&limit=3&cursor=${native.nextCursor}`);
  assert.equal(next.pageThreadIds[0], "thread-3");
});

test("queued conversations outside the page remain present and bad cursors cause no RPC", async () => {
  const { store, calls, read } = fixture();
  store.threadProjects["thread-999"] = "project";
  store.queues["thread-999"] = [{ id: "pending" }];
  const page = await read();
  assert.deepEqual(page.pageThreadIds, ["thread-0", "thread-1", "thread-2"]);
  assert.equal(page.threads.find((thread) => thread.id === "thread-999").queueCount, 1);
  const before = calls.length;
  await assert.rejects(read("order=recent&limit=3&cursor=invalid"), /位置无效/);
  assert.equal(calls.length, before);
});

test("original order retains project paging and adds only a bounded recent preview", async () => {
  const { read, calls } = fixture();
  const first = await read("order=original&limit=3");
  assert.deepEqual(first.pageThreadIds, ["thread-0", "thread-1", "thread-2"]);
  assert.equal(first.threads.length, 30);
  assert.equal(calls.filter((call) => call.method === "thread/list").length, 3);
  assert.equal(calls.filter((call) => call.method === "thread/goal/get").length, 30);
  const second = await read(`order=original&limit=3&cursor=${first.nextCursor}`);
  assert.deepEqual(second.pageThreadIds, ["thread-3", "thread-4", "thread-5"]);
  assert.equal(calls.filter((call) => call.method === "thread/list").length, 4);
});

test("a paged active conversation keeps its recovered turn and start time", async () => {
  const { store, threads, read } = fixture();
  threads[0].status = "active";
  store.getTurnMetricTimings = async () => ({ "active-turn": { startedAt: 1700000000000 } });
  const page = await read();
  const runtime = page.threads.find((thread) => thread.id === "thread-0").runtime;
  assert.equal(runtime.activeTurnId, "active-turn");
  assert.equal(runtime.startedAt, 1700000000000);
});
