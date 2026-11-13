import { rowKey } from "../../../shared/presentation-key.mjs";
import { questionsFromItem, milliseconds, running, messagePresentation } from "./protocol-values.mjs";
import { changeStats, turnChangeStats } from "./change-summary.mjs";
import { turnTiming } from "./turn-timing.mjs";

export const encodePosition = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
export const itemKey = (conversationId, runId, itemId) => rowKey(conversationId, runId, `item:${itemId}`);
export const summaryKey = (conversationId, runId) => rowKey(conversationId, runId, "$summary");
export function presentItem(conversationId, turn, item, page = null, kind) {
  const base = { id: item ? itemKey(conversationId, turn.id, item.id) : summaryKey(conversationId, turn.id), conversationId, runId: turn.id,
    revision: Math.max(turn.version || 0, item?.version || 0) };
  if (!item) return { ...base, kind: "summary", status: itemStatus(turn.status),
    ...(turn.activityLabel ? { label: turn.activityLabel } : {}),
    timing: turnTiming(turn),
    ...(!running(turn.status) && turn.recoveryCount ? { recoveryDetailId: encodePosition({ kind, page, run: turn.id, item: "$recovery" }) } : {}),
    changes: turnChangeStats(turn), diffDetailId: encodePosition({ kind, page, run: turn.id, item: "$diff" }),
    startedAt: milliseconds(turn.startedAt), completedAt: milliseconds(turn.completedAt),
    ...(turn.plan ? { plan: { explanation: String(turn.plan.explanation || "").slice(0, 2000),
      plan: (turn.plan.plan || []).slice(0, 30).map((entry) => ({ step: String(entry.step || "").slice(0, 500), status: String(entry.status || "pending").slice(0, 30) })) } } : {}), detailId: encodePosition({ kind, page, run: turn.id, item: "$turn" }) };
  const detailId = encodePosition({ kind, page, run: turn.id, item: item.id });
  const paths = item.type === "userMessage" ? (item.content || []).filter((part) => part.type === "localImage").map((part) => part.path)
    : item.type === "imageView" ? [item.path] : item.type === "imageGeneration" ? [item.savedPath] : [];
  let fileCharacters = 0;
  let files = paths.filter((path) => typeof path === "string" && path.length <= 4096).slice(0, 20)
    .map((path) => ({ path, name: path.replace(/\\/g, "/").split("/").at(-1).slice(0, 256), image: true }))
    .filter((file) => { fileCharacters += file.path.length + file.name.length; return fileCharacters <= 8000; });
  if (["userMessage", "agentMessage", "plan"].includes(item.type)) {
    const { text, files, visualizations } = messagePresentation(item);
    const request = questionsFromItem(item);
    const replyTo = item.type === "userMessage" ? item.content?.find((part) => part.type === "text")?.text?.match(/^\[CodexLAN async answer: ([^\r\n\]]{1,200})\]\n/)?.[1] : undefined;
    const timestamp = item.type === "userMessage" ? milliseconds(item.createdAt) ?? milliseconds(item.startedAtMs ?? item.startedAt) ?? milliseconds(item.completedAtMs ?? item.completedAt) ?? milliseconds(turn.startedAt)
      : milliseconds(item.completedAtMs ?? item.completedAt) ?? milliseconds(item.createdAt) ?? milliseconds(item.startedAtMs ?? item.startedAt) ?? milliseconds(turn.completedAt) ?? milliseconds(turn.startedAt);
    return { ...base, kind: item.type === "userMessage" ? "user" : "assistant", text: text.slice(0, 12_000), detailId, files, visualizations, timestamp, streaming: running(item.status || turn.status),
      ...(replyTo ? { replyTo } : {}),
      ...(item.inputKind === "guide" ? { appearance: "guidance" } : item.phase === "commentary" ? { appearance: "progress" } : {}),
      author: item.type === "userMessage" ? item.inputKind === "guide" ? "引导" : "你" : "Codex", ...(text.length > 12_000 || item.previewTruncated ? { detailId, truncated: true } : {}), ...(request ? { request } : {}) };
  }
  const status = itemStatus(item.status || turn.status), count = item.changes?.length || 0;
  const titles = { fileChange: count ? `${status === "running" ? "正在修改" : status === "failed" ? "修改" : "已修改"} ${count} 个文件${status === "failed" ? "时失败" : ""}` : status === "running" ? "正在准备文件修改" : "未产生文件修改",
    reasoning: plainInlineMarkdown(item.summary?.at(-1)) || "整理思路", commandExecution: commandDisplayText(item.command) || "执行终端命令", imageView: item.path || "查看图片", imageGeneration: "生成图片", contextCompaction: "整理聊天上下文", sleep: `等待 ${Math.round((item.durationMs || 0) / 1000)} 秒` };
  return { ...base, kind: "execution", label: ({ reasoning: "思考", commandExecution: "命令", fileChange: "文件", imageView: "图片", imageGeneration: "图片", webSearch: "搜索", contextCompaction: "上下文", sleep: "等待", collabAgentToolCall: "协作", subAgentActivity: "子任务" })[item.type] || "工具",
    title: String(titles[item.type] || [item.server || item.namespace, item.tool || item.query || item.type].filter(Boolean).join(" / ") || "执行记录").slice(0, 256), status, detailId, files,
    startedAt: milliseconds(item.startedAtMs ?? item.startedAt), completedAt: milliseconds(item.completedAtMs ?? item.completedAt),
    ...(typeof item.durationMs === "number" && Number.isFinite(item.durationMs) && item.durationMs >= 0 ? { durationMs: item.durationMs } : {}),
    ...(item.type === "reasoning" && status === "running" && (item.summary?.some(Boolean) || item.content?.some(Boolean)) ? { autoExpand: true } : {}),
    ...(item.type === "fileChange" ? { changes: changeStats(item.changes), hideCompletedStatus: true } : item.type === "imageView" ? { hideCompletedStatus: true } : {}),
    ...(item.type === "fileChange" ? { preview: "diff" } : files.length ? { preview: "image" } : {}) };
}
// Preserve the original execution summaries while keeping shell/provider
// interpretation in the adapter, outside shared React components.
function commandDisplayText(value) {
  const command = String(value || "").trim();
  const shell = command.match(/^(?:"[^"\r\n]*\b(?:pwsh|powershell)(?:\.exe)?"|[^\r\n]*?\b(?:pwsh|powershell)(?:\.exe)?)(?:\s+|$)([\s\S]*)$/i);
  if (!shell) return command;
  const argumentsText = shell[1].trim(), flag = /(?:^|\s)-(?:command|c)(?:\s+|$)/i.exec(argumentsText);
  const payload = flag ? argumentsText.slice(flag.index + flag[0].length).trim() : argumentsText;
  return payload.length >= 2 && payload[0] === payload.at(-1) && ['"', "'"].includes(payload[0]) ? payload.slice(1, -1).trim() : payload || command;
}
function plainInlineMarkdown(value) {
  return String(value || "").replace(/\*\*([^*\n]+)\*\*/g, "$1").replace(/__([^_\n]+)__/g, "$1").replace(/`([^`\n]+)`/g, "$1").trim();
}
export function itemStatus(status) {
  const value = String(typeof status === "string" ? status : status?.type || "").toLowerCase();
  return ["running", "inprogress", "active", "pending", "started"].includes(value) ? "running"
    : ["failed", "error"].includes(value) ? "failed" : ["interrupted", "cancelled"].includes(value) ? "interrupted" : "completed";
}
