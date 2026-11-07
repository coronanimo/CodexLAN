import { rowKey } from "../../../shared/presentation-key.mjs";
import { questionsFromItem, milliseconds, running } from "./protocol-values.mjs";

export const encodePosition = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
export const itemKey = (conversationId, runId, itemId) => rowKey(conversationId, runId, `item:${itemId}`);
export const summaryKey = (conversationId, runId) => rowKey(conversationId, runId, "$summary");
export function presentItem(conversationId, turn, item, page = null, kind) {
  const base = { id: item ? itemKey(conversationId, turn.id, item.id) : summaryKey(conversationId, turn.id), conversationId, runId: turn.id,
    revision: Math.max(turn.version || 0, item?.version || 0) };
  if (!item) return { ...base, kind: "summary", status: itemStatus(turn.status),
    startedAt: milliseconds(turn.startedAt), completedAt: milliseconds(turn.completedAt),
    ...(turn.plan ? { plan: { explanation: String(turn.plan.explanation || "").slice(0, 2000),
      plan: (turn.plan.plan || []).slice(0, 30).map((entry) => ({ step: String(entry.step || "").slice(0, 500), status: String(entry.status || "pending").slice(0, 30) })) } } : {}), detailId: encodePosition({ kind, page, run: turn.id, item: "$turn" }) };
  const detailId = encodePosition({ kind, page, run: turn.id, item: item.id });
  const paths = item.type === "userMessage" ? (item.content || []).filter((part) => part.type === "localImage").map((part) => part.path)
    : item.type === "imageView" ? [item.path] : item.type === "imageGeneration" ? [item.savedPath] : [];
  let fileCharacters = 0;
  const files = paths.filter((path) => typeof path === "string" && path.length <= 4096).slice(0, 20)
    .map((path) => ({ path, name: path.replace(/\\/g, "/").split("/").at(-1).slice(0, 256), image: true }))
    .filter((file) => { fileCharacters += file.path.length + file.name.length; return fileCharacters <= 8000; });
  if (["userMessage", "agentMessage", "plan"].includes(item.type)) {
    const text = item.type === "userMessage" ? (item.content || []).filter((part) => part.type === "text").map((part) => part.text || "").join("\n") : String(item.text || "");
    const request = questionsFromItem(item);
    return { ...base, kind: item.type === "userMessage" ? "user" : "assistant", text: text.slice(0, 12_000), detailId, files, streaming: running(item.status || turn.status),
      author: item.type === "userMessage" ? "你" : "Codex", ...(text.length > 12_000 || item.previewTruncated ? { detailId, truncated: true } : {}), ...(request ? { request } : {}) };
  }
  return { ...base, kind: "execution", label: item.type === "reasoning" ? "思考" : item.type === "commandExecution" ? "命令" : "工具",
    title: String(item.command || item.tool || item.query || item.type || "执行记录").slice(0, 256), status: itemStatus(item.status || turn.status), detailId, files };
}
export function itemStatus(status) {
  const value = String(typeof status === "string" ? status : status?.type || "").toLowerCase();
  return ["running", "inprogress", "active", "pending", "started"].includes(value) ? "running"
    : ["failed", "error"].includes(value) ? "failed" : ["interrupted", "cancelled"].includes(value) ? "interrupted" : "completed";
}
