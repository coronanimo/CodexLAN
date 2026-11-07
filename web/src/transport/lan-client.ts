import type { ConversationSelection, HistoryPage, ReadClient, ConversationStreamEvent, WorkspaceUpdate } from "@lan/read-api";
import type { TimelineRow } from "@lan/presentation";
import type { UploadedFile } from "@lan/workspace";
import { HttpError, readJson as request, sendJson, csrfToken } from "./http";
import { openSequencedStream } from "./sse";
export { HttpError } from "./http";
const write = <T>(path: string, body: unknown, signal: AbortSignal) => sendJson<T>(path, body, "POST", signal);
function selectionQuery(selection: ConversationSelection) {
  return new URLSearchParams({ projectId: selection.projectId, agentId: selection.agentInstanceId });
}
export const lanClient: ReadClient = {
  watchWorkspace(receive) { return openSequencedStream<WorkspaceUpdate>("/api/lan/events", "workspace", receive); },
  search(agentId, q, cursor, signal) {
    const query = new URLSearchParams({ agentId, q }); if (cursor) query.set("cursor", cursor);
    return request(`/api/lan/search?${query}`, signal);
  },
  fork(selection, signal) { return write(`/api/lan/conversations/${encodeURIComponent(selection.conversationId)}/fork`, { projectId: selection.projectId, agentId: selection.agentInstanceId }, signal); },
  queueItem(selection, itemId, signal) {
    return request(`/api/lan/conversations/${encodeURIComponent(selection.conversationId)}/queue/${encodeURIComponent(itemId)}?${selectionQuery(selection)}`, signal);
  },
  async upload(selection, file, signal, progress) {
    const token = await csrfToken(signal);
    const query = new URLSearchParams({ conversationId: selection.conversationId, name: file.name });
    return new Promise<UploadedFile>((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open("POST", `/api/projects/${encodeURIComponent(selection.projectId)}/files/upload?${query}`);
      request.setRequestHeader("X-Codex-CSRF-Token", token);
      request.setRequestHeader("Content-Type", "application/octet-stream");
      const abort = () => request.abort();
      signal.addEventListener("abort", abort, { once: true });
      request.upload.onprogress = (event) => { if (event.lengthComputable) progress(event.total ? event.loaded / event.total : 1); };
      request.onload = () => {
        try {
          const body = JSON.parse(request.responseText);
          if (request.status < 200 || request.status >= 300) reject(new HttpError(request.status, body.error || "上传失败。"));
          else resolve(body.file);
        } catch { reject(new Error("上传响应无效。")); }
      };
      request.onerror = () => reject(new Error("上传连接中断，文件仍保留在草稿中。"));
      request.onabort = () => reject(new Error("上传已取消。"));
      request.onloadend = () => signal.removeEventListener("abort", abort);
      if (signal.aborted) reject(new Error("上传已取消。")); else request.send(file);
    });
  },
  controls(selection, signal) {
    return request(`/api/lan/conversations/${encodeURIComponent(selection.conversationId)}/controls?${selectionQuery(selection)}`, signal);
  },
  async command(selection, command, signal) {
    return write(`/api/lan/conversations/${encodeURIComponent(selection.conversationId)}/commands`, { projectId: selection.projectId, agentId: selection.agentInstanceId, command }, signal);
  },
  create(projectId, agentId, signal) { return write(`/api/lan/projects/${encodeURIComponent(projectId)}/conversations`, { agentId }, signal); },
  configuration(agentId, signal) { return request(`/api/lan/agents/${encodeURIComponent(agentId)}/settings`, signal); },
  watch(selection, handlers) {
    const query = selectionQuery(selection);
    return openSequencedStream<ConversationStreamEvent>(`/api/lan/conversations/${encodeURIComponent(selection.conversationId)}/events?${query}`, "lan", (value) => {
        if (value.kind === "snapshot") {
          handlers.snapshot(decodeHistory(value.page, selection.conversationId)); handlers.status("实时连接正常");
          return;
        }
        if (value.kind === "controls.changed") { handlers.controlsChanged?.(); return; }
        if (value.kind === "resource.changed") { if (typeof value.rowId !== "string") throw new Error(); handlers.resourceChanged?.(value.rowId); return; }
        if (value.kind === "patch") {
          if (value.conversationId !== selection.conversationId || !Array.isArray(value.upserts) || value.upserts.length > 10
            || !Array.isArray(value.removeIds) || value.removeIds.some((id: unknown) => typeof id !== "string")) throw new Error();
          handlers.patch({ conversationId: selection.conversationId, appendRun: value.appendRun === true, removeIds: value.removeIds,
            upserts: value.upserts.map((entry: { row: TimelineRow; beforeId?: string; afterId?: string }) => ({ row: decodeRow(entry.row, selection.conversationId),
              beforeId: typeof entry.beforeId === "string" ? entry.beforeId : undefined, afterId: typeof entry.afterId === "string" ? entry.afterId : undefined })) });
        } else if (value.kind === "removed") {
          handlers.status(value.message || "会话已移除。");
          return false;
        } else if (value.kind === "notice") handlers.status(value.message || "代理状态已变化。");
    }, handlers.status);
  },
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
    return decodeHistory(value, selection.conversationId);
  },
  async details(selection, ref, cursor, signal) {
    const query = selectionQuery(selection);
    query.set("ref", ref); if (cursor) query.set("after", cursor);
    const value = await request<Awaited<ReturnType<ReadClient["details"]>>>(`/api/lan/conversations/${encodeURIComponent(selection.conversationId)}/details?${query}`, signal);
    if (typeof value.text !== "string" || value.text.length > 16_000
      || !(value.nextCursor === null || typeof value.nextCursor === "string" && value.nextCursor !== cursor)) throw new Error("输出响应无效。");
    return value;
  },
};

