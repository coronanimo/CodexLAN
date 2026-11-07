// Storage validation for existing recovery records. Persistence must not import
// browser modules or depend on a renderer's choices about output and plans.
export function commandExecutionSnapshot(value) {
  if (!value || value.type !== "commandExecution" || typeof value.id !== "string") return null;
  const snapshot = { type: "commandExecution", command: "", cwd: "", status: "inProgress" };
  for (const [key, limit] of Object.entries({ id: Infinity, command: 16384, cwd: 4096, status: 80, source: 80 })) if (typeof value[key] === "string") snapshot[key] = value[key].slice(0, limit);
  if (Number.isInteger(value.exitCode)) snapshot.exitCode = value.exitCode;
  if (Number.isFinite(Number(value.durationMs)) && Number(value.durationMs) >= 0) snapshot.durationMs = Math.round(Number(value.durationMs));
  if (typeof value.aggregatedOutput === "string" && value.aggregatedOutput) snapshot.aggregatedOutput = value.aggregatedOutput.slice(-16384);
  if (value.outputTruncated === true || value.aggregatedOutput?.length > 16384) snapshot.outputTruncated = true;
  return snapshot;
}
export function turnPlanSnapshot(value) {
  const result = { plan: [] };
  if (typeof value?.explanation === "string" && value.explanation) result.explanation = value.explanation;
  for (const entry of Array.isArray(value?.plan) ? value.plan : []) if (typeof entry?.step === "string") result.plan.push({ step: entry.step,
    status: entry.status });
  return result;
}
