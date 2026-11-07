import assert from "node:assert/strict";
import test from "node:test";
import { CodexHistory } from "../server/agents/codex/history.mjs";
import { NativeProjection } from "../server/agents/codex/native-projection.mjs";
import { encodePosition } from "../server/agents/codex/presentation.mjs";

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
    return { data: items.slice(index, index + 1).map((item) => ({ item })), nextCursor: index + 1 < items.length ? "more" : null };
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
  assert.match(markdown, /本地恢复副本 · 原始位置未知/); assert.match(markdown, /recovered output/);
});
