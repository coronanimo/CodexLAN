import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WorkspaceStore } from "../server/workspace-store.mjs";
import { NativeProjection } from "../server/agents/codex/native-projection.mjs";
import { createCodexAdapter } from "../server/agents/codex/adapter.mjs";
import { CodexHistory } from "../server/agents/codex/history.mjs";
import { encodePosition } from "../server/agents/codex/presentation.mjs";
import { contentReferences } from "../server/agents/codex/content-references.mjs";
import { QueueCoordinator } from "../server/core/queue-coordinator.mjs";

test("unfinished command output survives disconnect and storage reload", async () => {
  const root = await mkdtemp(join(tmpdir(), "codexlan-live-recovery-"));
  const options = { dataRoot: root, stateFile: join(root, "state.json"), workspace: root, legacyJsonMirror: false };
  let store = new WorkspaceStore(options); await store.ready;
  const id = "33333333-3333-4333-8333-333333333333";
  await store.setThreadProject(id, "project");
  const events = new EventEmitter(), adapter = createCodexAdapter({ connection: { events }, store });
  const emit = (method, params) => events.emit("notification", { method, params: { threadId: id, turnId: "r", ...params } });
  emit("item/started", { item: { id: "cmd", type: "commandExecution", command: "work", status: "inProgress" } });
  emit("item/commandExecution/outputDelta", { itemId: "cmd", delta: "retained " });
  emit("item/commandExecution/outputDelta", { itemId: "cmd", delta: "before disconnect" });
  events.emit("offline"); await adapter.close(); await store.persist({}); store.close();
  store = new WorkspaceStore(options); await store.ready;
  assert.equal((await store.getItemMetric(id, "r", "cmd")).snapshot.aggregatedOutput, "retained before disconnect");
  store.close();
});

test("completed live output retires across multiple canonical pages", () => {
  const p = new NativeProjection();
  const items = Array.from({ length: 120 }, (_, i) => ({ id: `cmd${i}`, type: "commandExecution", status: "completed", aggregatedOutput: `saved ${i}` }));
  for (const item of items) p.receive({ method: "item/completed", params: { threadId: "c", turnId: "r", item } });
  p.receive({ method: "turn/completed", params: { threadId: "c", turn: { id: "r", status: "completed" } } });
  for (let i = 0; i < items.length; i += 50) {
    const merged = p.merge("c", [{ id: "r", status: "completed", items: items.slice(i, i + 50) }], p.version, false, true);
    assert.deepEqual(merged[0].items.map(item => item.id), items.slice(i, i + 50).map(item => item.id));
  }
  assert.equal(p.sessions.get("c").runs.has("r"), false);
});

test("long streamed replies keep publishing revisions and reasoning publishes its first heading", () => {
  const p = new NativeProjection(), events = [];
  p.observe("c", e => events.push(e));
  p.receive({ method: "item/agentMessage/delta", params: { threadId: "c", turnId: "r", itemId: "m", delta: "x".repeat(12001) } });
  const first = events.at(-1).upserts[0].row;
  p.receive({ method: "item/agentMessage/delta", params: { threadId: "c", turnId: "r", itemId: "m", delta: "more" } });
  const next = events.at(-1).upserts[0].row;
  assert.equal(next.text.length, 12000); assert.ok(next.revision > first.revision);
  p.receive({ method: "item/started", params: { threadId: "c", turnId: "r", item: { id: "think", type: "reasoning", summary: [] } } });
  p.receive({ method: "item/reasoning/summaryTextDelta", params: { threadId: "c", turnId: "r", itemId: "think", delta: "Reading the code" } });
  const row = events.findLast(e => e.kind === "patch").upserts.find(e => e.row.kind === "execution").row;
  assert.equal(row.title, "Reading the code"); assert.equal(row.autoExpand, true);
});

test("file references preserve fenced and inline code; raw message pages preserve links", async (t) => {
  const code = '```js\nconst example = "[manual](docs/manual.md)";\n```\n`[inline](file.md)`';
  assert.equal(contentReferences(code).text, code);
  assert.deepEqual(contentReferences(code).files, []);
  const text = code + "\n[download](report.md)" + "x".repeat(18000);
  const turn = { id: "r", status: "completed", items: [{ id: "m", type: "agentMessage", text }] };
  const h = new CodexHistory({ request: async method => method === "thread/turns/list" ? { data: [turn] } : { thread: { id: "c", status: "idle" } } }, new NativeProjection(), { reconcileExecutionSupplements: async () => {} });
  t.after(() => h.resources.close());
  const ref = encodePosition({ page: null, run: "r", item: "m" });
  const display = await h.details("c", { ref });
  assert.ok(!display.text.includes("[download](report.md)"));
  const first = await h.details("c", { ref, raw: true });
  const second = await h.details("c", { ref, raw: true, after: first.nextCursor });
  assert.equal(first.text + second.text, text);
  await assert.rejects(h.details("c", { ref, after: first.nextCursor }), /游标不一致/);
});

test("reordering during a delivery probe restarts delivery in the new order", async () => {
  let release, probing = true; const sent = [];
  const queues = { c: [{ id: "a", projectId: "p", text: "a" }, { id: "b", projectId: "p", text: "b" }] };
  const store = { queues, threadProjects: { c: "p" }, getProject: async () => ({ id: "p" }), getQueueSnapshot: async () => queues.c,
    moveQueueItem: async () => { [queues.c[0], queues.c[1]] = [queues.c[1], queues.c[0]]; },
    setQueueDelivery: async (_, id, delivery) => { queues.c.find(i => i.id === id).delivery = delivery; },
    completeQueueItem: async (_, id) => { queues.c.splice(queues.c.findIndex(i => i.id === id), 1); return true; } };
  const agent = { onEvent: () => () => {}, notify() {}, probe: () => probing ? new Promise(resolve => { release = resolve; probing = false; }) : Promise.resolve({ status: "idle" }),
    submit: async (_, __, item) => { sent.push(item.id); }, accepted: () => false };
  const q = new QueueCoordinator(store, agent), first = q.kick("c");
  await Promise.resolve(); await q.edit("c", "b", { direction: "up" }); release({ status: "idle" }); await first;
  await q.jobs.get("c"); assert.deepEqual(sent, ["b"]); assert.deepEqual(queues.c.map(i => i.id), ["a"]);
  await q.close();
});
