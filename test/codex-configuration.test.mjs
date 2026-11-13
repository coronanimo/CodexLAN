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
  assert.deepEqual(fields.filter((field) => field.surface === "composer").map((field) => field.role), ["model", "reasoning", "service-tier"]);
  assert.deepEqual(fields.find((field) => field.role === "reasoning").choiceSource.values["actual-model"], [{ value: "high", label: "高" }]);
  assert.equal(fields.find((field) => field.role === "summary").surface, "settings");
  const effective = await configuration.resolve({ model: "actual-model", effort: "high", collaborationMode: "plan" });
  assert.equal(effective.collaboration.settings.model, "actual-model"); assert.equal(effective.collaboration.mode, "plan");
  await assert.rejects(configuration.resolve({ model: "invented" }), /不可用/);
  await assert.rejects(configuration.resolve({ effort: "unsupported" }), /推理深度/);
  await assert.rejects(configuration.resolve({ serviceTier: "unsupported" }), /服务档位/);
  configuration.models.push({ id: "gpt-5.6-sol", displayName: "GPT-5.6 Sol", supportedReasoningEfforts: [{ reasoningEffort: "medium" }], defaultReasoningEffort: "medium" });
  assert.equal((await configuration.fields()).find((field) => field.role === "model").defaultValue, "gpt-5.6-sol");
  assert.equal((await configuration.fields()).find((field) => field.role === "model").choices.find((choice) => choice.value === "gpt-5.6-sol").label, "5.6 Sol");
});
