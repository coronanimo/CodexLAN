import assert from "node:assert/strict";
import test from "node:test";
import { QueueCoordinator } from "../server/core/queue-coordinator.mjs";

function fixture(error) {
  const queues = { c: [{ id: "input", projectId: "p", text: "one" }, { id: "second", projectId: "p", text: "two" }] };
  let submissions = 0;
  const agent = { onEvent: () => () => {}, notify() {}, probe: async () => ({ status: "idle" }),
    submit: async () => { submissions++; if (error) throw error; }, accepted: () => false };
  const store = { queues, threadProjects: { c: "p" }, getProject: async () => ({ id: "p" }), getQueueSnapshot: async () => queues.c,
    setQueueDelivery: async (id, itemId, value) => { const item = queues[id].find((item) => item.id === itemId); if (value) item.delivery = value; else delete item.delivery; },
    completeQueueItem: async (id, itemId) => { const index = queues[id].findIndex((item) => item.id === itemId); if (index < 0) return false; queues[id].splice(index, 1); return true; },
    listQueuedThreadIds: async () => ["c"] };
  return { queue: new QueueCoordinator(store, agent), store, submissions: () => submissions };
}
test("an uncertain submission stays first and never replays on completion or restart", async () => {
  const f = fixture(new Error("transport timeout"));
  await f.queue.kick("c");
  assert.equal(f.store.queues.c[0].delivery.status, "uncertain");
  await f.queue.kick("c"); await f.queue.recover();
  assert.equal(f.submissions(), 1); assert.equal(f.store.queues.c[0].id, "input");
  await assert.rejects(f.queue.retry("c", "input", false), /核对/);
  assert.throws(() => f.queue.editable("c", "input"), /核对/);
  await f.queue.retry("c", "input", true); await f.queue.jobs.get("c");
  assert.equal(f.submissions(), 2);
  f.queue.close();
});
test("restart changes an interrupted delivery to uncertain without replaying", async () => {
  const f = fixture(); f.store.queues.c[0].delivery = { status: "submitting" };
  await f.queue.recover(); await f.queue.jobs.get("c");
  assert.equal(f.store.queues.c[0].delivery.status, "uncertain"); assert.equal(f.submissions(), 0); f.queue.close();
});
test("definite rejection can be retried explicitly while acceptance removes exactly one identity", async () => {
  const f = fixture(); f.store.queues.c[0].delivery = { status: "rejected" };
  await f.queue.retry("c", "input", false); await f.queue.jobs.get("c");
  assert.equal(f.submissions(), 1); assert.deepEqual(f.store.queues.c.map((item) => item.id), ["second"]); f.queue.close();
});
