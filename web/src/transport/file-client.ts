import type { ConversationSelection } from "@lan/read-api";
import { HttpError } from "./http";

export function fileUrl(selection: ConversationSelection, path: string, preview = false) {
  return `/api/projects/${encodeURIComponent(selection.projectId)}/files/${preview ? "preview" : "download"}?${new URLSearchParams({ path })}`;
}
async function checked(response: Response) {
  if (response.ok) return response;
  if (response.status === 401) window.dispatchEvent(new Event("lan-auth-required"));
  throw new HttpError(response.status, response.status === 401 ? "登录已失效，请重新登录。" : response.status === 403 ? "当前账号无权读取该文件。" : response.status === 404 ? "文件不存在或已经移动。" : "文件读取失败，请检查路径和项目状态。");
}
export async function imageUrl(selection: ConversationSelection, path: string, signal: AbortSignal) {
  const url = fileUrl(selection, path); await checked(await fetch(url, { method: "HEAD", signal, cache: "no-store" })); return url;
}
export async function previewContent(selection: ConversationSelection, path: string, signal: AbortSignal) {
  const response = await checked(await fetch(fileUrl(selection, path, true), { signal }));
  return { text: await response.text(), html: response.headers.get("Content-Type")?.startsWith("text/html") === true };
}
export async function downloadFile(url: string) {
  await checked(await fetch(url, { method: "HEAD", cache: "no-store" })); window.location.assign(url);
}
