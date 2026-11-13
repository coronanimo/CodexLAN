import assert from "node:assert/strict";
import test from "node:test";
import { NativeProjection } from "../server/agents/codex/native-projection.mjs";
import { PresentationBatcher } from "../server/agents/codex/presentation-batcher.mjs";

test('canonical history corrects the live order and subsequent anchors without replacing newer text', () => {
  const projection = new NativeProjection(), events = [];
  const receive = (item) => projection.receive({ method: 'item/started', params: { threadId: 'c', turnId: 'r', item } });
  for (const id of ['user', 'answer', 'progress', 'search-1', 'reasoning-1', 'search-2', 'reasoning-2']) receive({ id, type: 'agentMessage', text: id });
  const read = projection.begin('c');
  projection.receive({ method: 'item/agentMessage/delta', params: { threadId: 'c', turnId: 'r', itemId: 'answer', delta: ' latest' } });
  projection.observe('c', event => events.push(event));
  const order = ['user', 'progress', 'search-1', 'reasoning-1', 'search-2', 'reasoning-2', 'answer'];
  const result = projection.merge('c', [{ id: 'r', status: 'inProgress', items: order.map(id => ({ id, type: 'agentMessage', text: id })) }], read.version, true);
  projection.end(read);
  assert.deepEqual(projection.session('c').runs.get('r').order, order);
  assert.equal(result[0].items.at(-1).text, 'answer latest');
  assert.deepEqual(events.flatMap(e => e.placements || []).map(e => JSON.parse(e.id)[2]), order.map(id => `item:${id}`));
  receive({ id: 'next', type: 'webSearch' });
  assert.match(events.at(-1).upserts.at(-1).afterId, /item:answer/);
});

test('older overlapping reads cannot undo a newer canonical position commit', () => {
  const projection = new NativeProjection(), events = [];
  const old = projection.begin('c'), recent = projection.begin('c');
  projection.observe('c', e => events.push(e));
  const turn = ids => [{ id: 'r', status: 'inProgress', items: ids.map(id => ({ id, type: 'agentMessage', text: id })) }];
  projection.merge('c', turn(['progress', 'answer']), recent.version, true);
  const count = events.length;
  projection.merge('c', turn(['answer', 'progress']), old.version, true);
  assert.deepEqual(projection.session('c').runs.get('r').order, ['progress', 'answer']);
  assert.equal(events.length, count);
  projection.end(old); projection.end(recent);
});

test('partial pages retain unseen positions and canonical commits cross the batch boundary in order', () => {
  const projection = new NativeProjection(), batcher = new PresentationBatcher(), delivered = [];
  batcher.observe('c', e => delivered.push(e)); projection.onEvent = (id, e) => batcher.publish(id, e);
  const item = id => ({ id, type: 'agentMessage', text: id });
  for (const id of ['prefix', 'answer', 'progress', 'suffix']) projection.receive({ method: 'item/started', params: { threadId: 'c', turnId: 'r', item: item(id) } });
  const read = projection.begin('c');
  projection.merge('c', [{ id: 'r', status: 'inProgress', items: ['progress', 'answer'].map(item) }], read.version, false, true);
  projection.end(read);
  assert.deepEqual(projection.session('c').runs.get('r').order, ['prefix', 'progress', 'answer', 'suffix']);
  assert.ok(delivered[0].upserts.length);
  assert.ok(delivered.at(-1).placements.length);
  assert.ok(delivered.every(e => e.upserts.length <= 10 && (e.placements?.length || 0) <= 10));
  batcher.close();
});

test('completion coalescing keeps insertion anchors resolvable across transport chunks', () => {
  const projection = new NativeProjection(), batcher = new PresentationBatcher(), delivered = [];
  batcher.observe('c', e => delivered.push(e)); projection.onEvent = (id, e) => batcher.publish(id, e);
  projection.receive({ method: 'turn/started', params: { threadId: 'c', turn: { id: 'r' } } });
  const items = Array.from({ length: 25 }, (_, index) => ({ id: `i-${index}`, type: 'agentMessage', text: `${index}` }));
  for (const item of items) projection.receive({ method: 'item/started', params: { threadId: 'c', turnId: 'r', item } });
  projection.receive({ method: 'turn/completed', params: { threadId: 'c', turn: { id: 'r', status: 'completed', items } } });
  batcher.flush();
  const known = new Set();
  for (const patch of delivered.filter(event => event.kind === 'patch')) for (const entry of patch.upserts) {
    assert.ok(entry.row.kind === 'summary' || known.has(entry.beforeId) || known.has(entry.afterId), `unresolved anchor for ${entry.row.id}`);
    known.add(entry.row.id);
  }
  assert.equal(known.size, 26);
  batcher.close();
});

test('late plan and recovered item receipts preserve a completed footer lifecycle', () => {
  const projection = new NativeProjection(), events = [];
  projection.merge('c', [{ id: 'r', status: 'completed', completedAt: 1700000012000, items: [] }], 0, true);
  projection.observe('c', event => events.push(event));
  projection.receive({ method: 'turn/plan/updated', params: { threadId: 'c', turnId: 'r', plan: [{ step: 'retained', status: 'completed' }] } });
  projection.receive({ method: 'item/completed', params: { threadId: 'c', turnId: 'r', item: { id: 'recovered', type: 'commandExecution', command: 'check', status: 'completed' } } });
  assert.equal(events.findLast(event => event.kind === 'patch').upserts[0].row.status, 'completed');
  const racing = new NativeProjection(), read = racing.begin('c');
  racing.receive({ method: 'item/completed', params: { threadId: 'c', turnId: 'r', item: { id: 'recovered', type: 'commandExecution', status: 'completed' } } });
  assert.equal(racing.merge('c', [{ id: 'r', status: 'completed', items: [] }], read.version)[0].status, 'completed');
  racing.end(read);
});

