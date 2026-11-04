import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { createServer } from "node:net";
import { endianness, tmpdir } from "node:os";
import { join } from "node:path";
import { chmod, unlink } from "node:fs/promises";

const MAX_FRAME_BYTES = 64 * 1024;
const LITTLE_ENDIAN = endianness() === "LE";

// The launcher is the permission authority for its own local conversations.
// The authority checks policy and either owner approval or configured auto-approval.
export class BrowserAccessHost {
  constructor({ authorize }) {
    this.authorize = authorize;
    this.executorId = randomUUID();
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    this.privateKey = privateKey;
    this.verifyingIdentity = publicKey.export({ type: "spki", format: "der" }).toString("base64");
    this.pipePath = process.platform === "win32"
      ? `\\\\.\\pipe\\codexlan-browser-${randomUUID()}`
      : join(tmpdir(), `codexlan-browser-${randomUUID()}.sock`);
    this.sockets = new Set();
    this.server = createServer((socket) => this.accept(socket));
  }

  async start() {
    await new Promise((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(this.pipePath, () => {
        this.server.removeListener("error", reject);
        resolve();
      });
    });
    if (process.platform !== "win32") await chmod(this.pipePath, 0o600);
    return this;
  }

  get env() {
    return {
      BROWSER_USE_ACCESS_EXECUTOR_ID: this.executorId,
      BROWSER_USE_ACCESS_PIPE_PATH: this.pipePath,
      BROWSER_USE_ACCESS_VERIFYING_IDENTITY: this.verifyingIdentity,
    };
  }

  accept(socket) {
    this.sockets.add(socket);
    socket.once("close", () => this.sockets.delete(socket));
    socket.on("error", () => socket.destroy());
    socket.setTimeout(10_000, () => socket.destroy());
    let buffer = Buffer.alloc(0);
    let received = false;
    socket.on("data", (chunk) => {
      if (received || buffer.length + chunk.length > MAX_FRAME_BYTES + 4) return socket.destroy();
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length < 4) return;
      const size = LITTLE_ENDIAN ? buffer.readUInt32LE(0) : buffer.readUInt32BE(0);
      if (!size || size > MAX_FRAME_BYTES || buffer.length > size + 4) return socket.destroy();
      if (buffer.length < size + 4) return;
      received = true;
      let request;
      try { request = JSON.parse(buffer.subarray(4).toString("utf8")); }
      catch { return socket.destroy(); }
      void this.respond(request).then((response) => {
        if (socket.destroyed) return;
        const body = Buffer.from(JSON.stringify(response));
        const frame = Buffer.alloc(4 + body.length);
        if (LITTLE_ENDIAN) frame.writeUInt32LE(body.length, 0);
        else frame.writeUInt32BE(body.length, 0);
        body.copy(frame, 4);
        socket.end(frame);
      }).catch(() => socket.destroy());
    });
  }

  async respond(message) {
    const id = typeof message?.id === "string" || typeof message?.id === "number" ? message.id : null;
    const error = (code, text) => ({ jsonrpc: "2.0", id, error: { code, message: text } });
    const params = message?.params;
    if (id === null || message.jsonrpc !== "2.0" || message.method !== "browser/access"
      || !params || typeof params !== "object" || Array.isArray(params)
      || Object.keys(params).length !== 4
      || params.executorId !== this.executorId
      || !/^[0-9a-f-]{36}$/i.test(params.sessionId || "")
      || !/^[0-9a-f-]{36}$/i.test(params.turnId || "")
      || !/^[0-9a-f]{64}$/i.test(params.nonce || "")) {
      return error(-32602, "浏览器权限请求无效。");
    }
    try {
      const allowed = await this.authorize(params);
      if (allowed !== true) return error(-32000, "此会话未获准使用本机浏览器。");
      const payload = JSON.stringify({ domain: "codex.browserAccess.v1", request: params, allowed: true });
      return {
        jsonrpc: "2.0", id,
        result: { payload, signature: sign(null, Buffer.from(payload), this.privateKey).toString("base64") },
      };
    } catch (cause) {
      return error(-32000, cause instanceof Error ? cause.message : "浏览器权限检查失败。");
    }
  }

  async close() {
    for (const socket of this.sockets) socket.destroy();
    if (this.server.listening) await new Promise((resolve) => this.server.close(resolve));
    if (process.platform !== "win32") {
      try { await unlink(this.pipePath); }
      catch (error) { if (error.code !== "ENOENT") throw error; }
    }
    this.privateKey = null;
  }
}
