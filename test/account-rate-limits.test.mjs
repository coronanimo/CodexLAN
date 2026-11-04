import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { createConversations } from "../server/conversations.mjs";
import { accountLimitWindows, mergeAccountRateLimits } from "../public/workspace.js";

const snapshot = (usedPercent, limitId = "codex") => ({ limitId,
  primary: { usedPercent, windowDurationMins: 300, resetsAt: 2_000_000_000 },
  secondary: { usedPercent: usedPercent + 10, windowDurationMins: 10_080, resetsAt: 2_000_100_000 },
});
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function harness(t, request) {
  const codex = { state: "ready", events: new EventEmitter(), request };
  const store = { ready: Promise.resolve(), projects: [], threadProjects: {}, turnMetrics: {}, queues: {}, queueRevisions: {},
    listQueuedThreadIds: async () => [] };
  const conversations = createConversations({ store, codex });
  t.after(() => conversations.closeEventStreams());
  const routes = new Map();
  conversations.registerRoutes({ get: (path, fn) => routes.set(path, fn), post() {}, patch() {}, delete() {} });
  const stream = new EventEmitter();
  stream.writableLength = 0;
  stream.chunks = [];
  stream.writeHead = () => {};
  stream.write = (value) => { stream.chunks.push(value); return true; };
  stream.end = () => { stream.writableEnded = true; stream.emit("close"); };
  return {
    codex, stream,
    notify: (value) => codex.events.emit("notification", { method: "account/rateLimits/updated", params: { rateLimits: value } }),
    open: () => routes.get("/api/events")({ identity: { user: { id: "user" }, session: { expiresAt: Date.now() + 60_000 } },
      codexUrl: new URL("http://localhost/api/events?scope=workspace") }, stream),
    read: async () => {
      let body;
      await routes.get("/api/account/rate-limits")({}, { writeHead() {}, end(value) { body = JSON.parse(value); } });
      return body;
    },
  };
}

test("bucket notifications update Codex percentages without overwriting unrelated buckets or reviving null windows", () => {
  let data = mergeAccountRateLimits(null, snapshot(90, "other"));
  assert.equal(accountLimitWindows(data).fiveHour, null);
  data = mergeAccountRateLimits(data, snapshot(20));
  data = mergeAccountRateLimits(data, snapshot(95, "other"));
  assert.equal(accountLimitWindows(data).fiveHour.usedPercent, 20);
  assert.equal(data.rateLimitsByLimitId.other.primary.usedPercent, 95);
  data = mergeAccountRateLimits(data, { limitId: "codex", primary: null, secondary: null });
  assert.equal(accountLimitWindows(data).fiveHour, null);
});

test("notifications broadcast actual snapshots and refresh the read cache instead of invalidating it", async (t) => {
  let now = 1000, reads = 0;
  t.mock.method(Date, "now", () => now);
  const h = harness(t, async (method) => { assert.equal(method, "account/rateLimits/read"); reads++; return { rateLimits: snapshot(50) }; });
  await h.open();
  for (let percent = 10; percent < 20; percent++) {
    h.notify(snapshot(percent));
    assert.equal((await h.read()).rateLimitsByLimitId.codex.primary.usedPercent, percent);
  }
  assert.equal(reads, 0);
  const messages = h.stream.chunks.join("").split("\n").filter((line) => line.startsWith("data: ")).map((line) => JSON.parse(line.slice(6)));
  assert.equal(messages.filter((message) => message.rateLimits).length, 10);
  assert.equal(messages.at(-1).rateLimits.primary.usedPercent, 19);
  now += 15_001;
  assert.equal((await h.read()).rateLimits.primary.usedPercent, 50);
  assert.equal(reads, 1);
});

test("concurrent reads share one request and late HTTP data cannot overwrite newer notified buckets", async (t) => {
  let reads = 0;
  const pending = deferred();
  const h = harness(t, (method) => { assert.equal(method, "account/rateLimits/read"); reads++; return pending.promise; });
  const a = h.read(), b = h.read();
  assert.equal(reads, 1);
  h.notify(snapshot(37));
  h.notify(snapshot(90, "other"));
  pending.resolve({ rateLimits: snapshot(1), rateLimitsByLimitId: { codex: snapshot(1), images: snapshot(12, "images") },
    rateLimitResetCredits: { availableCount: 2 } });
  for (const result of await Promise.all([a, b])) {
    assert.equal(accountLimitWindows(result).fiveHour.usedPercent, 37);
    assert.equal(result.rateLimitsByLimitId.other.primary.usedPercent, 90);
    assert.equal(result.rateLimitsByLimitId.images.primary.usedPercent, 12);
    assert.equal(result.rateLimitResetCredits.availableCount, 2);
  }
});

