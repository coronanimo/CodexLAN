import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { createConversations } from "../server/conversations.mjs";
import { WorkspaceStore } from "../server/workspace-store.mjs";
import { mergeThreadListPage, mergeThreadSummaryPage } from "../public/workspace.js";
import { LiveThreadState } from "../server/live-thread-state.mjs";

class Stream extends EventEmitter {
  chunks = [];
  writableLength = 0;
  writableEnded = false;
  destroyed = false;
  writeHead() {}
  write(text) { this.chunks.push(text); return true; }
  end() { this.writableEnded = true; this.emit("close"); }
  destroy() { this.destroyed = true; this.end(); }
  get text() { return this.chunks.join(""); }
}

test("reconnect snapshots omit already-read completions and release completed turns", () => {
  const state = new LiveThreadState();
  const emit = (revision, method, params) => state.receive({ revision, method, params: { threadId: "thread", turnId: "turn", ...params } });
  emit(1, "turn/started", { turn: { id: "turn" } });
  emit(2, "item/completed", { item: { id: "old", type: "agentMessage", text: "already in history" }, completedAtMs: 100 });
  emit(3, "item/started", { item: { id: "live", type: "agentMessage", text: "" } });
  emit(4, "item/agentMessage/delta", { itemId: "live", delta: "current text" });
  emit(5, "item/completed", { item: { id: "late", type: "agentMessage", text: "completed during history read" }, completedAtMs: 200 });
  assert.deepEqual(state.items("thread", "turn", 3).map((item) => item.id), ["live", "late"]);
  assert.equal(state.items("thread", "turn", 3)[0].text, "current text");
  emit(6, "turn/completed", { turn: { id: "turn" } });
  assert.deepEqual(state.items("thread", "turn"), []);
});

