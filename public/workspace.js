import { isActiveThreadStatus, threadStatusValue, timestampMilliseconds } from "./elapsed-time.js";

const DEFAULT_MODEL_ID = "gpt-5.6-sol";

export { isActiveThreadStatus, threadStatusValue };

export function threadDisplayName(thread) {
  return (typeof thread?.name === "string" && thread.name.trim())
    || "未命名聊天";
}

export function isActiveThreadRuntime(runtime) {
  return Boolean(runtime?.activeTurnId) || isActiveThreadStatus(runtime?.status);
}

export function recentThreadEntries(projects, threadsByProject, limit = 6) {
  const entries = [];
  for (const project of projects || []) {
    for (const thread of threadsByProject.get(project.id) || []) entries.push({ project, thread });
  }
  entries.sort((left, right) => {
    const rightAccess = timestampMilliseconds(right.thread.accessedAt);
    const leftAccess = timestampMilliseconds(left.thread.accessedAt);
    if (Boolean(rightAccess) !== Boolean(leftAccess)) return rightAccess ? 1 : -1;
    const rightTime = rightAccess || timestampMilliseconds(right.thread.updatedAt) || 0;
    const leftTime = leftAccess || timestampMilliseconds(left.thread.updatedAt) || 0;
    return rightTime - leftTime;
  });
  return entries.slice(0, Math.max(0, limit));
}

export function sidebarThreadEntries(projects, threadsByProject, { view = "projects", order = "original", projectId = null } = {}) {
  const projectEntries = (projects || []).map((project, projectIndex) => ({ project, projectIndex }));
  const entries = [];
  for (const { project, projectIndex } of projectEntries) {
    if (view === "projects" && project.id !== projectId) continue;
    for (const [threadIndex, thread] of (threadsByProject.get(project.id) || []).entries()) {
      entries.push({ project, thread, projectIndex, threadIndex });
    }
  }
  if (order === "recent") {
    entries.sort((left, right) => threadActivityTime(right.thread) - threadActivityTime(left.thread)
      || left.projectIndex - right.projectIndex
      || left.threadIndex - right.threadIndex);
  }
  return entries;
}

export function sidebarProjectEntries(projects, threadsByProject, order = "original") {
  const entries = (projects || []).map((project, projectIndex) => {
    const activity = Math.max(0, ...(threadsByProject.get(project.id) || []).map(threadActivityTime));
    return { project, projectIndex, activity };
  });
  if (order === "recent") entries.sort((left, right) => right.activity - left.activity || left.projectIndex - right.projectIndex);
  return entries.map(({ project }) => project);
}

function threadActivityTime(thread) {
  return timestampMilliseconds(thread?.accessedAt) || timestampMilliseconds(thread?.updatedAt) || 0;
}

export function mergeListedThread(existing, listed) {
  if (!existing) return listed;
  const { turns: listedTurns, ...summary } = listed;
  if (typeof existing.name === "string" && existing.name.trim()
    && !(typeof summary.name === "string" && summary.name.trim())) {
    delete summary.name;
  }
  const existingAccess = timestampMilliseconds(existing.accessedAt);
  const listedAccess = timestampMilliseconds(listed.accessedAt);
  return {
    ...existing,
    ...summary,
    accessedAt: existingAccess > listedAccess ? existing.accessedAt : listed.accessedAt,
  };
}

export function mergeRefreshedThreads(baselineThreads, currentThreads, listedThreads) {
  const baselineById = new Map((baselineThreads || []).map((thread) => [thread.id, thread]));
  const currentById = new Map((currentThreads || []).map((thread) => [thread.id, thread]));
  const listedIds = new Set((listedThreads || []).map((thread) => thread.id));
  const retained = (currentThreads || []).filter((thread) => thread.id.startsWith("local-")
    || (!baselineById.has(thread.id) && !listedIds.has(thread.id)));
  const refreshed = (listedThreads || []).map((listed) => {
    const current = currentById.get(listed.id);
    if (current && baselineById.get(listed.id) !== current) return current;
    return mergeListedThread(current, listed);
  });
  const removedThreadIds = (baselineThreads || [])
    .filter((thread) => !thread.id.startsWith("local-") && !listedIds.has(thread.id))
    .map((thread) => thread.id);
  return { threads: [...retained, ...refreshed], removedThreadIds };
}

export function mergeTurnItems(existingItems, incomingItems) {
  const merged = (existingItems || []).map((item) => ({ ...item }));
  for (const item of incomingItems || []) {
    if (!item?.id) {
      merged.push({ ...item });
      continue;
    }
    const clientId = userMessageClientId(item);
    const index = merged.findIndex((candidate) => candidate?.id === item.id
      || (clientId && userMessageClientId(candidate) === clientId));
    if (index === -1) {
      merged.push({ ...item });
      continue;
    }
    if (item.clientPending && !merged[index].clientPending) continue;
    const updated = { ...merged[index], ...item };
    if (!item.clientPending) delete updated.clientPending;
    merged[index] = updated;
  }
  return merged;
}

export function userMessageClientId(item) {
  if (item?.type !== "userMessage") return null;
  return item.clientId || (item.clientPending ? item.id : null);
}

export function hasCurrentThreadHistory(thread) {
  if (!thread?.history || !Array.isArray(thread.turns)) return false;
  if (thread.historyLive === true) return true;
  const syncedAt = timestampMilliseconds(thread.syncedUpdatedAt);
  const updatedAt = timestampMilliseconds(thread.updatedAt);
  return Boolean(syncedAt) && (!updatedAt || syncedAt >= updatedAt);
}

export function invalidateThreadHistory(thread) {
  if (!thread?.history || !Array.isArray(thread.turns)) return thread;
  return { ...thread, historyLive: false, syncedUpdatedAt: null };
}

export function newThreadSettings({ projectSettings = {}, currentThread = null, projectId = null, models = [] } = {}) {
  const currentBelongsToProject = currentThread?.runtime?.projectId === projectId;
  const inherited = currentBelongsToProject ? currentThread?.settings || {} : {};
  const configured = Object.keys(inherited).length ? inherited : projectSettings || {};
  const model = availableModelId(configured.model, models) || solModelId(models);
  return {
    model,
    effort: configured.effort || "medium",
    serviceTier: configured.serviceTier || "",
    summary: configured.summary || "detailed",
    collaborationMode: configured.collaborationMode || "default",
  };
}

export function visibleServiceTiers(tiers, selectedId = "") {
  const groups = new Map();
  for (const tier of Array.isArray(tiers) ? tiers : []) {
    const id = typeof tier?.id === "string" ? tier.id.trim() : "";
    if (!id || ["default", "standard"].includes(id.toLowerCase())) continue;
    const key = serviceTierKey(tier);
    const existing = groups.get(key);
    if (!existing || id === selectedId || (existing.id !== selectedId && id === "priority")) {
      groups.set(key, tier);
    }
  }
  return [...groups.values()];
}

function serviceTierKey(tier) {
  const id = String(tier?.id || "").toLowerCase();
  const name = String(tier?.name || "").toLowerCase();
  if (["fast", "priority"].includes(id) || ["fast", "priority"].includes(name)) return "accelerated";
  return id;
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

function availableModelId(modelId, models) {
  if (!modelId) return null;
  if (!models.length || models.some((model) => model.id === modelId)) return modelId;
  return null;
}

function solModelId(models) {
  return models.find((model) => model.id === DEFAULT_MODEL_ID)?.id
    || models.find((model) => /(?:^|[-\s])sol$/i.test(`${model.id || ""} ${model.displayName || ""}`))?.id
    || DEFAULT_MODEL_ID;
}
