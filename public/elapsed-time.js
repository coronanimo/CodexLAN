const ACTIVE_THREAD_STATUSES = new Set(["active", "running", "inprogress", "started", "pending"]);

export function threadStatusValue(status) {
  return String(typeof status === "string" ? status : status?.type || "").toLowerCase();
}

export function isActiveThreadStatus(status) {
  return ACTIVE_THREAD_STATUSES.has(threadStatusValue(status));
}

export function timestampMilliseconds(value) {
  if (typeof value === "string" && Number.isNaN(Number(value))) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  return number < 1_000_000_000_000 ? Math.round(number * 1000) : Math.round(number);
}

export function conversationDateKey(value) {
  const milliseconds = timestampMilliseconds(value);
  if (!milliseconds) return "";
  const date = new Date(milliseconds);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

export function formatConversationDate(value, now = Date.now()) {
  const milliseconds = timestampMilliseconds(value);
  const currentMilliseconds = timestampMilliseconds(now);
  if (!milliseconds) return "";
  const date = new Date(milliseconds);
  const current = new Date(currentMilliseconds || Date.now());
  const start = new Date(current.getFullYear(), current.getMonth(), current.getDate()).getTime();
  const yesterday = new Date(current.getFullYear(), current.getMonth(), current.getDate() - 1).getTime();
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const calendar = `${date.getMonth() + 1}月${date.getDate()}日`;
  if (day === start) return `今天 · ${calendar}`;
  if (day === yesterday) return `昨天 · ${calendar}`;
  const weekday = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][date.getDay()];
  return date.getFullYear() === current.getFullYear()
    ? `${calendar} · ${weekday}`
    : `${date.getFullYear()}年${calendar} · ${weekday}`;
}

export function formatMessageTime(value, { seconds = false } = {}) {
  const milliseconds = timestampMilliseconds(value);
  if (!milliseconds) return "";
  const date = new Date(milliseconds);
  const fields = [date.getHours(), date.getMinutes(), ...(seconds ? [date.getSeconds()] : [])];
  return fields.map((field) => String(field).padStart(2, "0")).join(":");
}

export function formatMessageDateTime(value) {
  const milliseconds = timestampMilliseconds(value);
  if (!milliseconds) return "";
  const date = new Date(milliseconds);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${formatMessageTime(milliseconds, { seconds: true })}`;
}

export function elapsedTiming(timing = {}) {
  const startedAt = timestampMilliseconds(timing.startedAt);
  const completedAt = timestampMilliseconds(timing.completedAt);
  const reportedDuration = timing.durationMs === null || timing.durationMs === undefined ? null : Number(timing.durationMs);
  const running = isActiveThreadStatus(timing.status || timing.turnStatus);
  const durationMs = !running && reportedDuration !== null && Number.isFinite(reportedDuration) && reportedDuration >= 0
    ? Math.round(reportedDuration)
    : null;
  const final = Boolean(completedAt || durationMs !== null || !running);
  return {
    startedAt: final && !completedAt && durationMs === null ? null : startedAt,
    completedAt,
    durationMs,
    final,
  };
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
