import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { createCodexAdapter } from "../server/agents/codex/adapter.mjs";

test("provider-specific input errors are normalized at the adapter boundary", async (t) => {
  let failure = new Error("transport closed");
  const connection = { events: new EventEmitter(), ensureLoaded: async () => {}, request: async (method) => {
    if (method === "collaborationMode/list") return { data: [{ mode: "default", model: "test-model" }] };
    throw failure;
  } };
  const adapter = createCodexAdapter({ connection, store: { threadProjects: {}, getThreadSettings: async () => ({}) } }); t.after(() => adapter.close());
  await assert.rejects(adapter.submit("c", { path: "." }, { id: "i", text: "prompt" }), (error) => error.delivery === "uncertain");
  failure = Object.assign(new Error("no active turn"), { codexResponse: true });
  await assert.rejects(adapter.guide("c", { path: "." }, { id: "i", text: "prompt", runId: "abc" }), (error) => error.delivery === "rejected" && error.code === "inactive-run");
  await assert.rejects(adapter.submit("c", { path: "." }, { id: "i", text: "" }), (error) => error.delivery === "rejected");
});
test("project mutation detects running native sessions even when their history was never selected", async (t) => {
  const calls = [], connection = { events: new EventEmitter(), request: async (method, params) => {
    calls.push({ method, params }); return { data: [{ id: "unselected", status: { type: "active" } }] };
  } };
  const adapter = createCodexAdapter({ connection, store: { threadProjects: {}, getProject: async () => ({ path: "/project" }), threadIdsForProject: () => [] } }); t.after(() => adapter.close());
  assert.equal(await adapter.projectHasActiveThread("p"), true);
  assert.deepEqual(calls.map((call) => call.method), ["thread/list"]); assert.equal(calls[0].params.useStateDbOnly, true);
});
