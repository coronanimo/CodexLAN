export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: Record<string, unknown>) { super(message); }
}

export async function readJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  return responseJson(await fetch(path, { signal, credentials: "same-origin" }));
}
export async function csrfToken(signal?: AbortSignal) {
  return (await readJson<{ csrfToken: string }>("/api/auth/session", signal)).csrfToken;
}
export async function sendJson<T>(path: string, body: unknown, method = "POST", signal?: AbortSignal): Promise<T> {
  return responseJson(await fetch(path, { method, signal, credentials: "same-origin",
    headers: { "Content-Type": "application/json", "X-Codex-CSRF-Token": await csrfToken(signal) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }));
}
export async function authenticate(path: string, body: unknown): Promise<void> {
  await responseJson(await fetch(path, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
}
async function responseJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null);
  if (response.status === 401 && typeof window !== "undefined") window.dispatchEvent(new Event("lan-auth-required"));
  if (!response.ok) throw new HttpError(response.status, typeof body?.error === "string" ? body.error : `请求失败（${response.status}）`, body);
  if (body === null) throw new Error("服务没有返回有效数据。");
  return body as T;
}