function decodeHistory(value: HistoryPage, conversationId: string): HistoryPage {
  if (!value || value.conversationId !== conversationId || !Array.isArray(value.rows) || value.rows.length > 200
    || !(value.before === null || typeof value.before === "string")) throw new Error("历史响应无效。");
  return { conversationId, before: value.before, revision: Number.isSafeInteger(value.revision) ? value.revision : undefined, rows: value.rows.map((row) => decodeRow(row, conversationId)) };
}

// Pick only presentation fields. Provider payloads and full tool bodies are not
// accepted into the entity store, even if a server accidentally includes them.
function decodeRow(row: TimelineRow, conversationId: string): TimelineRow {
  if (!row || row.conversationId !== conversationId || typeof row.id !== "string" || typeof row.runId !== "string") throw new Error("历史记录无效。");
  const base = { id: row.id, conversationId, runId: row.runId, revision: Number.isSafeInteger(row.revision) ? row.revision : undefined };
  const files = "files" in row && Array.isArray(row.files) ? row.files.slice(0, 20).filter((file) => typeof file.path === "string" && file.path.length <= 4096 && typeof file.name === "string")
    .map((file) => ({ path: file.path, name: file.name.slice(0, 256), image: file.image === true })) : [];
  const detail = "detailId" in row && typeof row.detailId === "string" && row.detailId.length <= 4096 ? { detailId: row.detailId } : {};
  if (row.kind === "user" || row.kind === "assistant") {
    if (typeof row.text !== "string" || row.text.length > 12_000) throw new Error("消息摘要超出限制。");
    return { ...base, kind: row.kind, text: row.text, files, streaming: row.streaming === true, author: typeof row.author === "string" ? row.author.slice(0, 100) : undefined, truncated: row.truncated === true,
      ...(row.request && Array.isArray(row.request.questions) ? { request: { id: String(row.request.id), delivery: row.request.delivery,
        questions: row.request.questions.map((question) => ({ id: String(question.id), header: String(question.header), question: String(question.question),
          isOther: question.isOther === true, isSecret: question.isSecret === true, options: (question.options || []).map(({ label, description }) => ({ label: String(label), description: String(description) })) })) } } : {}), ...detail };
  }
  if (row.kind !== "execution" && row.kind !== "summary") throw new Error("历史记录类型不支持。");
  if (!["running", "completed", "failed", "interrupted"].includes(row.status)) throw new Error("执行状态无效。");
  if (row.kind === "summary") return { ...base, kind: "summary", status: row.status,
    ...(typeof row.recoveryDetailId === "string" && row.recoveryDetailId.length <= 4096 ? { recoveryDetailId: row.recoveryDetailId } : {}),
    startedAt: typeof row.startedAt === "number" ? row.startedAt : null, completedAt: typeof row.completedAt === "number" ? row.completedAt : null,
    ...(row.plan && Array.isArray(row.plan.plan) ? { plan: { explanation: String(row.plan.explanation || ""), plan: row.plan.plan.map((step) => ({ step: String(step.step), status: String(step.status) })) } } : {}), ...detail };
  if (typeof row.title !== "string" || row.title.length > 256 || typeof row.label !== "string" || row.label.length > 40) throw new Error("执行摘要无效。");
  return { ...base, kind: "execution", title: row.title, label: row.label, status: row.status, files, ...detail };
}
