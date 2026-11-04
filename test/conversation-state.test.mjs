import assert from "node:assert/strict";
import test from "node:test";
import { conversationNeedsSnapshot, mergeConversationTurns, reduceConversationEvent, recoveryItems, resetConversationVersions } from "../public/conversation-state.js";
import { LiveThreadState } from "../server/live-thread-state.mjs";
import { mergeHistoricalExecutionItem } from "../public/execution-events.js";

const ids = (turns) => turns[0].items.map((item) => item.id);
const event = (method, params) => ({ method, params: { threadId: "thread", turnId: "turn", ...params } });

test("started owns the slot; late text, completion and repeated projections do not move it", () => {
  const server = new LiveThreadState();
  const started = event("item/started", { item: { id: "a", type: "agentMessage" } });
  server.receive(started);
  server.receive(event("item/started", { item: { id: "b", type: "commandExecution" } }));
  const patch = server.receive(event("item/agentMessage/delta", { itemId: "a", delta: "hello" }));
  let client = mergeConversationTurns([], patch.turns);
  // Reconnect carries the missing command as well as the earlier text slot.
  client = mergeConversationTurns(client, server.snapshot("thread").turns);
  client = mergeConversationTurns(client, patch.turns);
  assert.deepEqual(ids(client), ["a", "b"]);
  assert.equal(client[0].items[0].text, "hello");
  const completed = server.receive(event("item/completed", { item: { id: "a", type: "agentMessage", phase: "final_answer", text: "hello" } }));
  client = mergeConversationTurns(client, completed.turns);
  assert.deepEqual(ids(client), ["a", "b"]);
});

test("history fills holes and owns ordering, retaining observed-only anchored entries", () => {
  const old = [{ id: "t1", items: [{ id: "b" }, { id: "a" }, { id: "pending" }] }, { id: "t3", items: [] }];
  const canonical = [{ id: "t1", items: [{ id: "a" }, { id: "b" }] }, { id: "t2", items: [] }, { id: "t3", items: [] }];
  const merged = mergeConversationTurns(old, canonical, { canonical: true });
  assert.deepEqual(merged.map((turn) => turn.id), ["t1", "t2", "t3"]);
  assert.deepEqual(ids(merged), ["a", "b", "pending"]);
  assert.deepEqual(mergeConversationTurns(merged, [{ id: "t4", items: [] }]).map((turn) => turn.id), ["t1", "t2", "t3", "t4"]);
});

test("overlapping history cannot shorten newer text or reopen completed entries", () => {
  const observed = [{ id: "turn", version: 8, status: "completed", items: [{ id: "a", type: "agentMessage", version: 8, text: "complete", status: "completed", completedAt: 20 }] }];
  const history = [{ id: "turn", version: 6, status: "inProgress", items: [{ id: "a", type: "agentMessage", version: 6, text: "comp", status: "inProgress" }] }];
  const merged = mergeConversationTurns(observed, history, { canonical: true });
  assert.equal(merged[0].status, "completed");
  assert.equal(merged[0].items[0].text, "complete");
  assert.equal(merged[0].items[0].status, "completed");
});

test("plans and cumulative diffs update task state, not transcript order", () => {
  let state = reduceConversationEvent([], event("item/started", { item: { id: "a", type: "commandExecution" } }), 1);
  state = reduceConversationEvent(state, event("turn/plan/updated", { plan: [{ step: "verify", status: "pending" }] }), 2);
  state = reduceConversationEvent(state, event("turn/diff/updated", { diff: "diff" }), 3);
  state = reduceConversationEvent(state, event("item/started", { item: { id: "b", type: "agentMessage", delivery: "async" } }), 4);
  assert.deepEqual(ids(state), ["a", "b"]);
  assert.equal(state[0].task.plan.plan[0].step, "verify");
  assert.equal(state[0].task.diff, "diff");
});

test("turn summary arrays merge supplied facts without dropping earlier entries", () => {
  let state = reduceConversationEvent([], event("turn/started", { turn: { id: "turn", items: [{ id: "u", type: "userMessage" }] } }), 1);
  state = reduceConversationEvent(state, event("item/started", { item: { id: "tool", type: "commandExecution" } }), 2);
  state = reduceConversationEvent(state, event("turn/completed", { turn: { id: "turn", status: "completed", items: [{ id: "final", type: "agentMessage", text: "done" }], itemsView: "summary" } }), 3);
  assert.deepEqual(ids(state), ["u", "tool", "final"]);
  assert.equal(state[0].items[2].text, "done");
});

