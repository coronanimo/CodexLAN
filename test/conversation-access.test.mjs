import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ConversationAccess } from "../server/core/conversation-access.mjs";
import { QueueCoordinator } from "../server/core/queue-coordinator.mjs";

test("parallel ownership persists and unknown conversations cannot trigger delivery", async () => {
  const root = await mkdtemp(join(tmpdir(), "lan-access-"));
  let access = new ConversationAccess(root, true); await access.load();
  assert.throws(() => access.requireWrite("abc"), /原有会话只读/);
  await access.created("def"); access = new ConversationAccess(root, true); await access.load();
  assert.equal(access.writable("def"), true); assert.equal(access.writable("abc"), false);
  const agent = { onEvent: () => () => {}, notify() {}, probe: () => assert.fail("a read-only conversation must not be probed or resumed for automatic delivery") };
  const queue = new QueueCoordinator({ queues: { abc: [{ id: "pending", text: "old" }] } }, agent, access.writable);
  await queue.kick("abc"); await assert.rejects(queue.enqueue("abc", {}, "old"), /只读/); await queue.close();
  const standard = new ConversationAccess(root, false); await standard.load(); assert.equal(standard.writable("abc"), true);
});
