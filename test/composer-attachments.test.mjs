import test from "node:test";
import assert from "node:assert/strict";

import {
  attachmentReference,
  clipboardImageFiles,
  clipboardImageName,
  messageWithAttachments,
} from "../public/composer.js";

test("clipboardImageFiles keeps only clipboard image files", () => {
  const png = { name: "pasted.png", type: "image/png" };
  const text = { name: "notes.txt", type: "text/plain" };
  const result = clipboardImageFiles({ items: [
    { kind: "string", type: "text/plain", getAsFile: () => null },
    { kind: "file", type: "text/plain", getAsFile: () => text },
    { kind: "file", type: "image/png", getAsFile: () => png },
  ] });
  assert.deepEqual(result, [png]);
});

test("clipboardImageName produces stable architecture-neutral image names", () => {
  assert.equal(clipboardImageName("image/jpeg", Date.UTC(2026, 7, 5, 4, 3, 2, 9)), "clipboard-20260805-040302-009.jpg");
  assert.equal(clipboardImageName("image/png", Date.UTC(2026, 7, 5), 1), "clipboard-20260805-000000-000-2.png");
});

test("messageWithAttachments supports image-only prompts and Windows paths", () => {
  const attachment = { name: "screen[1].png", path: "C:\\work\\screen.png" };
  assert.equal(attachmentReference(attachment), "[screen1.png](C:/work/screen.png)");
  assert.equal(messageWithAttachments("", [attachment]), "[screen1.png](C:/work/screen.png)");
  assert.equal(messageWithAttachments("看看这个", [attachment]), "看看这个\n[screen1.png](C:/work/screen.png)");
});
