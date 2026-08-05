import { createInterface } from "node:readline";

const input = createInterface({ input: process.stdin, crlfDelay: Infinity });

input.on("line", (line) => {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }
  if (!Object.hasOwn(message, "id")) return;
  process.stdout.write(`${JSON.stringify({ id: message.id, result: fakeResult(message.method) })}\n`);
});

function fakeResult(method) {
  if (method === "initialize") return { userAgent: "codex-lan-http-test" };
  if (method === "model/list") return { data: [] };
  if (method === "account/rateLimits/read") return {};
  return {};
}
