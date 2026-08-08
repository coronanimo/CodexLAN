import { timestampMilliseconds } from "./elapsed-time.js";
import { isActiveThreadStatus } from "./elapsed-time.js";

const MAX_COMMAND_TEXT = 16 * 1024;
const MAX_PROCESS_COPY_ITEM = 16 * 1024;
export const MAX_SAVED_COMMAND_OUTPUT = 16 * 1024;
export const MAX_LIVE_COMMAND_OUTPUT = 64 * 1024;

export function commandOutputTail(previous, appended, limit = MAX_LIVE_COMMAND_OUTPUT) {
  const combined = `${previous || ""}${appended || ""}`;
  return {
    text: combined.length > limit ? combined.slice(-limit) : combined,
    truncated: combined.length > limit,
  };
}

export function commandDisplayText(value) {
  const command = String(value || "").trim();
  const shell = command.match(/^(?:"[^"\r\n]*\b(?:pwsh|powershell)(?:\.exe)?"|[^\r\n]*?\b(?:pwsh|powershell)(?:\.exe)?)(?:\s+|$)([\s\S]*)$/i);
  if (!shell) return command;
  const argumentsText = shell[1].trim();
  const commandFlag = /(?:^|\s)-(?:command|c)(?:\s+|$)/i.exec(argumentsText);
  const payload = commandFlag
    ? argumentsText.slice(commandFlag.index + commandFlag[0].length).trim()
    : argumentsText;
  if (payload.length >= 2 && payload[0] === payload.at(-1) && ["\"", "'"].includes(payload[0])) {
    return payload.slice(1, -1).trim();
  }
  return payload || command;
}

export function fileChangeUpdateItem(current, params = {}) {
  return {
    ...(current || {}),
    id: params.itemId,
    type: "fileChange",
    changes: Array.isArray(params.changes) ? params.changes : [],
    status: "inProgress",
    startedAt: current?.startedAt || params.startedAtMs,
  };
}

export function isExecutionItem(item) {
  return Boolean(item && !["userMessage", "agentMessage", "plan"].includes(item.type));
}

export function terminalExecutionStatus(status) {
  const value = String(status || "").toLowerCase();
  if (["failed", "error", "declined"].includes(value)) return "failed";
  if (["interrupted", "cancelled"].includes(value)) return "interrupted";
  return "completed";
}

export function mergeHistoricalExecutionItem(item, metric, turnStatus) {
  const merged = { ...item, ...(metric || {}) };
  if (!isActiveThreadStatus(turnStatus) && isActiveThreadStatus(merged.status)) {
    merged.status = terminalExecutionStatus(item?.status);
  }
  return merged;
}

export function reconcileStaleExecutionTurn(turn, runtime, now = Date.now()) {
  if (!turn) return turn;
  const runtimeMatchesTurn = isActiveThreadStatus(runtime?.status) && runtime?.activeTurnId === turn.id;
  if (runtimeMatchesTurn) return isActiveThreadStatus(turn.status) ? turn : { ...turn, status: "inProgress" };
  const staleTurn = isActiveThreadStatus(turn.status);
  const turnStatus = staleTurn ? "interrupted" : turn.status;
  const completedAt = timestampMilliseconds(turn.completedAt) || (staleTurn ? now : null);
  let changed = staleTurn;
  const items = (turn.items || []).map((item) => {
    const active = isActiveThreadStatus(item?.status);
    const status = active ? terminalExecutionStatus(turnStatus) : item?.status;
    const unfinishedTiming = isExecutionItem(item)
      && timestampMilliseconds(item?.startedAt)
      && !timestampMilliseconds(item?.completedAt)
      && (item?.durationMs === null || item?.durationMs === undefined);
    if (!active && !(unfinishedTiming && completedAt)) return item;
    changed = true;
    return {
      ...item,
      ...(active ? { status } : {}),
      ...(unfinishedTiming && completedAt ? { completedAt } : {}),
    };
  });
  if (!changed) return turn;
  return {
    ...turn,
    status: turnStatus,
    ...(staleTurn && completedAt ? { completedAt } : {}),
    items,
  };
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

  let commandMs = 0;
  let commandCount = 0;
  let commandUnknownCount = 0;
  for (const item of (items || []).filter((entry) => entry?.type === "commandExecution")) {
    commandCount += 1;
    const duration = executionItemDuration(item, now);
    if (duration === null) {
      commandUnknownCount += 1;
      continue;
    }
    commandMs += duration;
  }
  commandMs = Math.min(totalMs, Math.round(commandMs));
  return {
    totalMs,
    commandMs,
    commandCount,
    commandUnknownCount,
    codexMs: commandUnknownCount === 0 ? totalMs - commandMs : null,
  };
}

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
  if (typeof item.aggregatedOutput === "string" && item.aggregatedOutput) {
    snapshot.aggregatedOutput = item.aggregatedOutput.slice(-MAX_SAVED_COMMAND_OUTPUT);
    if (item.outputTruncated || item.aggregatedOutput.length > MAX_SAVED_COMMAND_OUTPUT) snapshot.outputTruncated = true;
  }
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

export function restoreMissingExecutionItems(items, metricItems) {
  const source = metricItems && typeof metricItems === "object" ? metricItems : {};
  const restored = (items || []).map((item) => mergeCapturedExecutionItem(item, source[item?.id]));
  const knownIds = new Set(restored.map((item) => item?.id).filter(Boolean));
  const missing = Object.entries(source)
    .filter(([itemId, metric]) => !knownIds.has(itemId) && metric?.snapshot?.type === "commandExecution")
    .map(([itemId, metric]) => {
      const { snapshot, ...timing } = metric;
      return {
        ...snapshot,
        id: itemId,
        ...timing,
        status: metric.status || (metric.completedAt != null || metric.durationMs != null ? "completed" : "inProgress"),
      };
    })
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

function mergeCapturedExecutionItem(item, metric) {
  const snapshot = metric?.snapshot;
  if (!snapshot || snapshot.type !== item?.type) return item;
  const merged = { ...snapshot, ...item };
  for (const key of ["command", "cwd", "aggregatedOutput"]) {
    if (!merged[key] && snapshot[key]) merged[key] = snapshot[key];
  }
  if (snapshot.outputTruncated) merged.outputTruncated = true;
  return merged;
}

export function executionItemText(item = {}) {
  if (typeof item.displayText === "string") return item.displayText;
  if (item.type === "agentMessage") return item.text || "";
  if (item.type === "reasoning") return uniqueText([...(item.summary || []), ...(item.content || [])]).join("\n\n");
  if (item.type === "commandExecution") return [
    item.cwd && `目录：${item.cwd}`,
    item.command,
    item.aggregatedOutput,
    item.exitCode !== null && item.exitCode !== undefined && `退出码：${item.exitCode}`,
  ].filter(Boolean).join("\n\n");
  if (item.type === "fileChange") return (item.changes || [])
    .map((change) => [change.path, change.diff].filter(Boolean).join("\n"))
    .join("\n\n");
  if (item.type === "mcpToolCall") return [
    item.arguments && `参数\n${stringify(item.arguments)}`,
    item.result && `结果\n${stringify(item.result)}`,
    item.error && `错误\n${stringify(item.error)}`,
  ].filter(Boolean).join("\n\n");
  if (item.type === "dynamicToolCall") return [
    item.arguments && `参数\n${stringify(item.arguments)}`,
    item.contentItems && `结果\n${stringify(item.contentItems)}`,
  ].filter(Boolean).join("\n\n");
  if (item.type === "collabAgentToolCall") return [
    item.prompt,
    item.receiverThreadIds?.length && `目标：${item.receiverThreadIds.join(", ")}`,
    item.agentsStates && stringify(item.agentsStates),
  ].filter(Boolean).join("\n\n");
  if (item.type === "subAgentActivity") return [item.kind, item.agentPath, item.agentThreadId].filter(Boolean).join("\n");
  if (item.type === "webSearch") return [item.query, item.action && stringify(item.action)].filter(Boolean).join("\n\n");
  if (item.type === "imageView") return item.path || "";
  if (item.type === "imageGeneration") return "生成图片";
  if (item.type === "contextCompaction") return "整理聊天上下文";
  if (item.type === "sleep") return `等待时长：${item.durationMs || 0} ms`;
  return "";
}

export function turnProcessMarkdown({ plan, items } = {}) {
  const sections = [];
  const planSection = processPlanMarkdown(plan);
  if (planSection) sections.push(planSection);
  const seen = new Set();
  for (const item of items || []) {
    if (!item || (item.id && seen.has(item.id))) continue;
    if (item.id) seen.add(item.id);
    const section = processItemMarkdown(item);
    if (section) sections.push(section);
  }
  return sections.join("\n\n").trim();
}

function processPlanMarkdown(value = {}) {
  const entries = Array.isArray(value.plan) ? value.plan : [];
  const explanation = String(value.explanation || "").trim();
  if (!entries.length && !explanation) return "";
  const lines = ["## 计划"];
  if (explanation) lines.push("", explanation);
  if (entries.length) {
    lines.push("");
    for (const entry of entries) {
      const complete = entry.status === "completed";
      const suffix = entry.status === "inProgress" ? "（进行中）" : "";
      lines.push(`- [${complete ? "x" : " "}] ${String(entry.step || "").trim()}${suffix}`);
    }
  }
  return lines.join("\n");
}

function processItemMarkdown(item) {
  if (item.type === "userMessage" || item.type === "plan") return "";
  if (item.type === "agentMessage" && item.phase !== "commentary") return "";
  if (item.type === "agentMessage") {
    const text = limitedProcessText(item.text, false);
    return text ? `### 进度\n\n${text}` : "";
  }
  if (!isExecutionItem(item)) return "";
  const name = processItemName(item);
  let body = executionItemText(item).trim();
  if (item.type === "commandExecution" && item.outputTruncated) {
    body = `…前面的实时命令输出已截断…\n\n${body}`;
  }
  body = limitedProcessText(body, item.type === "commandExecution");
  if (!body) body = `状态：${processStatus(item)}`;
  const language = item.type === "fileChange" ? "diff" : processItemUsesCodeBlock(item) ? "text" : null;
  return `### ${name}\n\n${language ? markdownCodeBlock(body, language) : body}`;
}

function processItemName(item) {
  if (item.type === "reasoning") return "思考";
  if (item.type === "commandExecution") return "命令";
  if (item.type === "fileChange") return "文件修改";
  if (item.type === "mcpToolCall") return compactHeading(`工具 · ${[item.server, item.tool].filter(Boolean).join(" / ") || "调用工具"}`);
  if (item.type === "dynamicToolCall") return compactHeading(`工具 · ${[item.namespace, item.tool].filter(Boolean).join(" / ") || "调用工具"}`);
  if (item.type === "collabAgentToolCall") return "协作";
  if (item.type === "subAgentActivity") return "子任务";
  if (item.type === "webSearch") return "网页搜索";
  if (item.type === "imageView") return "查看图片";
  if (item.type === "imageGeneration") return "生成图片";
  if (item.type === "contextCompaction") return "上下文压缩";
  if (item.type === "sleep") return "等待";
  return "执行记录";
}

function processItemUsesCodeBlock(item) {
  return ["commandExecution", "mcpToolCall", "dynamicToolCall", "collabAgentToolCall", "subAgentActivity"].includes(item.type);
}

function limitedProcessText(value, keepEnd) {
  const text = String(value || "").trim();
  if (text.length <= MAX_PROCESS_COPY_ITEM) return text;
  return keepEnd
    ? `…前面的内容已截断…\n\n${text.slice(-MAX_PROCESS_COPY_ITEM)}`
    : `${text.slice(0, MAX_PROCESS_COPY_ITEM)}\n\n…后面的内容已截断…`;
}

function markdownCodeBlock(value, language) {
  const longest = Math.max(0, ...[...String(value).matchAll(/`+/g)].map((match) => match[0].length));
  const fence = "`".repeat(Math.max(3, longest + 1));
  return `${fence}${language}\n${value}\n${fence}`;
}

function compactHeading(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > 120 ? `${text.slice(0, 120)}…` : text;
}

function processStatus(item) {
  const status = String(item.status || "").toLowerCase();
  if (["failed", "error", "declined"].includes(status) || item.error || Number(item.exitCode) > 0) return "失败";
  if (["interrupted", "cancelled"].includes(status)) return "已停止";
  if (isActiveThreadStatus(status)) return "进行中";
  return "完成";
}

function uniqueText(parts) {
  const seen = new Set();
  return parts.map((part) => String(part || "").trim()).filter((part) => {
    if (!part || seen.has(part)) return false;
    seen.add(part);
    return true;
  });
}

function stringify(value) {
  try {
    return typeof value === "string" ? value : JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function clippedText(value, limit) {
  return typeof value === "string" ? value.slice(0, limit) : "";
}
