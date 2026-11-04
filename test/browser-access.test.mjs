import assert from "node:assert/strict";
import { createPublicKey, randomBytes, randomUUID, verify } from "node:crypto";
import { EventEmitter } from "node:events";
import { connect } from "node:net";
import { endianness } from "node:os";
import { Readable } from "node:stream";
import test from "node:test";
import { BrowserAccessHost } from "../server/browser-access.mjs";
import { createConversations } from "../server/conversations.mjs";

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

class Response extends EventEmitter {
  constructor() { super(); this.messages = []; this.writableEnded = false; this.destroyed = false; this.writableLength = 0; }
  writeHead() {}
  write(value) { this.messages.push(String(value)); return true; }
  end(value) { if (value) this.messages.push(String(value)); this.writableEnded = true; this.emit("close"); }
}

async function conversation(t, { autoApprove = true, autoApproveBrowser = false } = {}) {
  const projectId = randomUUID();
  const ownerId = randomUUID();
  const routes = new Map();
  const codex = {
    events: new EventEmitter(), state: "ready", loadedThreads: new Set([threadId]),
    request: async (method) => {
      if (method === "configRequirements/read") return { requirements: codex.requirements };
      if (method === "config/read") return { config: { features: codex.features } };
      assert.fail(`unexpected request: ${method}`);
    },
    requirements: null,
    features: { browser_use: true, browser_use_external: true },
  };
  const store = {
    ready: Promise.resolve(), threadProjects: { [threadId]: projectId }, projects: [{ id: projectId, ownerId }],
    queues: {}, turnMetrics: {}, asyncInputAnswers: {},
    recordTurnMetric: async () => {}, listProjects: async () => [], listQueuedThreadIds: async () => [],
    getProject: async (id, userId) => { assert.equal(id, projectId); if (userId !== ownerId) throw new Error("not the owner"); return { id }; },
    requireThreadOwner: async (id, userId, project) => {
      assert.equal(id, threadId); assert.equal(project, projectId);
      if (userId !== ownerId) throw new Error("not the owner");
    },
  };
  const conversations = createConversations({ codex, store, autoApprove, autoApproveBrowser });
  conversations.registerRoutes({
    get: (path, handler) => routes.set(`GET ${path}`, handler),
    post: (path, handler) => routes.set(`POST ${path}`, handler),
    patch() {}, delete() {},
  });
  const stream = new Response();
  await routes.get("GET /api/events")({
    identity: { user: { id: ownerId }, session: { expiresAt: Date.now() + 60_000 } },
    codexUrl: new URL("http://localhost/api/events"),
  }, stream);
  t.after(() => stream.end());
  const start = async (id = turnId) => {
    codex.events.emit("notification", { method: "turn/started", params: { threadId, turn: { id } } });
    await new Promise(setImmediate);
  };
  await start();
  function pending() {
    const message = stream.messages.findLast((entry) => entry.includes('"method":"codexlan/browser/requestApproval"'));
    assert.ok(message, "approval must be delivered to the LAN owner");
    return JSON.parse(message.split("data: ")[1].trim()).params;
  }
  async function decide(decision, userId = ownerId) {
    const body = Buffer.from(JSON.stringify({ projectId, decision }));
    const incoming = Readable.from([body]);
    incoming.headers = { "content-type": "application/json", "content-length": String(body.length) };
    incoming.identity = { user: { id: userId } };
    incoming.params = { threadId, requestId: pending().requestId };
    await routes.get("POST /api/threads/:threadId/approval/:requestId")(incoming, new Response());
  }
  return { codex, start, pending, decide, stream };
}

test("LAN browser access requires its owner to approve even when command auto-approval is enabled", async (t) => {
  const { codex, pending, decide, start } = await conversation(t);
  const params = { sessionId: threadId, turnId };
  await assert.rejects(codex.authorizeBrowserAccess(params), /审批卡/);
  assert.equal(pending().threadId, threadId);
  assert.deepEqual(pending().availableDecisions, ["decline", "acceptForSession"]);
  await assert.rejects(decide("acceptForSession", randomUUID()), /not the owner/);
  await assert.rejects(codex.authorizeBrowserAccess(params), /审批卡/);
  await decide("acceptForSession");
  assert.equal(await codex.authorizeBrowserAccess(params), true);
  codex.loadedThreads.delete(threadId);
  await assert.rejects(codex.authorizeBrowserAccess(params), /不属于/);
  codex.loadedThreads.add(threadId);
  await assert.rejects(codex.authorizeBrowserAccess({ ...params, sessionId: randomUUID() }), /不属于/);
  await assert.rejects(codex.authorizeBrowserAccess({ ...params, turnId: randomUUID() }), /不属于/);
  const nextTurn = randomUUID();
  await start(nextTurn);
  assert.equal(await codex.authorizeBrowserAccess({ ...params, turnId: nextTurn }), true);
  codex.requirements = { allowBrowserAndComputerUse: false };
  await assert.rejects(codex.authorizeBrowserAccess({ ...params, turnId: nextTurn }), /禁止/);
  codex.requirements = null;
  codex.events.emit("online", {});
  await assert.rejects(codex.authorizeBrowserAccess({ ...params, turnId: nextTurn }), /审批卡/);
  await decide("acceptForSession");
  assert.equal(await codex.authorizeBrowserAccess({ ...params, turnId: nextTurn }), true);
  codex.events.emit("offline", {});
  await assert.rejects(codex.authorizeBrowserAccess({ ...params, turnId: nextTurn }), /审批卡/);
});

