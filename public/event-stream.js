export const EVENT_STREAM_STALE_AFTER_MS = 70_000;
export const EVENT_STREAM_WATCHDOG_INTERVAL_MS = 15_000;

export function eventStreamNeedsRestart({
  readyState,
  openState = 1,
  closedState = 2,
  lastActivityAt,
  now = Date.now(),
  staleAfterMs = EVENT_STREAM_STALE_AFTER_MS,
} = {}) {
  if (readyState === closedState) return true;
  const activityAt = Number(lastActivityAt);
  if (!Number.isFinite(activityAt) || activityAt <= 0) return true;
  if (readyState === openState && now - activityAt <= staleAfterMs) return false;
  return now - activityAt > staleAfterMs;
}
