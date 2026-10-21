import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import express from "express";
import { downloadableFiles, downloadLocalFile, localFileDownloadUrl } from "../public/file-downloads.js";
import { registerProjects } from "../server/projects.mjs";

const projects = [{ id: "parent", path: "F:/work" }, { id: "child", path: "F:/work/reports" }];
const downloadUrl = (path, role = "admin") => new URL(localFileDownloadUrl({ projects, projectId: "current", role, path, name: "报告.pdf" }), "http://localhost");

test("relative final-answer files stay in the conversation project for administrators and members", () => {
  for (const role of ["admin", "member"]) {
    for (const path of ["report.pdf", "./output/报告.pdf", "output\\报告.pdf"]) {
      const url = downloadUrl(path, role);
      assert.equal(url.pathname, "/api/projects/current/files/download");
      assert.equal(url.searchParams.get("path"), path);
      assert.equal(url.searchParams.get("name"), "报告.pdf");
    }
  }
  assert.equal(downloadUrl("f:\\work\\reports\\报告.pdf").pathname, "/api/projects/child/files/download");
  assert.equal(downloadUrl("C:/Temp/报告.pdf").pathname, "/api/admin/files/download");
  assert.equal(downloadUrl("C:/Temp/报告.pdf", "member").pathname, "/api/projects/current/files/download");
  const { files } = downloadableFiles("下载 [报告](output/报告.pdf)");
  assert.equal(downloadUrl(files[0].path).pathname, "/api/projects/current/files/download");
});

test("download checks use the current session then navigate in the same WebView, without reading file data", async () => {
  const calls = [];
  const url = downloadUrl("report.pdf").href;
  await downloadLocalFile(url, {
    fetchFile: async (...args) => { calls.push(args); return { ok: true, status: 200 }; },
    navigate: (target) => calls.push(["navigate", target]),
  });
  assert.deepEqual(calls, [[url, { method: "HEAD", credentials: "same-origin", cache: "no-store" }], ["navigate", url]]);
});

test("failed downloads stay on the conversation and distinguish login, access, missing files and offline service", async () => {
  for (const [status, message] of [[401, /重新登录/], [403, /无权下载/], [404, /不存在或已经移动/], [409, /目录当前不可用/], [400, /文件路径/]]) {
    await assert.rejects(downloadLocalFile("/download", {
      fetchFile: async () => ({ ok: false, status }),
      navigate: () => assert.fail("failed downloads must not leave the page"),
    }), message);
  }
  await assert.rejects(downloadLocalFile("/download", {
    fetchFile: async () => { throw new TypeError("Failed to fetch"); },
    navigate: () => assert.fail("offline downloads must not leave the page"),
  }), /检查网络/);
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
