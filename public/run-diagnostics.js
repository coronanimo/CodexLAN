import { isActiveThreadStatus, timestampMilliseconds } from "./elapsed-time.js";

export const RUN_DIAGNOSTIC_SILENCE_MS = 90_000;

const ITEM_LABELS = {
  commandExecution: "正在运行命令",
  fileChange: "正在修改文件",
  mcpToolCall: "正在调用工具",
  dynamicToolCall: "正在调用工具",
  collabAgentToolCall: "正在协作",
  subAgentActivity: "正在执行子任务",
  webSearch: "正在搜索网页",
  imageView: "正在查看图片",
  imageGeneration: "正在生成图片",
  contextCompaction: "正在整理上下文",
  sleep: "正在等待",
};

export function itemActivityLabel(item = {}) {
  const type = String(item.type || "");
  const label = ITEM_LABELS[type] || (type ? `正在处理 ${type}` : "正在处理");
  if (type === "commandExecution" && item.command) return label;
  if ((type === "mcpToolCall" || type === "dynamicToolCall") && (item.server || item.tool)) {
    return `${label} ${[item.server, item.tool].filter(Boolean).join(" / ")}`;
  }
  return label;
}

export function activityFromNotification(method, params = {}, receivedAt = Date.now()) {
  const observedAt = timestampMilliseconds(receivedAt) || Date.now();
  if (method === "turn/started") {
    return { kind: "generating", label: "正在生成", observedAt, activeItem: null };
  }
  if (method === "turn/completed") {
    return { kind: "completed", label: "已结束", observedAt, activeItem: null };
  }
  if (method === "item/started") {
    const item = params.item || {};
    return {
      kind: item.type || "item",
      label: itemActivityLabel(item),
      observedAt,
      activeItem: {
        id: item.id || params.itemId || null,
        type: item.type || null,
        label: itemActivityLabel(item),
        startedAt: timestampMilliseconds(params.startedAtMs) || timestampMilliseconds(item.startedAt) || observedAt,
      },
    };
  }
  if (method === "item/completed") {
    return { kind: "generating", label: "正在生成", observedAt, activeItem: null };
  }
  if (method === "item/commandExecution/outputDelta") {
    return { kind: "command", label: "正在运行命令", observedAt };
  }
  if (method === "item/agentMessage/delta") {
    return { kind: "response", label: "正在输出回复", observedAt };
  }
  if (method.startsWith("item/reasoning/")) {
    return { kind: "reasoning", label: "正在整理思路", observedAt };
  }
  if (method.startsWith("item/fileChange/")) {
    return { kind: "fileChange", label: "正在修改文件", observedAt };
  }
  if (method === "turn/plan/updated" || method === "turn/diff/updated") {
    return { kind: "planning", label: "正在更新计划", observedAt };
  }
  if (method === "serverRequest/resolved") {
    return { kind: "generating", label: "继续生成", observedAt };
  }
  if (method === "mcpServerStatusUpdated") {
    const status = String(params.status || "").toLowerCase();
    const failed = status === "failed";
    return {
      kind: failed ? "integrationFailure" : "mcp",
      label: failed ? `${params.name || "MCP"} 启动失败` : `${params.name || "MCP"} ${status || "更新"}`,
      observedAt,
      mcp: {
        name: String(params.name || "MCP").slice(0, 120),
        status,
        error: failed && params.error ? String(params.error).slice(0, 500) : null,
        failureReason: params.failureReason || null,
      },
    };
  }
  if (method === "error") {
    return {
      kind: "error",
      label: "执行返回错误",
      observedAt,
      error: String(params.error?.message || params.message || "Codex 返回错误。").slice(0, 500),
    };
  }
  return { kind: "event", label: "正在处理", observedAt };
}

export function mergeRuntimeActivity(previous, next) {
  const merged = { ...(previous || {}), ...(next || {}) };
  if (next?.activeItem === null) delete merged.activeItem;
  if (next?.mcp) merged.mcp = next.mcp;
  if (next?.error) merged.error = next.error;
  return merged;
}

export function deriveRunDiagnostic({
  runtime,
  turnMetric,
  activeItems = [],
  approvalRequests = [],
  userInputRequests = [],
  now = Date.now(),
  silenceMs = RUN_DIAGNOSTIC_SILENCE_MS,
} = {}) {
  if (!runtime || !isActiveThreadStatus(runtime.status || (runtime.activeTurnId ? "active" : ""))) {
    return { state: "idle", label: "空闲", observedAt: null, ageMs: null };
  }
  const flags = runtime.status?.activeFlags || runtime.activeFlags || [];
  if (approvalRequests.length || flags.includes("waitingOnApproval")) {
    return { state: "waitingApproval", label: "等待审批", observedAt: runtime.activity?.observedAt || null, ageMs: age(runtime.activity?.observedAt, now), flags };
  }
  if (userInputRequests.length || flags.includes("waitingOnUserInput")) {
    return { state: "waitingInput", label: "等待你的回答", observedAt: runtime.activity?.observedAt || null, ageMs: age(runtime.activity?.observedAt, now), flags };
  }
  const metricItems = Object.values(turnMetric?.items || {}).filter((item) => item?.startedAt && !item?.completedAt);
  const openItem = activeItems.find((item) => item?.status === "inProgress" || isActiveThreadStatus(item?.status))
    || metricItems[0]
    || runtime.activity?.activeItem;
  if (openItem) {
    return {
      state: openItem.type === "commandExecution" ? "runningCommand" : "runningItem",
      label: itemActivityLabel(openItem),
      observedAt: runtime.activity?.observedAt || timestampMilliseconds(openItem.startedAt),
      ageMs: age(runtime.activity?.observedAt || openItem.startedAt, now),
      item: { id: openItem.id || null, type: openItem.type || null },
    };
  }
  const observedAt = timestampMilliseconds(runtime.activity?.observedAt) || timestampMilliseconds(runtime.startedAt);
  const ageMs = age(observedAt, now);
  if (ageMs !== null && ageMs >= silenceMs) {
    return { state: "unexplained", label: "运行状态未确认", observedAt, ageMs };
  }
  return { state: "generating", label: runtime.activity?.label || "正在生成", observedAt, ageMs };
}

function age(value, now) {
  const at = timestampMilliseconds(value);
  return at ? Math.max(0, timestampMilliseconds(now) - at) : null;
}
