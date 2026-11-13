import type { ConversationSelection } from "@lan/read-api";
import { HttpError } from "./http";
import { fileNameFromPath, localFileDownloadUrl } from "@lan/content-files.mjs";
import type { FileAccess } from "../features/content/FileAccessContext";

export function fileUrl(selection: ConversationSelection, path: string, access: FileAccess = { projects: [], role: "member" }) {
  return localFileDownloadUrl({ ...access, projectId: selection.projectId, path, name: fileNameFromPath(path) });
}
async function checked(response: Response) {
  if (response.ok) return response;
  if (response.status === 401) window.dispatchEvent(new Event("lan-auth-required"));
  throw new HttpError(response.status, response.status === 401 ? "登录已失效，请重新登录。" : response.status === 403 ? "当前账号无权读取该文件。" : response.status === 404 ? "文件不存在或已经移动。" : response.status === 413 ? "预览最多 200 KB，请下载原文件。" : "文件读取失败，请检查路径和项目状态。");
}
export async function imageUrl(selection: ConversationSelection, path: string, signal: AbortSignal, access?: FileAccess) {
  const url = fileUrl(selection, path, access); await checked(await fetch(url, { method: "HEAD", signal, cache: "no-store" })); return url;
}
export async function previewContent(selection: ConversationSelection, path: string, signal: AbortSignal, access?: FileAccess) {
  const response = await checked(await fetch(fileUrl(selection, path, access) + "&preview=true", { signal, headers: { Accept: "text/plain, text/markdown, application/json;q=0.9" } }));
  return { text: await response.text() };
}
export function visualizationUrl(selection: ConversationSelection, path: string) { return `/api/lan/conversations/${encodeURIComponent(selection.conversationId)}/visualization?${new URLSearchParams({ projectId: selection.projectId, agentId: selection.agentInstanceId, path })}`; }
export async function downloadFile(url: string) {
  await checked(await fetch(url, { method: "HEAD", cache: "no-store" })); window.location.assign(url);
}
