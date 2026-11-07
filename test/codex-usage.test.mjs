import assert from "node:assert/strict";
import test from "node:test";
import { CodexUsage } from "../server/agents/codex/usage.mjs";
test("late quota reads preserve newer buckets and explicit null windows", async () => {
  let resolveRead, count = 0;
  const usage = new CodexUsage({ request: () => { count++; return new Promise((resolve) => { resolveRead = resolve; }); } });
  const first = usage.limits(), second = usage.limits();
  usage.update({ limitId: "codex", primary: { usedPercent: 75, windowDurationMins: 300 }, secondary: null });
  usage.update({ limitId: "review", primary: { usedPercent: 10 } });
  resolveRead({ rateLimitsByLimitId: { codex: { limitId: "codex", primary: { usedPercent: 1 }, secondary: { usedPercent: 2 } } } });
  const result = await first; await second;
  assert.equal(count, 1); assert.equal(result[0].windows[0].usedPercent, 75); assert.equal(result[0].windows.length, 1); assert.equal(result[1].id, "review");
});
