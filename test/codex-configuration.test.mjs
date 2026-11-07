import assert from "node:assert/strict";
import test from "node:test";
import { CodexConfiguration } from "../server/agents/codex/configuration.mjs";
test("configuration recovers after failed catalogs without inventing model choices", async () => {
  let fail = true;
  const configuration = new CodexConfiguration({ request: async (method) => {
    if (method === "model/list") { if (fail) throw new Error("offline"); return { data: [{ id: "actual-model", isDefault: true, supportedReasoningEfforts: [{ reasoningEffort: "high" }] }] }; }
    return { data: [{ mode: "default", model: "actual-model" }, { mode: "plan", model: "actual-model" }] };
  } });
  await assert.rejects(configuration.fields(), /offline/); assert.equal(configuration.models.length, 0);
  fail = false; const fields = await configuration.fields(); assert.equal(fields[0].choices[0].value, "actual-model");
  const effective = await configuration.resolve({ model: "actual-model", effort: "high", collaborationMode: "plan" });
  assert.equal(effective.collaboration.settings.model, "actual-model"); assert.equal(effective.collaboration.mode, "plan");
  await assert.rejects(configuration.resolve({ model: "invented" }), /不可用/);
  await assert.rejects(configuration.resolve({ effort: "unsupported" }), /推理深度/);
});
