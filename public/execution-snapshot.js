const MAX_COMMAND_TEXT = 64 * 1024;
const MAX_COMMAND_OUTPUT = 256 * 1024;

export function commandExecutionSnapshot(item) {
  if (item?.type !== "commandExecution" || typeof item.id !== "string") return null;
  const snapshot = {
    id: item.id,
    type: "commandExecution",
    command: clippedText(item.command, MAX_COMMAND_TEXT),
    cwd: clippedText(item.cwd, 4_096),
    status: clippedText(item.status, 80) || "inProgress",
  };
  if (typeof item.source === "string") snapshot.source = clippedText(item.source, 80);
  if (typeof item.aggregatedOutput === "string") snapshot.aggregatedOutput = clippedOutput(item.aggregatedOutput);
  if (Number.isInteger(item.exitCode)) snapshot.exitCode = item.exitCode;
  if (Number.isFinite(Number(item.durationMs)) && Number(item.durationMs) >= 0) snapshot.durationMs = Math.round(Number(item.durationMs));
  return snapshot;
}

export function activeExecutionSnapshots(turnMetric, turnId) {
  if (!turnId || !turnMetric?.items) return [];
  return Object.values(turnMetric.items)
    .filter((metric) => metric?.snapshot && metric.startedAt != null && metric.completedAt == null)
    .map((metric) => ({ ...metric.snapshot, ...metric, turnId }));
}

function clippedText(value, limit) {
  return typeof value === "string" ? value.slice(0, limit) : "";
}

function clippedOutput(value) {
  if (value.length <= MAX_COMMAND_OUTPUT) return value;
  return `[较早输出已省略]\n${value.slice(-MAX_COMMAND_OUTPUT)}`;
}
