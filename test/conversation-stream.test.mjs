import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { createConversations } from "../server/conversations.mjs";

const threadId = "11111111-1111-4111-8111-111111111111";

function streamHarness() {
  let resolveRead, rejectRead;
  const pendingRead = new Promise((resolve, reject) => { resolveRead = resolve; rejectRead = reject; });
  const store = {
    ready: Promise.resolve(), projects: [{ id: "project", ownerId: "user" }],
    canAccessProject: (project, userId) => project?.ownerId === userId,
    threadProjects: { [threadId]: "project" }, turnMetrics: {}, queues: {}, queueRevisions: {}, asyncInputAnswers: {},
    requireThreadOwner: async () => {}, listQueuedThreadIds: async () => [], recordTurnMetric: async () => {},
  };
  const codex = { state: "ready", events: new EventEmitter(), request: () => pendingRead };
  const routes = new Map();
  createConversations({ store, codex }).registerRoutes({
    get: (path, handler) => routes.set(path, handler), post() {}, patch() {}, delete() {},
  });
  const response = new EventEmitter();
  response.writableLength = 0;
  response.chunks = [];
  response.writeHead = (status) => { response.status = status; };
  response.write = (chunk) => { response.chunks.push(chunk); return true; };
  response.end = () => { response.writableEnded = true; response.emit("close"); };
  return {
    response, codex, resolveRead, rejectRead,
    open: () => routes.get("/api/events")({
      identity: { user: { id: "user" }, session: { expiresAt: Date.now() + 60_000 } },
      codexUrl: new URL(`http://localhost/api/events?scope=workspace&threadId=${threadId}`),
    }, response),
  };
}

test("SSE opens before rollout I/O and a late idle read cannot overwrite a started turn", async (t) => {
  const harness = streamHarness();
  t.after(() => harness.response.end());
  await harness.open();
  assert.equal(harness.response.status, 200);
  assert.match(harness.response.chunks.join(""), /event: server/);
  harness.codex.events.emit("notification", { method: "turn/started", params: { threadId, turn: { id: "turn", status: "inProgress" } } });
  await new Promise(setImmediate);
  const beforeRead = harness.response.chunks.length;
  assert.match(harness.response.chunks.join(""), /"status":"running"/);
  harness.resolveRead({ thread: { status: "idle" } });
  await new Promise(setImmediate);
  assert.equal(harness.response.chunks.length, beforeRead);
});

test("an empty new rollout does not close or reject the established SSE connection", async (t) => {
  const harness = streamHarness();
  t.after(() => harness.response.end());
  await harness.open();
  harness.rejectRead(new Error("rollout at new.jsonl is empty"));
  await new Promise(setImmediate);
  assert.equal(harness.response.status, 200);
  assert.notEqual(harness.response.writableEnded, true);
  assert.match(harness.response.chunks.join(""), /workspace\/state/);
});

test("a reconnect still recovers canonical running status in the background", async (t) => {
  const harness = streamHarness();
  t.after(() => harness.response.end());
  await harness.open();
  harness.resolveRead({ thread: { status: "running" } });
  await new Promise(setImmediate);
  assert.match(harness.response.chunks.join(""), /"status":"running"/);
});
