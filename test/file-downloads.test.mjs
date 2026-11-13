import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import express from "express";
import { registerProjects } from "../server/projects.mjs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

test("remote previews reject oversized files before transfer while full downloads remain available", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "codexlan-preview-limit-"));
  await writeFile(join(root, "large.log"), "x".repeat(200001)); await writeFile(join(root, "small.md"), "# Small");
  const app = express();
  app.use((request, response, next) => { request.identity = { user: { id: "admin", role: "admin" } }; request.codexUrl = new URL(request.originalUrl, "http://localhost"); next(); });
  registerProjects(app, { store: { getProject: async () => ({ path: root }) } });
  app.use((error, request, response, next) => response.status(error.statusCode || 500).json({ error: error.message }));
  const server = createServer(app); server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const route of ["/api/projects/p/files/download?path=large.log", `/api/admin/files/download?path=${encodeURIComponent(join(root, "large.log"))}`]) {
    const preview = await fetch(origin + route + "&preview=true");
    assert.equal(preview.status, 413); assert.match(await preview.text(), /200 KB/);
    const download = await fetch(origin + route); assert.equal(download.status, 200); assert.equal((await download.text()).length, 200001);
  }
  const small = await fetch(origin + "/api/projects/p/files/download?path=small.md&preview=true");
  assert.equal(small.status, 200); assert.equal(await small.text(), "# Small");
});


test("project downloads support HEAD preflight, preserve filenames and reject escaped paths", async () => {
  const root = dirname(fileURLToPath(import.meta.url));
  const app = express();
  app.use((request, response, next) => {
    request.identity = { user: { id: "owner", role: "member" } };
    request.codexUrl = new URL(request.originalUrl, "http://localhost");
    next();
  });
  registerProjects(app, {
    store: { getProject: async (id, userId) => { assert.equal(id, "owned"); assert.equal(userId, "owner"); return { path: root }; } },
    conversations: {},
  });
  app.use((error, request, response, next) => response.status(error.statusCode || 500).json({ error: error.message }));
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/projects/owned/files/download?path=${encodeURIComponent("fixtures/fake-app-server.mjs")}`;
    const head = await fetch(url, { method: "HEAD" });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), "");
    assert.match(head.headers.get("content-disposition"), /attachment; filename="fake-app-server.mjs"/);
    assert.ok(Number(head.headers.get("content-length")) > 0);
    const get = await fetch(url);
    assert.equal(get.status, 200);
    assert.equal(get.headers.get("content-length"), head.headers.get("content-length"));
    assert.match(await get.text(), /createInterface/);
    const escaped = await fetch(url.replace(encodeURIComponent("fixtures/fake-app-server.mjs"), encodeURIComponent(join(root, "..", "package.json"))), { method: "HEAD" });
    assert.equal(escaped.status, 403);
    const missing = await fetch(url.replace("fake-app-server.mjs", "nonexistent-download.pdf"), { method: "HEAD" });
    assert.equal(missing.status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
