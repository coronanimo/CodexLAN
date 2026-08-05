export function timestampMilliseconds(value) {
  if (typeof value === "string" && Number.isNaN(Number(value))) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  return number < 1_000_000_000_000 ? Math.round(number * 1000) : Math.round(number);
}

export function elapsedTiming(timing = {}) {
  const startedAt = timestampMilliseconds(timing.startedAt);
  const completedAt = timestampMilliseconds(timing.completedAt);
  const reportedDuration = timing.durationMs === null || timing.durationMs === undefined ? null : Number(timing.durationMs);
  const status = String(timing.status || timing.turnStatus || "").toLowerCase();
  const running = ["active", "running", "inprogress", "started", "pending"].includes(status);
  const durationMs = !running && reportedDuration !== null && Number.isFinite(reportedDuration) && reportedDuration >= 0
    ? Math.round(reportedDuration)
    : null;
  return { startedAt, completedAt, durationMs, final: Boolean(completedAt || durationMs !== null) };
}

export function formatElapsed(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = String(totalMinutes % 60).padStart(2, "0");
  const hours = Math.floor(totalMinutes / 60);
  return hours ? `${hours}:${minutes}:${seconds}` : `${minutes}:${seconds}`;
}

export function formatDuration(milliseconds) {
  const value = Math.max(0, Math.round(Number(milliseconds) || 0));
  if (value < 1000) return `${value} ms`;
  if (value < 10_000) return `${(Math.round(value / 100) / 10).toFixed(1)} 秒`;
  if (value < 60_000) return `${Math.round(value / 1000)} 秒`;
  return formatElapsed(value);
}
