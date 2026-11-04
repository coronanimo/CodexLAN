import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { createConversations } from "../server/conversations.mjs";

test("temporary model-list failures never validate against the Terra fallback and recover on retry", async (t) => {
  let now = 1000;
  t.mock.method(Date, "now", () => now);
  let attempts = 0;
  const models = [{ id: "gpt-6.1-luna", supportedReasoningEfforts: [{ reasoningEffort: "high" }] }];
  const codex = {
    events: new EventEmitter(),
    request: async (method) => {
      assert.equal(method, "model/list");
      if (++attempts <= 2) throw new Error("temporarily unavailable");
      return { data: models };
    },
  };
  const conversations = createConversations({ store: {}, codex });
  const routes = new Map();
  conversations.registerRoutes({ get: (path, handler) => routes.set(path, handler), post() {}, patch() {}, delete() {} });
  const readModels = async () => {
    let body;
    await routes.get("/api/models")({}, { writeHead() {}, end(value) { body = JSON.parse(value); } });
    return body.models;
  };
  const selected = { model: "gpt-6.1-luna", effort: "high" };
  for (let failure = 0; failure < 2; failure++) {
    assert.equal((await readModels())[0].id, "gpt-5.6-terra");
    assert.deepEqual(await conversations.validateSettings(selected), selected);
    now += 60_001;
  }
  assert.deepEqual(await readModels(), models);
  assert.deepEqual(await conversations.validateSettings(selected), selected);
  assert.equal(attempts, 3);
});