test("selected SSE gets bodies, background gets activity/control state, reconnect restores active text", async () => {
  const root = await mkdtemp(join(tmpdir(), "codexlan-sync-"));
  const store = new WorkspaceStore({ dataRoot: root, stateFile: join(root, "state.json"), workspace: root, legacyJsonMirror: false });
  const a = "11111111-1111-4111-8111-111111111111", b = "22222222-2222-4222-8222-222222222222", turnId = "33333333-3333-4333-8333-333333333333";
  let canonicalStatus = "idle";
  const codex = { events: new EventEmitter(), state: "ready", loadedThreads: new Set(), request: async (method, params) => method === "thread/read"
    ? { thread: { id: params.threadId, name: "Test", status: params.threadId === a ? canonicalStatus : "idle", turns: [] } } : { goal: null } };
  let conversations;
  const streams = [];
  try {
    await store.ready;
    const user = await store.createFirstAdmin({ username: "test", displayName: "Test", password: "test-only-password" });
    const [project] = await store.listProjects(user.id);
    await store.bindProjectThreads([{ id: a }, { id: b }], user.id, project.id);
    conversations = createConversations({ store, codex });
    const routes = new Map();
    conversations.registerRoutes({ get: (path, handler) => routes.set(path, handler), post() {}, patch() {}, delete() {} });
    const connect = async (id) => {
      const stream = new Stream();
      streams.push(stream);
      await routes.get("/api/events")({ identity: { user, session: { expiresAt: Date.now() + 60_000 } }, codexUrl: new URL(`http://localhost/api/events?scope=workspace&threadId=${id}`) }, stream);
      await delay(0);
      return stream;
    };
    const selected = await connect(a), background = await connect(b);
    const emit = (method, params) => {
      if (method === "turn/started") canonicalStatus = "active";
      if (method === "turn/completed") canonicalStatus = "idle";
      codex.events.emit("notification", { method, params: { threadId: a, turnId, ...params } });
    };
    emit("turn/started", { turn: { id: turnId, status: "inProgress", startedAt: Date.now() } });
    emit("item/started", { item: { id: "message", type: "agentMessage", phase: "commentary", text: "" } });
    for (let index = 0; index < 100; index++) emit("item/agentMessage/delta", { itemId: "message", delta: `piece-${index} ` });
    emit("item/started", { item: { id: "command", type: "commandExecution", command: "echo test", cwd: root, status: "inProgress" } });
    for (let index = 0; index < 100; index++) emit("item/commandExecution/outputDelta", { itemId: "command", delta: `command-output-${index}\n` });
    await delay(140);
    assert.match(selected.text, /piece-99/);
    assert.match(selected.text, /command-output-99/);
    assert.doesNotMatch(background.text, /piece-99|command-output-99|aggregatedOutput/);
    assert.match(background.text, /workspace\/summary/);
    const deltaCount = (selected.text.match(/"method":"item\/agentMessage\/delta"/g) || []).length;
    assert.ok(deltaCount < 5, `expected coalesced text, got ${deltaCount} events`);
    const reconnected = await connect(a);
    assert.match(reconnected.text, /"liveItems"/);
    assert.match(reconnected.text, /piece-0 .*piece-99/);
    assert.match(reconnected.text, /command-output-99/);
    emit("thread/goal/updated", { goal: { status: "active", objective: "full-objective-only-for-selected" } });
    await delay(0);
    assert.match(selected.text, /full-objective-only-for-selected/);
    assert.doesNotMatch(background.text, /full-objective-only-for-selected/);
    assert.match(background.text, /"goal":\{"status":"active"\}/);
    codex.events.emit("serverRequest", { id: "question", method: "item/tool/requestUserInput", params: { threadId: a, turnId, itemId: "44444444-4444-4444-8444-444444444444",
      questions: [{ id: "choice", header: "Choice", question: "继续还是停止？", options: [{ label: "继续", description: "继续执行" }] }] } });
    await delay(0);
    assert.match(background.text, /继续还是停止/);
    emit("turn/completed", { turn: { id: turnId, status: "completed", items: [{ id: "large", text: "not-for-background" }] } });
    await delay(0);
    assert.match(background.text, /"method":"turn\/completed"/);
    assert.doesNotMatch(background.text, /not-for-background/);
    await store.persist({});
    const other = await store.createUser({ username: "other", displayName: "Other", password: "test-only-password" });
    const otherProject = await store.createProject({ name: "Other" }, other.id);
    const foreign = "55555555-5555-4555-8555-555555555555";
    await store.bindProjectThreads([{ id: foreign }], other.id, otherProject.id);
    codex.request = async (method) => method === "thread/list" ? { data: [{ id: foreign, cwd: project.path, name: "foreign-private-name" }], nextCursor: null } : { goal: null };
    const page = await conversations.listProjectThreadPage(project, user, new URLSearchParams("limit=50"));
    assert.equal(page.preferredThread, null, "a recent thread bound to another owner must not bypass ownership filtering");
    assert.doesNotMatch(JSON.stringify(page), /foreign-private-name/);
  } finally {
    conversations?.closeEventStreams();
    for (const stream of streams) stream.end();
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("load more appends in order, deduplicates, and keeps its extent across head refreshes", () => {
  const first = mergeThreadListPage(null, ["a", "b"], "cursor-2", { order: "original" });
  const second = mergeThreadListPage(first, ["b", "c", "d"], "cursor-3", { order: "original", append: true });
  assert.deepEqual(second.ids, ["a", "b", "c", "d"]);
  assert.equal(second.nextCursor, "cursor-3");
  const refreshed = mergeThreadListPage(second, ["new", "a"], "new-head-cursor", { order: "original" });
  assert.deepEqual(refreshed.ids, ["new", "a", "b", "c", "d"]);
  assert.equal(refreshed.nextCursor, "cursor-3");
  const discovered = mergeThreadListPage(refreshed, ["live", ...refreshed.ids].slice(0, 2), refreshed.nextCursor, { order: "original" });
  assert.deepEqual(discovered.ids, ["live", "new", "a", "b", "c", "d"], "a newly discovered live thread must not collapse the expanded list");
  assert.equal(discovered.nextCursor, "cursor-3");
  const end = mergeThreadListPage(refreshed, ["e"], null, { order: "original", append: true });
  assert.equal(mergeThreadListPage(end, ["new", "a"], "head-cursor", { order: "original" }).nextCursor, null);
  const sorted = mergeThreadListPage(end, ["d", "b"], "recent-2", { order: "recent" });
  assert.deepEqual(sorted.ids, ["d", "b"]);
  assert.equal(sorted.nextCursor, "recent-2");
  assert.equal(sorted.expanded, false);
});

test("summary pages retain newer SSE/queue state and full selected Goal fields", () => {
  const old = { id: "a", name: "A", goal: { objective: "full", status: "active" }, queueRevision: 1, queueCount: 1 };
  const incoming = { id: "a", name: "A", goal: { status: "paused" }, goalIsSummary: true, queueRevision: 1, queueCount: 0 };
  const current = { ...old, queueRevision: 2, queueCount: 2 };
  assert.deepEqual(mergeThreadSummaryPage([old], [current], [incoming]), [current]);
  const merged = mergeThreadSummaryPage([current], [current], [incoming])[0];
  assert.equal(merged.queueRevision, 2);
  assert.equal(merged.queueCount, 2);
  assert.equal(merged.goal.objective, "full");
  assert.equal(merged.goal.status, "paused");
  const discovered = mergeThreadSummaryPage([], [{ id: "b", name: null, runtime: { status: "active" } }], [{ id: "b", name: "Real title", runtime: { status: "idle" } }])[0];
  assert.equal(discovered.name, "Real title");
  assert.equal(discovered.runtime.status, "active");
});
