import { timestampMilliseconds } from "./elapsed-time.js";

const LOCAL_ITEM_TYPES = new Set(["commandExecution", "fileChange", "imageView", "sleep"]);
const TOOL_ITEM_TYPES = new Set(["mcpToolCall", "dynamicToolCall"]);
const NETWORK_ITEM_TYPES = new Set(["webSearch", "imageGeneration"]);
const NETWORK_TOOL_HINTS = /(?:web|http|browser|chrome|drive|gmail|slack|notion|github|figma|canva|cloudflare|vercel|sentry|semrush|airtable|apollo|asana|atlassian|outlook|sharepoint|teams|stripe|supabase|posthog)/i;

export function executionCategory(item) {
  if (LOCAL_ITEM_TYPES.has(item?.type)) return "local";
  if (NETWORK_ITEM_TYPES.has(item?.type)) return "network";
  if (TOOL_ITEM_TYPES.has(item?.type)) {
    const identity = [item.server, item.namespace, item.tool, item.name].filter(Boolean).join("/");
    return NETWORK_TOOL_HINTS.test(identity) ? "network" : "local";
  }
  return "model";
}

export function executionItemDuration(item, now = Date.now()) {
  const reported = item?.durationMs === null || item?.durationMs === undefined ? null : Number(item.durationMs);
  if (reported !== null && Number.isFinite(reported) && reported >= 0) return Math.round(reported);
  const startedAt = timestampMilliseconds(item?.startedAt);
  if (!startedAt) return null;
  const completedAt = timestampMilliseconds(item?.completedAt);
  return Math.max(0, (completedAt || now) - startedAt);
}

export function summarizeExecutionTiming(turn, items, now = Date.now()) {
  const totalMs = executionItemDuration(turn, now);
  if (totalMs === null) return null;

  const totals = { local: 0, network: 0 };
  const counts = { local: 0, network: 0 };
  const unknown = { local: 0, network: 0 };
  for (const item of items || []) {
    const category = executionCategory(item);
    if (category === "model") continue;
    counts[category] += 1;
    const duration = executionItemDuration(item, now);
    if (duration === null) {
      unknown[category] += 1;
      continue;
    }
    totals[category] += duration;
  }

  const knownMs = totals.local + totals.network;
  if (knownMs > totalMs && knownMs > 0) {
    const scale = totalMs / knownMs;
    totals.local *= scale;
    totals.network *= scale;
  }

  const localMs = Math.round(totals.local);
  const networkMs = Math.round(totals.network);
  const timingComplete = unknown.local === 0 && unknown.network === 0;
  return {
    totalMs,
    localMs,
    networkMs,
    modelMs: timingComplete ? Math.max(0, totalMs - localMs - networkMs) : null,
    localCount: counts.local,
    networkCount: counts.network,
    localUnknownCount: unknown.local,
    networkUnknownCount: unknown.network,
    modelEstimated: timingComplete,
  };
}
