import assert from "node:assert/strict";
import test from "node:test";
import { CodexHistory } from "../server/agents/codex/history.mjs";
import { NativeProjection } from "../server/agents/codex/native-projection.mjs";
import { encodePosition } from "../server/agents/codex/presentation.mjs";
import { WorkspaceStore } from "../server/workspace-store.mjs";

test("item pagination reconciles persisted recovery copies before rendering the summary", async (t) => {
  let recoveryCount = 1;
  const item = { id: "cmd", type: "commandExecution", command: "echo done", status: "completed", aggregatedOutput: "done" };
  const history = new CodexHistory({ request: async (method) => method === "thread/turns/list"
    ? { data: [{ id: "r", status: "completed" }] } : { data: [{ item }] } }, new NativeProjection(), {
    reconcileExecutionSupplements: async (id, turns) => { assert.equal(id, "c"); assert.equal(turns[0].items[0].aggregatedOutput, "done"); recoveryCount = 0; },
    getTurnPresentation: async () => ({ recoveryCount }),
  });
  t.after(() => history.resources.close());
  const page = await history.page("c");
  assert.equal(page.rows.at(-1).kind, "summary");
  assert.equal(page.rows.at(-1).recoveryDetailId, undefined);
});

test("sessions without paginated thread support fall back to thread read", async (t) => {
  const history = new CodexHistory({ request: async (method) => {
    if (method === "thread/turns/list") throw new Error("paginated_threads is not supported");
    assert.equal(method, "thread/read");
    return { thread: { id: "legacy", turns: [{ id: "r", status: "completed", items: [
      { id: "answer", type: "agentMessage", text: "preserved answer" },
    ] }] } };
  } }, new NativeProjection(), { reconcileExecutionSupplements: async () => {} });
  t.after(() => history.resources.close());
  const page = await history.page("legacy");
  assert.deepEqual(page.rows.map((row) => row.kind), ["assistant", "summary"]);
  assert.equal(page.rows[0].text, "preserved answer");
  assert.equal(page.before, null);
});

test("cumulative diff reads all item pages on demand and retains the latest change for each path", async (t) => {
  let calls = 0;
  const history = new CodexHistory({ request: async (method, params) => {
    assert.equal(method, "thread/items/list"); calls++;
    return params.cursor ? { data: [{ item: { id: "b", type: "fileChange", changes: [{ path: "a.ts", diff: "+latest" }, { path: "b.ts", diff: "+added" }] } }], nextCursor: null }
      : { data: [{ item: { id: "a", type: "fileChange", changes: [{ path: "a.ts", diff: "+old" }] } }], nextCursor: "next" };
  } }, new NativeProjection(), {});
  t.after(() => history.resources.close());
  const result = await history.details("c", { ref: encodePosition({ kind: "items", page: null, run: "r", item: "$diff" }) });
  assert.equal(calls, 2); assert.ok(result.text.includes("+latest")); assert.ok(result.text.includes("+added")); assert.ok(!result.text.includes("+old")); assert.equal(result.nextCursor, null);
});

test("nested stable cursors preserve empty turns and item order across concurrent appends", async () => {
  const turns = [{ id: "empty", status: "failed", items: [] }, { id: "large", status: "completed", items:
    Array.from({ length: 123 }, (_, index) => ({ id: `i-${index}`, type: "commandExecution", command: String(index), status: "completed" })) }];
  const calls = [];
  const connection = { request: async (method, params) => {
    calls.push({ method, params });
    const ordered = (method === "thread/turns/list" ? turns : turns.find((turn) => turn.id === params.turnId).items).toSpliced();
    if (params.sortDirection === "desc") ordered.reverse();
    const token = params.cursor;
    const anchor = typeof token === "object" ? token.itemId : token?.slice(1);
    const start = anchor ? ordered.findIndex((entry) => entry.id === anchor) + (typeof token === "object" || token[0] === ">" ? 1 : 0) : 0;
    const page = ordered.slice(start, start + params.limit);
    return { data: method === "thread/turns/list" ? page.map((turn) => ({ ...turn, items: [] })) : page.map((item) => ({ item, turnId: params.turnId })),
      nextCursor: start + page.length < ordered.length ? ">" + page.at(-1).id : null, backwardsCursor: page.length ? "=" + page[0].id : null };
  } };
  const projection = new NativeProjection(), history = new CodexHistory(connection, projection, {});
  const first = await history.page("c", { limit: 13 });
  turns.push({ id: "newer", status: "inProgress", items: [] });
  const pages = [first.rows]; let before = first.before;
  while (before) { const page = await history.page("c", { before, limit: 13 }); pages.unshift(page.rows); before = page.before; }
  const all = pages.flat();
  assert.deepEqual(all.map((row) => row.kind === "summary" ? row.runId : row.title), ["empty", ...Array.from({ length: 123 }, (_, index) => String(index)), "large"]);
  assert.equal(new Set(all.map((row) => row.id)).size, 125);
  assert.ok(calls.every(({ method, params }) => method !== "thread/turns/list" || params.itemsView === "notLoaded"));
  assert.ok(calls.every(({ method, params }) => method !== "thread/items/list" || params.limit <= 50 && params.turnId));
});

