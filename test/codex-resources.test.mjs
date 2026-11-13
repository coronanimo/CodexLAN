import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { CodexResources } from "../server/agents/codex/resources.mjs";

test("cache eviction keeps an acquired output readable until its last reader releases it", async (t) => {
  const resources = new CodexResources({ maxEntries: 1, maxBytes: 100 });
  t.after(() => resources.close());
  const first = await resources.acquire("first", async () => "first output");
  const second = await resources.slice("second", 0, async () => "second output");
  assert.equal(second.text, "second output"); assert.equal(resources.entries.has("first"), false);
  assert.equal(await readFile(first.path, "utf16le"), "first output");
  await resources.release(first);
  await assert.rejects(readFile(first.path), { code: "ENOENT" });
  assert.equal(resources.entries.size, 1); assert.equal(resources.bytes, "second output".length * 2);
});

test("concurrent readers share one native load even while another output evicts it", async (t) => {
  const resources = new CodexResources({ maxEntries: 1, maxBytes: 100 });
  t.after(() => resources.close());
  let calls = 0, finish;
  const load = () => { calls++; return new Promise(resolve => { finish = resolve; }); };
  const first = resources.slice("shared", 0, load), second = resources.slice("shared", 0, load);
  const other = resources.slice("other", 0, async () => "other output");
  finish("shared output");
  const values = await Promise.all([first, second, other]);
  assert.deepEqual(values.map(value => value.text), ["shared output", "shared output", "other output"]);
  assert.equal(calls, 1); assert.equal(resources.entries.size, 1);
  assert.ok([...resources.entries.values()].every(entry => entry.leases === 0));
});
