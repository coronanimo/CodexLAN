import { timestampMilliseconds } from "./elapsed-time.js";

const STORAGE_VERSION = 1;

export function parseTimingState(serialized, maxTurns = 400) {
  let value;
  try {
    value = JSON.parse(serialized || "null");
  } catch {
    value = null;
  }
  if (!value || value.version !== STORAGE_VERSION) {
    return { turnMetrics: new Map(), activeTurnStarts: new Map() };
  }
  const turnMetrics = new Map(validPairs(value.turnMetrics).slice(-maxTurns));
  const activeTurnStarts = new Map(validPairs(value.activeTurnStarts));
  return { turnMetrics, activeTurnStarts };
}

export function serializeTimingState(turnMetrics, activeTurnStarts, maxTurns = 400) {
  return JSON.stringify({
    version: STORAGE_VERSION,
    turnMetrics: [...turnMetrics.entries()].slice(-maxTurns),
    activeTurnStarts: [...activeTurnStarts.entries()],
  });
}

export function resolveActiveTurnStartedAt({ runtime, previousRuntime, metric, saved, now = Date.now() }) {
  const turnId = runtime?.activeTurnId || previousRuntime?.activeTurnId || null;
  const savedMatches = saved && (!saved.turnId || !turnId || saved.turnId === turnId);
  return timestampMilliseconds(runtime?.startedAt)
    || timestampMilliseconds(previousRuntime?.startedAt)
    || timestampMilliseconds(metric?.startedAt)
    || timestampMilliseconds(savedMatches ? saved.startedAt : null)
    || now;
}

function validPairs(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((entry) => Array.isArray(entry) && entry.length === 2 && typeof entry[0] === "string" && entry[0] && entry[1] && typeof entry[1] === "object");
}
