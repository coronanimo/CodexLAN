import assert from "node:assert/strict";
import { createPublicKey, randomBytes, randomUUID, verify } from "node:crypto";
import { connect } from "node:net";
import { endianness } from "node:os";
import test from "node:test";
import { BrowserAccessHost } from "../server/browser-access.mjs";

const threadId = randomUUID();
const turnId = randomUUID();
const littleEndian = endianness() === "LE";

function request(host, patch = {}) {
  return {
    jsonrpc: "2.0", id: 1, method: "browser/access",
    params: {
      executorId: host.executorId, sessionId: threadId, turnId,
      nonce: randomBytes(32).toString("hex"), ...patch,
    },
  };
}

test("browser host signs only an authorized, nonce-bound request", async () => {
  let approved = false;
  const host = new BrowserAccessHost({ authorize: async () => approved });
  const message = request(host);
  assert.equal((await host.respond(message)).result, undefined);
  approved = true;
  const response = await host.respond(message);
  const key = createPublicKey({ key: Buffer.from(host.verifyingIdentity, "base64"), format: "der", type: "spki" });
  assert.equal(verify(null, Buffer.from(response.result.payload), key, Buffer.from(response.result.signature, "base64")), true);
  assert.deepEqual(JSON.parse(response.result.payload), {
    domain: "codex.browserAccess.v1", request: message.params, allowed: true,
  });
  assert.equal(host.env.BROWSER_USE_ACCESS_EXECUTOR_ID, host.executorId);
  await host.close();
});

test("browser host rejects wrong executor, malformed nonce, extra fields, and unrelated methods", async () => {
  const host = new BrowserAccessHost({ authorize: () => assert.fail("invalid requests must not reach the authority") });
  for (const patch of [{ executorId: randomUUID() }, { nonce: "" }, { extra: true }, { sessionId: "not-a-session" }]) {
    assert.equal((await host.respond(request(host, patch))).error.code, -32602);
  }
  assert.equal((await host.respond({ ...request(host), method: "tools/call" })).error.code, -32602);
  await host.close();
});

test("browser host handles fragmented native-pipe frames and shuts down its connections", async (t) => {
  const host = await new BrowserAccessHost({ authorize: () => true }).start();
  t.after(() => host.close());
  const message = request(host);
  const body = Buffer.from(JSON.stringify(message));
  const frame = Buffer.alloc(body.length + 4);
  if (littleEndian) frame.writeUInt32LE(body.length, 0);
  else frame.writeUInt32BE(body.length, 0);
  body.copy(frame, 4);
  const response = await new Promise((resolve, reject) => {
    const socket = connect(host.pipePath);
    let output = Buffer.alloc(0);
    socket.on("error", reject);
    socket.on("data", (chunk) => { output = Buffer.concat([output, chunk]); });
    socket.on("end", () => {
      try {
        const size = littleEndian ? output.readUInt32LE(0) : output.readUInt32BE(0);
        assert.equal(output.length, size + 4);
        resolve(JSON.parse(output.subarray(4).toString("utf8")));
      } catch (error) { reject(error); }
    });
    socket.on("connect", () => {
      socket.write(frame.subarray(0, 2));
      setImmediate(() => socket.end(frame.subarray(2)));
    });
  });
  assert.equal(response.result !== undefined, true);
});