test("completed turns survive reconnect until canonical history covers actual content", () => {
  const state = new LiveThreadState();
  state.receive(event("item/completed", { item: { id: "a", type: "agentMessage", text: "complete" } }));
  state.receive(event("turn/completed", { turn: { id: "turn", status: "completed", completedAt: 20 } }));
  const stale = [{ id: "turn", status: "completed", items: [{ id: "a", type: "agentMessage", text: "comp" }] }];
  assert.equal(state.reconcile("thread", stale)[0].items[0].text, "complete");
  assert.equal(state.snapshot("thread").turns.length, 1);
  state.reconcile("thread", [{ ...stale[0], items: [{ id: "a", type: "agentMessage", text: "complete" }] }]);
  assert.equal(state.snapshot("thread").turns.length, 0);
});

test("unknown recovery position is explicit instead of guessed from final-answer type", () => {
  const items = [{ id: "final", type: "agentMessage", phase: "final_answer" }];
  const recovered = recoveryItems(items, { command: { snapshot: { type: "commandExecution", command: "verify" } } });
  assert.deepEqual(items.map((item) => item.id), ["final"]);
  assert.equal(recovered[0].recovery, true);
});

test("known canonical commands retain supplemental output without surrendering role or status", () => {
  const item = { id: "command", type: "commandExecution", status: "completed", durationMs: 50 };
  const metric = { status: "inProgress", durationMs: 0, snapshot: { type: "commandExecution", command: "verify", aggregatedOutput: "saved output" } };
  const merged = mergeHistoricalExecutionItem(item, metric, "completed");
  assert.equal(merged.status, "completed");
  assert.equal(merged.durationMs, 50);
  assert.equal(merged.aggregatedOutput, "saved output");
  assert.equal(mergeHistoricalExecutionItem({ id: "message", type: "agentMessage" }, metric, "completed").command, undefined);
});

test("optimistic input is replaced by client id, without duplicate identity", () => {
  const before = [{ id: "turn", items: [{ id: "local", clientPending: true, type: "userMessage" }, { id: "later", type: "agentMessage" }] }];
  const after = mergeConversationTurns(before, [{ id: "turn", items: [{ id: "native", clientId: "local", type: "userMessage" }] }]);
  assert.deepEqual(ids(after), ["native", "later"]);
  const acknowledged = mergeConversationTurns(after, [{ id: "turn", items: [{ id: "local", clientId: "local", clientPending: true, type: "userMessage", inputKind: "guide" }] }]);
  assert.deepEqual(ids(acknowledged), ["native", "later"]);
  assert.equal(acknowledged[0].items[0].inputKind, "guide");
});

test("a concurrent canonical read cannot discard the bridge for an older in-flight read", () => {
  const state = new LiveThreadState();
  const older = state.beginRead("thread");
  state.receive(event("item/completed", { item: { id: "a", type: "agentMessage", text: "done" } }));
  state.receive(event("turn/completed", { turn: { id: "turn", status: "completed", completedAt: 20 } }));
  const complete = [{ id: "turn", status: "completed", items: [{ id: "a", type: "agentMessage", text: "done" }] }];
  state.reconcile("thread", complete);
  assert.equal(state.snapshot("thread").turns.length, 1);
  const stale = [{ id: "turn", status: "inProgress", items: [] }];
  assert.equal(state.reconcile("thread", stale, older.version)[0].items[0].text, "done");
  state.endRead(older);
  state.reconcile("thread", complete);
  assert.equal(state.snapshot("thread").turns.length, 0);
});

test("unknown order ids request a snapshot; epoch reset makes new versions usable", () => {
  const old = [{ id: "turn", version: 100, items: [{ id: "a", type: "agentMessage", version: 100, text: "old" }] }];
  assert.equal(conversationNeedsSnapshot(old, { turns: [{ id: "turn", itemOrder: ["a", "missing"], items: [] }] }), true);
  const fresh = mergeConversationTurns(resetConversationVersions(old), [{ id: "turn", version: 1, items: [{ id: "a", type: "agentMessage", version: 1, text: "new" }] }]);
  assert.equal(fresh[0].items[0].text, "new");
});
