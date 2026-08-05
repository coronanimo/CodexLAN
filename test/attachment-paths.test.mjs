import test from "node:test";
import assert from "node:assert/strict";

import { attachmentRelativeDirectory, storedAttachmentName } from "../attachment-paths.js";

test("stores sent attachments under the app-owned thread directory", () => {
  const directory = attachmentRelativeDirectory("thread-123", Date.UTC(2026, 7, 5));
  assert.match(directory.replace(/\\/g, "/"), /^\.codexlan\/attachments\/thread-123\/2026-08-05$/);
  assert.equal(storedAttachmentName("screen.png", "unique-id"), "unique-id-screen.png");
});
