import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("all dialog cancel controls bypass required-field validation", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const cancelButtons = [...html.matchAll(/<button[^>]*value="cancel"[^>]*>/g)].map((match) => match[0]);
  assert.ok(cancelButtons.length > 2);
  assert.ok(cancelButtons.every((button) => button.includes("formnovalidate")));
});
