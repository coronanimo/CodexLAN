import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("all dialog cancel controls bypass required-field validation", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const cancelButtons = [...html.matchAll(/<button[^>]*value="cancel"[^>]*>/g)].map((match) => match[0]);
  assert.ok(cancelButtons.length > 2);
  assert.ok(cancelButtons.every((button) => button.includes("formnovalidate")));
});

test("file preview exposes copy and share actions", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  assert.match(html, /id="copy-markdown-preview"[^>]*disabled/);
  assert.match(html, /id="share-markdown-preview"[^>]*disabled/);
});

test("thread naming dialog offers a model-generated suggestion without saving immediately", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const script = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  assert.match(html, /id="suggest-thread-name"[^>]*type="button"[^>]*>自动生成<\/button>/);
  assert.match(script, /\/name\/suggest/);
  assert.match(script, /名称已生成，确认后保存。/);
});

test("image preview stays light and does not frame the image", async () => {
  const css = await readFile(new URL("../public/content.css", import.meta.url), "utf8");
  assert.match(css, /\.image-preview-dialog \{[^}]*background: var\(--surface\);/);
  assert.match(css, /\.image-preview-stage \{[^}]*background: var\(--surface-subtle\);/);
  assert.doesNotMatch(css, /\.image-preview-stage img \{[^}]*box-shadow:/);
  assert.doesNotMatch(css, /\.image-preview-(?:dialog|header|heading|actions|stage)[^{]*\{[^}]*(?:#101722|#152131|#8eb8f5|#3074d5)/);
});
