import { rowKey } from "../../../shared/presentation-key.mjs";
import { executionItemText } from "../../../public/execution-events.js";
import { httpError } from "../../workspace-store.mjs";

const INSTANCE_ID = "codex-local";
const PREVIEW_CHARS = 12_000;

// This transitional read adapter reuses the existing catalog/binding and live
// history bridge. Native method names/turn shapes do not escape this module.
export function createCodexReadAdapter({ conversations, status }) {
  const describe = () => ({
    instanceId: INSTANCE_ID, providerId: "codex", displayName: "Codex", access: "read-only", status: status(),
    capabilities: { history: "paged", interrupt: false, steer: false, fork: false, compact: false,
      attachments: false, approvals: false, questions: false, plans: false, goals: false, usage: false }, settings: [],
  });
  async function list(project, user, { cursor = null } = {}) {
    const query = new URLSearchParams({ limit: "30" });
    if (cursor) query.set("cursor", cursor);
    const result = await conversations.listProjectThreadPage(project, user, query);
    return { conversations: result.threads.map((thread) => ({
      id: thread.id, agentInstanceId: INSTANCE_ID, projectId: project.id,
      title: String(thread.name || "未命名会话").slice(0, 300),
    })), nextCursor: result.nextCursor || null };
  }
  async function source(conversationId, pageCursor) {
    const query = new URLSearchParams({ limit: "4" });
    if (pageCursor) query.set("before", pageCursor);
    return conversations.readRawThreadPage(conversationId, query);
  }
  async function readHistory(conversationId, { before = null, limit = 100 } = {}) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw httpError(400, "历史每页数量必须是 1 到 200。");
    const cursor = before ? decode(before) : { page: null };
    const result = await source(conversationId, cursor.page);
    const locations = [];
    for (const turn of result.thread.turns || []) {
      for (const item of turn.items || []) if (item.id) locations.push({ turn, item });
      locations.push({ turn, item: null });
    }
    const key = ({ turn, item }) => rowKey(conversationId, turn.id, item ? `item:${item.id}` : "$summary");
    const end = cursor.anchor ? locations.findIndex((location) => key(location) === cursor.anchor) : locations.length;
    if (end < 0) throw httpError(409, "历史位置已变化，请刷新最新记录。");
    const start = Math.max(0, end - limit);
    const rows = locations.slice(start, end).map(({ turn, item }) => {
      const base = { id: key({ turn, item }), conversationId, runId: turn.id };
      if (!item) return { ...base, kind: "summary", status: itemStatus(turn.status) };
      const detailId = encode({ page: cursor.page, run: turn.id, item: item.id });
      if (["userMessage", "agentMessage", "plan"].includes(item.type)) {
        const text = item.type === "userMessage" ? (item.content || []).filter((part) => part.type === "text").map((part) => part.text || "").join("\n") : String(item.text || "");
        return { ...base, kind: item.type === "userMessage" ? "user" : "assistant", text: text.slice(0, PREVIEW_CHARS),
          author: item.type === "userMessage" ? "你" : "Codex", ...(text.length > PREVIEW_CHARS ? { detailId, truncated: true } : {}) };
      }
      return { ...base, kind: "execution", label: item.type === "reasoning" ? "思考" : item.type === "commandExecution" ? "命令" : "工具",
        title: String(item.command || item.tool || item.query || item.type || "执行记录").slice(0, 256), status: itemStatus(item.status || turn.status), detailId };
    });
    const nextCursor = start > 0 ? encode({ page: cursor.page, anchor: rows[0].id })
      : result.history.hasMore ? encode({ page: result.history.before }) : null;
    return { conversationId, rows, before: nextCursor };
  }
  async function readDetail(conversationId, { ref, offset = 0 }) {
    const locator = decode(ref);
    if (typeof locator.run !== "string" || typeof locator.item !== "string" || !Number.isSafeInteger(offset) || offset < 0) throw httpError(400, "输出位置无效。");
    const result = await source(conversationId, locator.page);
    const item = result.canonicalTurns?.find((turn) => turn.id === locator.run)?.items?.find((entry) => entry.id === locator.item);
    if (!item) throw httpError(409, "原始记录不在当前历史页中，请刷新记录后重试。");
    const text = item.type === "userMessage" ? (item.content || []).filter((part) => part.type === "text").map((part) => part.text || "").join("\n") : executionItemText(item);
    if (offset > text.length) throw httpError(400, "输出位置无效。");
    const end = Math.min(text.length, offset + 16_000);
    return { text: text.slice(offset, end), nextOffset: end < text.length ? end : null };
  }
  return { describe, list, readHistory, readDetail };
}

function itemStatus(status) {
  const value = String(typeof status === "string" ? status : status?.type || "").toLowerCase();
  return ["running", "inprogress", "active", "pending", "started"].includes(value) ? "running"
    : ["failed", "error"].includes(value) ? "failed" : ["interrupted", "cancelled"].includes(value) ? "interrupted" : "completed";
}
function encode(value) { return Buffer.from(JSON.stringify(value)).toString("base64url"); }
function decode(token) {
  try {
    if (typeof token !== "string" || token.length > 4096) throw new Error();
    const value = JSON.parse(Buffer.from(token, "base64url").toString());
    if (!value || Array.isArray(value) || typeof value !== "object" || !(value.page === null || typeof value.page === "string")
      || (value.anchor !== undefined && typeof value.anchor !== "string")) throw new Error();
    return value;
  } catch { throw httpError(400, "历史位置无效。"); }
}
