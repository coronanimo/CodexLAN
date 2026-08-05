import { timestampMilliseconds } from "./elapsed-time.js";

const RESTORABLE_EXECUTION_TYPES = new Set([
  "commandExecution",
  "mcpToolCall",
  "dynamicToolCall",
  "collabAgentToolCall",
  "sleep",
  "imageView",
  "imageGeneration",
]);

export function restoreMissingExecutionItems(items, metricItems) {
  const restored = [...(items || [])];
  const knownIds = new Set(restored.map((item) => item?.id).filter(Boolean));
  const source = metricItems && typeof metricItems === "object" ? metricItems : {};
  const missing = Object.entries(source)
    .filter(([itemId, metric]) => !knownIds.has(itemId) && RESTORABLE_EXECUTION_TYPES.has(metric?.type))
    .map(([itemId, metric]) => ({
      id: itemId,
      type: metric.type,
      ...(metric.snapshot || {}),
      status: metric.status || (metric.completedAt != null || metric.durationMs != null ? "completed" : "inProgress"),
      ...metric,
    }))
    .sort((left, right) => (timestampMilliseconds(left.startedAt) || 0) - (timestampMilliseconds(right.startedAt) || 0));

  for (const item of missing) {
    const startedAt = timestampMilliseconds(item.startedAt);
    let index = startedAt ? restored.findIndex((existing) => {
      const existingStartedAt = timestampMilliseconds(existing?.startedAt)
        || timestampMilliseconds(source[existing?.id]?.startedAt);
      return existingStartedAt && existingStartedAt > startedAt;
    }) : -1;
    if (index < 0) index = restored.findIndex((existing) => existing?.type === "agentMessage" && existing.phase !== "commentary");
    if (index < 0) restored.push(item);
    else restored.splice(index, 0, item);
  }
  return restored;
}

export function alignItemMetrics(items, metricItems) {
  const aligned = new Map();
  const usedMetricIds = new Set();
  const source = metricItems && typeof metricItems === "object" ? metricItems : {};

  for (const item of items || []) {
    if (!item?.id || !source[item.id]) continue;
    aligned.set(item.id, source[item.id]);
    usedMetricIds.add(item.id);
  }

  const candidatesByType = new Map();
  for (const [metricId, metric] of Object.entries(source)) {
    if (usedMetricIds.has(metricId) || !metric?.type) continue;
    const candidates = candidatesByType.get(metric.type) || [];
    candidates.push({ metricId, metric });
    candidatesByType.set(metric.type, candidates);
  }
  for (const candidates of candidatesByType.values()) {
    candidates.sort((left, right) => (timestampMilliseconds(left.metric.startedAt) || 0) - (timestampMilliseconds(right.metric.startedAt) || 0));
  }

  for (const item of [...(items || [])].reverse()) {
    if (!item?.id || aligned.has(item.id) || !item.type) continue;
    const candidates = candidatesByType.get(item.type);
    const candidate = candidates?.pop();
    if (candidate) aligned.set(item.id, candidate.metric);
  }
  return aligned;
}
