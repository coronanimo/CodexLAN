function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function boundedPercent(value) {
  const number = finiteNumber(value);
  if (number === null) return null;
  return Math.max(0, Math.min(100, number));
}

export function contextWindowUsage(tokenUsage) {
  const usedTokens = finiteNumber(tokenUsage?.last?.totalTokens);
  const contextWindow = finiteNumber(tokenUsage?.modelContextWindow);
  if (usedTokens === null || usedTokens < 0 || contextWindow === null || contextWindow <= 0) return null;
  return {
    usedTokens,
    contextWindow,
    usedPercent: boundedPercent((usedTokens / contextWindow) * 100),
  };
}

export function accountLimitWindows(payload) {
  if (!payload || payload.available === false) return { fiveHour: null, weekly: null };
  const snapshot = payload.rateLimitsByLimitId?.codex || payload.rateLimits || payload;
  const windows = [snapshot?.primary, snapshot?.secondary].filter(Boolean);
  const matchingWindow = (durationMinutes) => {
    const window = windows.find((entry) => finiteNumber(entry.windowDurationMins) === durationMinutes);
    const usedPercent = boundedPercent(window?.usedPercent);
    if (!window || usedPercent === null) return null;
    return { usedPercent, resetsAt: finiteNumber(window.resetsAt) };
  };
  return {
    fiveHour: matchingWindow(300),
    weekly: matchingWindow(10_080),
  };
}