test("live file updates preserve the original counters without retaining patches or counting updates twice", () => {
  const projection = new NativeProjection(), events = [];
  projection.observe("c", (event) => events.push(event));
  const publish = (diff) => projection.receive({ method: "item/completed", params: { threadId: "c", turnId: "r", item: { id: "f", type: "fileChange", changes: [{ path: "a.ts", diff }] } } });
  publish("@@ -1 +1 @@\n-old\n+new");
  const first = events.findLast((event) => event.kind === "patch").upserts[0].row;
  publish("@@ -1 +1,2 @@\n-old\n+new\n+more");
  const last = events.findLast((event) => event.kind === "patch").upserts[0].row;
  assert.deepEqual(first.changes, { files: 1, added: 1, removed: 1 });
  assert.deepEqual(last.changes, { files: 1, added: 2, removed: 1 });
  assert.ok(!JSON.stringify(projection.sessions.get("c").runs.get("r").items.get("f")).includes("old"));
});

test("a canonical seed supplies the prefix for live deltas and one delta emits only its changed row", () => {
  const projection = new NativeProjection(), events = [];
  projection.merge("c", [{ id: "r", status: "inProgress", items: [{ id: "answer", type: "agentMessage", text: "before " }] }], 0, true, true);
  projection.observe("c", (event) => events.push(event));
  projection.receive({ method: "item/agentMessage/delta", params: { threadId: "c", turnId: "r", itemId: "answer", delta: "after" } });
  assert.equal(events.length, 1); assert.equal(events[0].upserts.length, 1);
  assert.equal(events[0].upserts[0].row.text, "before after"); assert.equal(events[0].appendRun, false);
});

test("a late completion has no append authority; canonical history precedes an explicitly started run", () => {
  const projection = new NativeProjection(), events = [];
  projection.observe("c", (event) => events.push(event));
  projection.receive({ method: "turn/started", params: { threadId: "c", turn: { id: "new", status: "inProgress" } } });
  projection.receive({ method: "turn/completed", params: { threadId: "c", turn: { id: "old", status: "completed" } } });
  assert.equal(events.findLast((event) => event.kind === "patch").appendRun, false);
  assert.deepEqual(projection.merge("c", [{ id: "old", status: "completed", items: [] }], projection.version, true).map((run) => run.id), ["old", "new"]);
});

test("overlapping reads cannot shorten text or erase a completion bridge", () => {
  const projection = new NativeProjection(), read = projection.begin("c");
  projection.receive({ method: "turn/started", params: { threadId: "c", turn: { id: "r" } } });
  projection.receive({ method: "item/completed", params: { threadId: "c", turnId: "r", item: { id: "a", type: "agentMessage", text: "complete answer" } } });
  projection.receive({ method: "turn/completed", params: { threadId: "c", turn: { id: "r", status: "completed" } } });
  const stale = projection.merge("c", [{ id: "r", status: "inProgress", items: [{ id: "a", type: "agentMessage", text: "complete" }] }], read.version);
  assert.equal(stale[0].status, "completed"); assert.equal(stale[0].items[0].text, "complete answer");
  assert.ok(projection.sessions.get("c").runs.has("r")); projection.end(read);
  projection.merge("c", [{ id: "r", status: "completed", items: [{ id: "a", type: "agentMessage", text: "complete answer" }] }], projection.version);
  assert.equal(projection.sessions.get("c").runs.has("r"), false);
});

test("native output bodies are excluded from display state and message retention has a fixed preview bound", () => {
  const projection = new NativeProjection();
  projection.receive({ method: "item/completed", params: { threadId: "c", turnId: "r", item: { id: "tool", type: "mcpToolCall", result: { text: "x".repeat(100_000) }, arguments: "secret payload" } } });
  const tool = projection.sessions.get("c").runs.get("r").items.get("tool");
  assert.equal(tool.result, undefined); assert.equal(tool.arguments, undefined);
  projection.receive({ method: "item/agentMessage/delta", params: { threadId: "c", turnId: "r", itemId: "a", delta: "a".repeat(100_000) } });
  assert.equal(projection.sessions.get("c").runs.get("r").items.get("a").text.length, 12_000);
});

test("canonical native input identity replaces its optimistic alias without a second user row", () => {
  const projection = new NativeProjection();
  projection.receive({ method: "turn/started", params: { threadId: "c", turn: { id: "r" } } });
  projection.receive({ method: "item/started", params: { threadId: "c", turnId: "r", item: { id: "client", clientId: "client", type: "userMessage", content: [{ type: "text", text: "prompt" }] } } });
  const merged = projection.merge("c", [{ id: "r", status: "inProgress", items: [{ id: "native", clientId: "client", type: "userMessage", content: [{ type: "text", text: "prompt" }] }] }], projection.version, true);
  assert.deepEqual(merged[0].items.map((item) => item.id), ["native"]);
});
