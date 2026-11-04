import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import { AppServerClient, appServerLaunch } from "../server/codex-client.mjs";

test("acceptance is observed before subsequent notifications in the same JSONL chunk", async () => {
  const client = Object.create(AppServerClient.prototype);
  Object.assign(client, { events: new EventEmitter(), pending: new Map(), nextId: 1, buffer: "", process: { stdin: { writable: true, write() {} } } });
  const order = [];
  client.events.on("response", ({ params }) => order.push(params.clientUserMessageId));
  client.events.on("notification", () => order.push("tool"));
  const request = client.rawRequest("turn/start", { clientUserMessageId: "input" });
  client.onOutput(JSON.stringify({ id: 1, result: { turn: { id: "turn" } } }) + "\n" + JSON.stringify({ method: "item/started", params: { item: { id: "tool" } } }) + "\n");
  await request;
  assert.deepEqual(order, ["input", "tool"]);
});

test("sends a request after startup becomes ready", async () => {
  const client = Object.create(AppServerClient.prototype);
  client.state = "starting";
  client.startPromise = Promise.resolve().then(() => { client.state = "ready"; });
  const params = { includeHidden: true };
  const options = { timeoutMs: 15_000 };
  client.rawRequest = async (method, actualParams, actualOptions) => {
    assert.equal(method, "model/list");
    assert.equal(actualParams, params);
    assert.equal(actualOptions, options);
    return { data: [{ id: "selected-model" }] };
  };
  assert.deepEqual(await client.request("model/list", params, options), { data: [{ id: "selected-model" }] });
});

test("does not send requests when startup requires login or fails", async () => {
  for (const state of ["login_required", "failed"]) {
    const client = Object.create(AppServerClient.prototype);
    client.state = "starting";
    client.error = "login required";
    client.startPromise = Promise.resolve().then(() => { client.state = state; });
    client.rawRequest = () => assert.fail("request must not be sent before ready");
    await assert.rejects(client.request("model/list"), state === "login_required" ? /login required/ : /自动恢复失败/);
  }
});

test("starts Codex App Server with an explicit standard service tier", () => {
  assert.deepEqual(appServerLaunch({
    codexBin: "custom-codex.exe",
    fixture: null,
    platform: "win32",
  }), {
    executable: "custom-codex.exe",
    args: [
      "-c", 'service_tier="default"',
      "-c", "features.tool_suggest=false",
      "-c", "features.unified_exec=false",
      "app-server", "--listen", "stdio://",
    ],
  });
});
