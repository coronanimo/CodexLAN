import { gzipSync } from "node:zlib";
import { httpError } from "./workspace-store.mjs";

export async function readJson(request) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > 256 * 1024) throw httpError(413, "请求内容过大。");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw httpError(400, "请求 JSON 格式无效。");
  }
}

export function validateText(value) {
  if (typeof value !== "string" || !value.trim()) throw httpError(400, "请输入内容。");
  if (value.trim().length > 200_000) throw httpError(400, "内容超过 200,000 个字符。 ");
  return value.trim();
}

export function validateId(value, name) {
  if (typeof value !== "string" || !/^[0-9a-f-]+$/i.test(value)) throw httpError(400, `${name} 无效。`);
  return value;
}

export function json(response, status, body) {
  const raw = Buffer.from(JSON.stringify(body));
  const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
  if (response.codexAcceptsGzip && raw.length >= 1024) {
    const compressed = gzipSync(raw);
    response.writeHead(status, { ...headers, "Content-Encoding": "gzip", "Content-Length": compressed.length, Vary: "Accept-Encoding" });
    return response.end(compressed);
  }
  response.writeHead(status, { ...headers, "Content-Length": raw.length });
  return response.end(raw);
}

export function requireLocalRequest(request, message = "这个操作只能在服务器电脑上执行。") {
  const address = request.socket.remoteAddress || "";
  if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(address)) throw httpError(403, message);
}
