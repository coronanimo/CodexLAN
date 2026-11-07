import assert from "node:assert/strict";
import test from "node:test";
import { NativeProjection } from "../server/agents/codex/native-projection.mjs";

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