test("an unrelated first notification does not suppress the initial Codex quota read", async (t) => {
  let reads = 0;
  const h = harness(t, async () => { reads++; return { rateLimits: snapshot(25) }; });
  h.notify(snapshot(90, "other"));
  assert.equal(accountLimitWindows(await h.read()).fiveHour.usedPercent, 25);
  assert.equal(reads, 1);
});

test("a failed older read keeps newer notified limits; a plain failure permits a later retry", async (t) => {
  const pending = deferred();
  let attempts = 0;
  const h = harness(t, async () => { if (++attempts === 1) throw new Error("temporary"); return pending.promise; });
  assert.equal((await h.read()).available, false);
  const reading = h.read();
  h.notify(snapshot(42));
  pending.reject(new Error("older request failed"));
  assert.equal(accountLimitWindows(await reading).fiveHour.usedPercent, 42);
  assert.equal(attempts, 2);
});

test("the client coalesces reads, consumes snapshots directly and protects them from late read results", async () => {
  const source = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  const functions = source.slice(source.indexOf("function loadAccountRateLimits()"), source.indexOf("\nfunction renderAccountLimits()"));
  const pending = deferred();
  const timers = new Map();
  const state = { accountRateLimits: null, accountLimitsRevision: 0, accountLimitsRequest: null, accountLimitsUpdates: new Map() };
  let reads = 0, renders = 0;
  const client = runInNewContext(`${functions}\n({ loadAccountRateLimits, applyAccountRateLimitsSnapshot, scheduleAccountRateLimitsRefresh })`, {
    state, mergeAccountRateLimits, renderAccountLimits: () => renders++, api: () => { reads++; return pending.promise; },
    setTimeout: (fn) => { timers.set(fn, fn); return fn; }, clearTimeout: (id) => timers.delete(id),
  });
  const a = client.loadAccountRateLimits(), b = client.loadAccountRateLimits();
  assert.equal(a, b);
  client.scheduleAccountRateLimitsRefresh();
  client.applyAccountRateLimitsSnapshot(snapshot(37));
  client.applyAccountRateLimitsSnapshot(snapshot(90, "other"));
  assert.equal(timers.size, 0);
  assert.equal(accountLimitWindows(state.accountRateLimits).fiveHour.usedPercent, 37);
  pending.resolve({ available: true, rateLimits: snapshot(1), rateLimitsByLimitId: { codex: snapshot(1), images: snapshot(12, "images") } });
  await a;
  assert.equal(reads, 1);
  assert.equal(accountLimitWindows(state.accountRateLimits).fiveHour.usedPercent, 37);
  assert.equal(state.accountRateLimits.rateLimitsByLimitId.images.primary.usedPercent, 12);
  assert.equal(state.accountLimitsRequest, null);
  assert.equal(renders, 3);
});

test("a late browser transport failure does not clear a newer notification", async () => {
  const source = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  const functions = source.slice(source.indexOf("function loadAccountRateLimits()"), source.indexOf("\nfunction renderAccountLimits()"));
  const pending = deferred();
  const state = { accountRateLimits: null, accountLimitsRevision: 0, accountLimitsRequest: null, accountLimitsUpdates: new Map() };
  const client = runInNewContext(`${functions}\n({ loadAccountRateLimits, applyAccountRateLimitsSnapshot })`, {
    state, mergeAccountRateLimits, renderAccountLimits() {}, api: () => pending.promise, clearTimeout() {},
  });
  const reading = client.loadAccountRateLimits();
  client.applyAccountRateLimitsSnapshot(snapshot(42));
  pending.reject(new Error("network interrupted"));
  await reading;
  assert.equal(accountLimitWindows(state.accountRateLimits).fiveHour.usedPercent, 42);
  assert.equal(state.accountLimitsRequest, null);
});
