import { randomUUID } from "node:crypto";

const MAX_BUFFER = 256 * 1024;

// Subscribe before reading. Buffered presentation updates bridge the read/live
// overlap; only this application layer owns browser delivery sequences.
export async function openConversationStream({ response, identity, agent, conversationId, canRead }) {
  const epoch = randomUUID();
  let sequence = 0, pending = [], pendingBytes = 0, ready = false, closed = false;
  let unsubscribe = () => {}, heartbeat, expiry;
  const close = () => {
    if (closed) return;
    closed = true; unsubscribe(); clearInterval(heartbeat); clearTimeout(expiry); pending = [];
    response.end();
  };
  const send = (payload) => {
    if (closed) return;
    if (!canRead() || response.destroyed || response.writableEnded || response.writableLength > MAX_BUFFER) { close(); return; }
    const frame = `event: lan\ndata: ${JSON.stringify({ epoch, sequence: ++sequence, ...payload })}\n\n`;
    if (Buffer.byteLength(frame) > MAX_BUFFER) { close(); return; }
    response.write(frame);
    if (response.writableLength > MAX_BUFFER) close();
  };
  response.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  response.write("retry: 2000\n\n");
  response.on("close", close);
  unsubscribe = agent.observe(conversationId, (event) => {
    if (closed) return;
    if (event.kind === "recovery.required") { close(); return; }
    if (ready) send(event);
    else {
      pendingBytes += Buffer.byteLength(JSON.stringify(event));
      if (pendingBytes > MAX_BUFFER) close();
      else pending.push(event);
    }
  });
  if (closed) { unsubscribe(); return; }
  heartbeat = setInterval(() => {
    if (ready) send({ kind: "heartbeat" });
    else if (!closed) response.write(": keep-alive\n\n");
  }, 20_000);
  expiry = setTimeout(close, Math.max(1, Math.min(2_147_483_647, identity.session.expiresAt - Date.now())));
  try {
    const page = await agent.readHistory(conversationId);
    send({ kind: "snapshot", page });
    ready = true;
    for (const event of pending) send(event);
    pending = [];
  } catch (error) {
    send({ kind: "error", message: error.statusCode && error.statusCode < 500 ? error.message : "实时记录读取失败，正在重新连接。" });
    close();
  }
}