test("a rejected LAN browser grant stays rejected for its turn and can be requested on a new turn", async (t) => {
  const { codex, decide, start } = await conversation(t);
  const params = { sessionId: threadId, turnId };
  await assert.rejects(codex.authorizeBrowserAccess(params), /审批卡/);
  await decide("decline");
  await assert.rejects(codex.authorizeBrowserAccess(params), /用户已拒绝/);
  const nextTurn = randomUUID();
  await start(nextTurn);
  await assert.rejects(codex.authorizeBrowserAccess({ ...params, turnId: nextTurn }), /审批卡/);
  await decide("acceptForSession");
  assert.equal(await codex.authorizeBrowserAccess({ ...params, turnId: nextTurn }), true);
});

test("configured browser auto-approval skips cards across turns and core reconnects without granting commands", async (t) => {
  const { codex, start, stream } = await conversation(t, { autoApprove: false, autoApproveBrowser: true });
  const params = { sessionId: threadId, turnId };
  assert.equal(await codex.authorizeBrowserAccess(params), true);
  const nextTurn = randomUUID();
  await start(nextTurn);
  assert.equal(await codex.authorizeBrowserAccess({ ...params, turnId: nextTurn }), true);
  codex.events.emit("online", {});
  assert.equal(await codex.authorizeBrowserAccess({ ...params, turnId: nextTurn }), true);
  assert.equal(stream.messages.some((entry) => entry.includes('"method":"codexlan/browser/requestApproval"')), false);

  codex.respond = () => assert.fail("browser auto-approval must not approve commands");
  codex.events.emit("serverRequest", {
    id: 99, method: "item/commandExecution/requestApproval", params: { threadId, turnId: nextTurn },
  });
  await new Promise(setImmediate);
  assert.equal(stream.messages.some((entry) => entry.includes('"method":"item/commandExecution/requestApproval"')), true);
});

test("browser auto-approval still requires a loaded active turn and permitted browser policy", async (t) => {
  const { codex } = await conversation(t, { autoApproveBrowser: true });
  const params = { sessionId: threadId, turnId };
  codex.loadedThreads.delete(threadId);
  await assert.rejects(codex.authorizeBrowserAccess(params), /不属于/);
  codex.loadedThreads.add(threadId);
  await assert.rejects(codex.authorizeBrowserAccess({ ...params, sessionId: randomUUID() }), /不属于/);
  await assert.rejects(codex.authorizeBrowserAccess({ ...params, turnId: randomUUID() }), /不属于/);
  for (const requirements of [
    { allowBrowserAndComputerUse: false },
    { featureRequirements: { browser_use: false } },
    { featureRequirements: { browser_use_external: false } },
  ]) {
    codex.requirements = requirements;
    await assert.rejects(codex.authorizeBrowserAccess(params), /禁止/);
  }
  codex.requirements = null;
  for (const feature of ["browser_use", "browser_use_external"]) {
    codex.features[feature] = false;
    await assert.rejects(codex.authorizeBrowserAccess(params), /禁止/);
    codex.features[feature] = true;
  }
  codex.requirements = undefined;
  await assert.rejects(codex.authorizeBrowserAccess(params), /无法读取/);
  codex.requirements = null;
  assert.equal(await codex.authorizeBrowserAccess(params), true);
});

test("browser auto-approval rechecks the active turn after the policy read", async (t) => {
  const { codex, start } = await conversation(t, { autoApproveBrowser: true });
  const read = codex.request;
  codex.request = async (method, params) => {
    if (method === "config/read") await start(randomUUID());
    return read(method, params);
  };
  await assert.rejects(codex.authorizeBrowserAccess({ sessionId: threadId, turnId }), /不属于/);
});