test("full-turn export reads each large native item once and keeps plan and recovery provenance", async (t) => {
  const output = "🙂x".repeat(20_000), items = [
    { id: "user", type: "userMessage", content: [{ type: "text", text: "request" }] },
    { id: "command", type: "commandExecution", command: "work", aggregatedOutput: output, status: "completed" },
  ];
  let reads = 0;
  const history = new CodexHistory({ request: async (method, params) => {
    assert.equal(method, "thread/items/list"); reads++;
    const index = params.cursor ? items.findIndex((item) => item.id === params.cursor.itemId) + 1 : 0;
    return { data: items.slice(index, index + 1).map((item) => ({ item })), nextCursor: index + 1 < items.length ? { type: "item", itemId: items[index].id } : null };
  } }, new NativeProjection(), {
    getTurnPresentation: async () => ({ plan: { plan: [{ step: "preserved plan", status: "completed" }] }, recoveryCount: 1 }),
    getRecoveryItem: async () => ({ count: 1, snapshot: { id: "missing", type: "commandExecution", command: "recovered command", aggregatedOutput: "recovered output" } }),
  });
  t.after(() => history.resources.close());
  const parts = [];
  for await (const part of history.export("c", encodePosition({ kind: "items", page: null, run: "r", item: "$turn" }))) parts.push(part);
  const markdown = parts.join("");
  assert.equal(Buffer.concat(parts.map((part) => Buffer.from(part, "utf8"))).toString("utf8"), markdown);
  assert.equal(reads, 2); assert.ok(markdown.includes(output)); assert.match(markdown, /preserved plan/);
  assert.match(markdown, /本地补充输出/); assert.match(markdown, /recovered output/);
  const recovery = await history.details("c", { ref: encodePosition({ kind: "items", page: null, run: "r", item: "$recovery" }) });
  assert.match(recovery.text, /recovered output/); assert.doesNotMatch(recovery.text, /## 本地恢复副本/);
});

test("partial native pages keep persisted timing and plans without exposing command bodies", async () => {
  const history = new CodexHistory({ request: async (method) => method === "thread/turns/list" ? { data: [{ id: "r", status: "completed", startedAt: 1_700_000_000_000, completedAt: 1_700_000_012_000 }] }
    : { data: [{ item: { id: "last", type: "agentMessage", text: "done" } }], nextCursor: "older-items" } }, new NativeProjection(), {
    getTurnPresentation: async () => ({ plan: { plan: [{ step: "保留计划", status: "completed" }] }, commandMetrics: { cmd: { type: "commandExecution", durationMs: 800 } }, recoveryCount: 1 }),
  });
  const page = await history.page("c");
  const summary = page.rows.find((row) => row.kind === "summary");
  assert.deepEqual(summary.timing, { totalMs: 12000, commandMs: 800, commandCount: 1, commandUnknownCount: 0, providerMs: 11200 });
  assert.equal(summary.plan.plan[0].step, "保留计划"); assert.ok(summary.recoveryDetailId);
  assert.equal(summary.commandMetrics, undefined);
});

test("recovery audits locate retained command output rather than repeating it in the summary", async (t) => {
  const duplicate = { id: "early", type: "commandExecution", command: "echo earlier", cwd: "D:/project", status: "completed", aggregatedOutput: "earlier output", durationMs: 10 };
  const unique = { ...duplicate, id: "unique", aggregatedOutput: "locally preserved output" };
  const store = Object.assign(Object.create(WorkspaceStore.prototype), { ready: Promise.resolve(), turnMetrics: { c: { r: { completedAt: 100, items: {
    early: { type: "commandExecution", snapshot: duplicate }, unique: { type: "commandExecution", snapshot: unique },
  } } } }, persist: async () => {} });
  const calls = [];
  const history = new CodexHistory({ request: async (method, params) => {
    calls.push({ method, params });
    if (method === "thread/turns/list") return { data: [{ id: "r", status: "completed" }] };
    if (params.sortDirection === "desc") return { data: [{ item: { id: "answer", type: "agentMessage", text: "done" } }], nextCursor: "earlier" };
    return params.cursor ? { data: [{ item: { ...unique, aggregatedOutput: "different native output" } }], nextCursor: null }
      : { data: [{ item: duplicate }], nextCursor: "next" };
  } }, new NativeProjection(), store);
  t.after(() => history.resources.close());
  const page = await history.page("c");
  const ref = page.rows.find((row) => row.kind === "summary").recoveryDetailId;
  assert.ok(ref);
  assert.equal(calls.length, 2, "normal transcript paging remains bounded and does not scan the turn");
  const recovery = await history.details("c", { ref });
  assert.doesNotMatch(recovery.text, /earlier output/);
  assert.equal(recovery.text, "");
  assert.equal(store.turnMetrics.c.r.items.early.snapshot, undefined);
  assert.ok(store.turnMetrics.c.r.items.unique.snapshot);
  assert.equal(store.turnMetrics.c.r.items.unique.canonicalItemPresent, true);
  assert.equal((await store.getTurnPresentation("c", "r")).recoveryCount, 0);
  assert.ok(calls.filter((call) => call.params.sortDirection === "asc").every((call) => call.params.limit === 50));
});

test("command details and complete export retain unique local output at its canonical command", async (t) => {
  const known = { id: "known", type: "commandExecution", command: "work", status: "completed", aggregatedOutput: "native output" };
  const lost = { id: "lost", type: "commandExecution", command: "interrupted work", status: "inProgress", aggregatedOutput: "only preserved locally" };
  const startup = { id: "startup", type: "commandExecution", command: "not confirmed", status: "inProgress" };
  const items = [known, { id: "answer", type: "agentMessage", text: "done" }], calls = [];
  const store = Object.assign(Object.create(WorkspaceStore.prototype), { ready: Promise.resolve(), turnMetrics: { c: { r: { items: {
    known: { snapshot: { ...known, aggregatedOutput: "unique local fragment" } }, lost: { snapshot: lost }, startup: { snapshot: startup },
  } } } }, persist: async () => {} });
  const history = new CodexHistory({ request: async (method, params) => {
    assert.equal(method, "thread/items/list"); calls.push(params);
    const ordered = params.sortDirection === "desc" ? items.toReversed() : items;
    const start = params.cursor ? ordered.findIndex((item) => item.id === params.cursor.itemId) + 1 : 0;
    const data = ordered.slice(start, start + params.limit);
    return { data: data.map((item) => ({ item })), nextCursor: start + data.length < ordered.length ? { type: "item", itemId: data.at(-1).id } : null };
  } }, new NativeProjection(), store);
  t.after(() => history.resources.close());
  const detail = await history.details("c", { ref: encodePosition({ kind: "items", page: null, run: "r", item: "known" }) });
  assert.match(detail.text, /native output/); assert.match(detail.text, /unique local fragment/);
  assert.match(detail.text, /同一命令/);
  const recovery = await history.details("c", { ref: encodePosition({ kind: "items", page: null, run: "r", item: "$recovery" }) });
  assert.match(recovery.text, /only preserved locally/);
  assert.doesNotMatch(recovery.text, /unique local fragment|not confirmed/);
  calls.length = 0;
  const parts = [];
  for await (const part of history.export("c", encodePosition({ kind: "items", page: null, run: "r", item: "$turn" }))) parts.push(part);
  const markdown = parts.join("");
  assert.match(markdown, /unique local fragment/); assert.match(markdown, /only preserved locally/);
  assert.doesNotMatch(markdown, /not confirmed/);
  assert.equal((markdown.match(/## 本地补充输出/g) || []).length, 1);
  assert.equal(calls.length, items.length, "export reads each canonical item once without a second scan");
  assert.ok(store.turnMetrics.c.r.items.startup.snapshot, "internal start snapshots remain in storage");
});

test("terminal formatting differences do not produce a second displayed output", async (t) => {
  const item = { id: "cmd", type: "commandExecution", command: "work", status: "completed", aggregatedOutput: "first\nlast\n" };
  const snapshot = { ...item, aggregatedOutput: "\u001b[32mfirst\r\nlast\r\n\u001b[0m" };
  const store = Object.assign(Object.create(WorkspaceStore.prototype), { ready: Promise.resolve(), turnMetrics: { c: { r: { items: { cmd: { snapshot } } } } }, persist: async () => {} });
  const history = new CodexHistory({}, new NativeProjection(), store);
  t.after(() => history.resources.close());
  const text = await history.executionText("c", "r", item);
  assert.doesNotMatch(text, /本地保留的输出片段/);
  assert.equal(store.turnMetrics.c.r.items.cmd.snapshot.aggregatedOutput, snapshot.aggregatedOutput, "presentation normalization never discards the raw backup");
  assert.equal((await store.getTurnPresentation("c", "r")).recoveryCount, 0);
});

test("fully covered recovery resources return no content; active-turn snapshots are not recovery UI", async (t) => {
  const item = { id: "cmd", type: "commandExecution", command: "work", status: "completed", aggregatedOutput: "done" };
  const store = Object.assign(Object.create(WorkspaceStore.prototype), { ready: Promise.resolve(), turnMetrics: { c: { r: { items: { cmd: { snapshot: item } } } } }, persist: async () => {} });
  const history = new CodexHistory({ request: async (method) => method === "thread/turns/list" ? { data: [{ id: "r", status: "inProgress" }] }
    : { data: [{ item }] } }, new NativeProjection(), store);
  t.after(() => history.resources.close());
  const active = await history.page("c");
  assert.equal(active.rows.find((row) => row.kind === "summary").recoveryDetailId, undefined);
  store.turnMetrics.c.r.items.cmd.snapshot = item;
  const recovery = await history.details("c", { ref: encodePosition({ kind: "items", page: null, run: "r", item: "$recovery" }) });
  assert.equal(recovery.text, ""); assert.equal(recovery.nextCursor, null);
});
