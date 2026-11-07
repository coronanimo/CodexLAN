import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { openConversationStream } from "../server/core/conversation-stream.mjs";
import { PresentationBatcher } from "../server/agents/codex/presentation-batcher.mjs";

function response() {
  const value = new EventEmitter();
  Object.assign(value, { writableLength: 0, chunks: [], writeHead() {},
    write(frame) { this.chunks.push(frame); }, end() { if (!this.writableEnded) { this.writableEnded = true; this.emit("close"); } } });
  return value;
}
const frames = (value) => value.chunks.filter((chunk) => chunk.startsWith("event: lan")).map((chunk) => JSON.parse(chunk.split("data: ")[1]));

test("selected stream bridges overlapping history, sequences updates and stops on access revocation", async () => {
  const res = response();
  let deliver, finish, permitted = true, unsubscribed = false;
  const opening = openConversationStream({ response: res, identity: { session: { expiresAt: Date.now() + 60_000 } }, conversationId: "c",
    canRead: () => permitted, agent: {
      observe(id, listener) { deliver = listener; return () => { unsubscribed = true; }; },
      readHistory: () => new Promise((resolve) => { finish = resolve; }),
    } });
  deliver({ kind: "patch", upserts: [] });
  assert.equal(frames(res).length, 0);
  finish({ conversationId: "c", rows: [], before: null }); await opening;
  assert.deepEqual(frames(res).map((frame) => [frame.kind, frame.sequence]), [["snapshot", 1], ["patch", 2]]);
  permitted = false; deliver({ kind: "patch", upserts: [] });
  assert.equal(frames(res).length, 2); assert.equal(unsubscribed, true); assert.equal(res.writableEnded, true);
});

test("display batching coalesces repeated rows without transferring append authority between runs", () => {
  const batcher = new PresentationBatcher(), events = [];
  batcher.observe("c", (event) => events.push(event));
  for (let index = 0; index < 20; index++) batcher.publish("c", { kind: "patch", appendRun: false, removeIds: [],
    upserts: [{ row: { id: "answer", conversationId: "c", runId: "old", kind: "assistant", text: String(index) } }] });
  batcher.publish("c", { kind: "patch", appendRun: true, removeIds: [], upserts: [{ row: { id: "new-summary", conversationId: "c", runId: "new", kind: "summary", status: "running" } }] });
  batcher.flush(); batcher.close();
  assert.equal(events.length, 2); assert.equal(events[0].upserts.length, 1); assert.equal(events[0].upserts[0].row.text, "19");
  assert.equal(events[0].appendRun, false); assert.equal(events[1].appendRun, true);
});
