import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { createCodexAdapter } from "../server/agents/codex/adapter.mjs";

test("slow quota reads do not hold conversation controls and notify when quota arrives", async (t) => {
  let finishQuota, controls;
  const quota = new Promise(resolve => { finishQuota = resolve; });
  const connection = { events: new EventEmitter(), ensureLoaded: async () => {}, request: async method => {
    if (method === "collaborationMode/list") return { data: [{ mode: "default", model: "test-model" }] };
    if (method === "thread/goal/get") return { goal: null };
    if (method === "account/rateLimits/read") return quota;
    throw new Error(method);
  } };
  const adapter = createCodexAdapter({ connection, store: { threadProjects: { c: "p" }, getProject: async () => ({ settings: {} }), getThreadSettings: async () => ({}) } });
  t.after(() => adapter.close());
  const changes = []; adapter.observe("c", event => changes.push(event));
  const read = adapter.controls("c").then(value => { controls = value; });
  await new Promise(resolve => setImmediate(resolve));
  try {
    assert.equal(controls?.settings["codex.model"], "test-model");
    assert.deepEqual(controls.usage.limits, []);
  } finally { finishQuota({ rateLimits: { primary: { usedPercent: 40 } } }); }
  await read; await new Promise(resolve => setImmediate(resolve));
  assert.ok(changes.some(event => event.kind === "controls.changed"));
  assert.equal((await adapter.controls("c")).usage.limits[0].windows[0].usedPercent, 40);
});

test("reading history and details never attempts to acquire a thread writer", async (t) => {
  const calls = [];
  const connection = { events: new EventEmitter(), ensureLoaded: async () => { throw new Error("must not resume"); }, request: async (method) => {
    calls.push(method);
    if (method === "thread/turns/list") return { data: [{ id: "r", status: "completed" }] };
    if (method === "thread/items/list") return { data: [{ item: { id: "answer", type: "agentMessage", text: "available while another writer is active" } }] };
    throw new Error(method);
  } };
  const adapter = createCodexAdapter({ connection, store: { threadProjects: {} } });
  t.after(() => adapter.close());
  const page = await adapter.readHistory("c");
  assert.equal(page.rows[0].text, "available while another writer is active");
  const detail = await adapter.readDetail("c", { ref: page.rows[0].detailId });
  assert.equal(detail.text, page.rows[0].text);
  assert.ok(!calls.includes("thread/resume"));
});

test("provider-specific input errors are normalized at the adapter boundary", async (t) => {
  let failure = new Error("transport closed");
  const connection = { events: new EventEmitter(), ensureLoaded: async () => {}, request: async (method) => {
    if (method === "collaborationMode/list") return { data: [{ mode: "default", model: "test-model" }] };
    throw failure;
  } };
  const adapter = createCodexAdapter({ connection, store: { threadProjects: {}, getThreadSettings: async () => ({}) } }); t.after(() => adapter.close());
  await assert.rejects(adapter.submit("c", { path: "." }, { id: "i", text: "prompt" }), (error) => error.delivery === "uncertain");
  failure = Object.assign(new Error("no active turn"), { codexResponse: true });
  await assert.rejects(adapter.guide("c", { path: "." }, { id: "i", text: "prompt", runId: "abc" }), (error) => error.delivery === "rejected" && error.code === "inactive-run");
  await assert.rejects(adapter.submit("c", { path: "." }, { id: "i", text: "" }), (error) => error.delivery === "rejected");
});
test("project mutation detects running native sessions even when their history was never selected", async (t) => {
  const calls = [], connection = { events: new EventEmitter(), request: async (method, params) => {
    calls.push({ method, params }); return { data: [{ id: "unselected", status: { type: "active" } }] };
  } };
  const adapter = createCodexAdapter({ connection, store: { threadProjects: {}, getProject: async () => ({ path: "/project" }), threadIdsForProject: () => [] } }); t.after(() => adapter.close());
  assert.equal(await adapter.projectHasActiveThread("p"), true);
  assert.deepEqual(calls.map((call) => call.method), ["thread/list"]); assert.equal(calls[0].params.useStateDbOnly, true);
});

test("control settings remain readable for both native active-writer error formats", async (t) => {
  for (const message of ["thread-store conflict: thread abc already has an active writer", "thread abc already has an active writer"]) {
    const connection = { events: new EventEmitter(), ensureLoaded: async () => { throw new Error(message); }, request: async (method) => {
      if (method === "collaborationMode/list") return { data: [{ mode: "default", model: "test-model", reasoning_effort: "medium" }] };
      if (method === "thread/goal/get") throw Object.assign(new Error("thread not loaded: abc"), { codexResponse: true });
      if (method === "account/rateLimits/read") return {};
      throw new Error(method);
    } };
    const adapter = createCodexAdapter({ connection, store: { threadProjects: { abc: "p" }, getProject: async () => ({ settings: {} }), getThreadSettings: async () => ({}) } });
    t.after(() => adapter.close());
    const result = await adapter.controls("abc");
    assert.equal(result.settings["codex.model"], "test-model");
    assert.equal(result.settings["codex.effort"], "medium");
    await assert.rejects(adapter.submit("abc", {}, { id: "i", text: "prompt" }), /already has an active writer/);
  }
});

test("status metadata omits an unknown title and caches preferred conversations outside the listed page", async (t) => {
  const head = { id: "head", cwd: "D:/project", name: "Newest" }, preferred = { id: "preferred", cwd: "D:/project", name: "Saved title" };
  const events = new EventEmitter(), connection = { events, request: async (method) => {
    if (method === "thread/list") return { data: [head], nextCursor: null };
    if (method === "thread/read") return { thread: preferred };
    if (method === "thread/goal/get") return { goal: null };
    throw new Error(method);
  } };
  const store = { threadProjects: { head: "p", preferred: "p", unknown: "p" }, queues: {}, threadAccesses: { u: { preferred: "2026-11-08T00:00:00Z" } },
    threadAccess: () => null, threadIdsForProject: () => ["head", "preferred"], bindProjectThreads: async (rows) => rows };
  const adapter = createCodexAdapter({ connection, store }); t.after(() => adapter.close());
  assert.equal(Object.hasOwn(adapter.summary("unknown"), "title"), false, "a status patch must not invent a title");
  const page = await adapter.list({ id: "p", path: "D:/project" }, { id: "u" });
  assert.equal(page.preferred.title, "Saved title");
  assert.equal(adapter.summary("preferred").title, "Saved title");
  events.emit("notification", { method: "thread/name/updated", params: { threadId: "preferred", threadName: "Renamed title" } });
  const stale = await adapter.list({ id: "p", path: "D:/project" }, { id: "u" });
  assert.equal(stale.preferred.title, "Renamed title", "a subsequent catalog read cannot undo an explicit name update");
});
