import type { ConversationSelection, HistoryPage, ReadClient } from "@lan/read-api";
import type { TimelineRow } from "@lan/presentation";

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function request<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal, credentials: "same-origin" });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new HttpError(response.status, body?.error || `请求失败（${response.status}）`);
  if (body === null) throw new Error("服务没有返回有效数据。");
  return body as T;
}
function selectionQuery(selection: ConversationSelection) {
  return new URLSearchParams({ projectId: selection.projectId, agentId: selection.agentInstanceId });
}
export const lanClient: ReadClient = {
  async bootstrap(signal) {
    const value = await request<Awaited<ReturnType<ReadClient["bootstrap"]>>>("/api/lan/bootstrap", signal);
    if (value.version !== 1 || !Array.isArray(value.projects) || !Array.isArray(value.agents)) throw new Error("工作台接口版本不兼容。");
    return value;
  },
  list(projectId, agentId, cursor, signal) {
    const query = new URLSearchParams({ agentId });
    if (cursor) query.set("cursor", cursor);
    return request(`/api/lan/projects/${encodeURIComponent(projectId)}/conversations?${query}`, signal);
  },
  async history(selection, before, signal) {
    const query = selectionQuery(selection);
    if (before) query.set("before", before);
    const value = await request<HistoryPage>(`/api/lan/conversations/${encodeURIComponent(selection.conversationId)}/history?${query}`, signal);
    if (value.conversationId !== selection.conversationId || !Array.isArray(value.rows) || value.rows.length > 200
      || !(value.before === null || typeof value.before === "string")) throw new Error("历史响应无效。");
    return { ...value, rows: value.rows.map((row) => decodeRow(row, selection.conversationId)) };
  },
  async details(selection, ref, offset, signal) {
    const query = selectionQuery(selection);
    query.set("ref", ref); query.set("offset", String(offset));
    const value = await request<Awaited<ReturnType<ReadClient["details"]>>>(`/api/lan/conversations/${encodeURIComponent(selection.conversationId)}/details?${query}`, signal);
    if (typeof value.text !== "string" || value.text.length > 16_000
      || !(value.nextOffset === null || Number.isSafeInteger(value.nextOffset) && value.nextOffset > offset)) throw new Error("输出响应无效。");
    return value;
  },
};

// Pick only presentation fields. Provider payloads and full tool bodies are not
// accepted into the entity store, even if a server accidentally includes them.
function decodeRow(row: TimelineRow, conversationId: string): TimelineRow {
  if (!row || row.conversationId !== conversationId || typeof row.id !== "string" || typeof row.runId !== "string") throw new Error("历史记录无效。");
  const base = { id: row.id, conversationId, runId: row.runId };
  const detail = "detailId" in row && typeof row.detailId === "string" && row.detailId.length <= 4096 ? { detailId: row.detailId } : {};
  if (row.kind === "user" || row.kind === "assistant") {
    if (typeof row.text !== "string" || row.text.length > 12_000) throw new Error("消息摘要超出限制。");
    return { ...base, kind: row.kind, text: row.text, author: typeof row.author === "string" ? row.author.slice(0, 100) : undefined, truncated: row.truncated === true, ...detail };
  }
  if (row.kind !== "execution" && row.kind !== "summary") throw new Error("历史记录类型不支持。");
  if (!["running", "completed", "failed", "interrupted"].includes(row.status)) throw new Error("执行状态无效。");
  if (row.kind === "summary") return { ...base, kind: "summary", status: row.status };
  if (typeof row.title !== "string" || row.title.length > 256 || typeof row.label !== "string" || row.label.length > 40) throw new Error("执行摘要无效。");
  return { ...base, kind: "execution", title: row.title, label: row.label, status: row.status, ...detail };
}
