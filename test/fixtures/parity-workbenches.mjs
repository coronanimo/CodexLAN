import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { fixtureService } from "./lan-service.mjs";

// Read the installed original as a reference; both applications receive only
// temporary identities, projects and a simulated provider. Production stays up.
const manifest = JSON.parse(await readFile(join(process.env.LOCALAPPDATA, "Programs", "CodexLAN", "deployment.json"), "utf8"));
const root = await mkdtemp(join(tmpdir(), "lan-ui-parity-")), workspace = join(root, "workspace"), originalWorkspace = join(root, "original-workspace"), originalData = join(root, "original-data");
await Promise.all([mkdir(workspace), mkdir(originalWorkspace), mkdir(originalData)]);
const projectPath = join(workspace, "默认项目"), cleanup = [];
const f = await fixtureService({ after: (fn) => cleanup.push(fn) }, { CODEX_WORKDIR: workspace, CODEX_TEST_SEED_CWD: projectPath, CODEX_TEST_SEED_CONTENT: "1", CODEX_TEST_SEED_FOOTER: "1", CODEX_TEST_REQUIRE_LOADED: "1", ...(process.env.LAN_TEST_ACTIVE_WRITER === '1' ? { CODEX_TEST_ACTIVE_WRITER: '1' } : {}) });
await Promise.all([
  writeFile(join(projectPath, "report.md"), "# 项目报告\n\n**原版与 React 使用相同内容。**\n\n| 项目 | 状态 |\n|---|---|\n| 保留体验 | 对照 |"),
  writeFile(join(projectPath, "chart.html"), "<h1>交互图表</h1><button>0</button><script>document.querySelector('button').onclick=function(){this.textContent=Number(this.textContent)+1}</script>"),
  writeFile(join(projectPath, "result.png"), Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN0cAAAAASUVORK5CYII=", "base64")),
]);
const probe = createServer(); await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
const port = probe.address().port; await new Promise((resolve) => probe.close(resolve));
const originalUrl = `http://127.0.0.1:${port}`;
const original = spawn(process.execPath, ["server/index.mjs"], { cwd: manifest.Release, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, NODE_ENV: "test", CODEX_CONFIG: "0", CODEX_WEB_HOST: "127.0.0.1", CODEX_WEB_PORT: String(port), CODEX_WORKDIR: originalWorkspace,
    CODEX_WEB_DATA_DIR: originalData, CODEX_LOG_DIR: join(root, "original-logs"), CODEX_TEST_APP_SERVER: fileURLToPath(new URL("fake-app-server.mjs", import.meta.url)),
    CODEX_TEST_SEED_CWD: join(originalWorkspace, "默认项目"), CODEX_TEST_SEED_CONTENT: "1", CODEX_TEST_SEED_FOOTER: "1" } });
let errors = ""; original.stdout.on("data", () => {}); original.stderr.on("data", (chunk) => { errors += chunk; });
cleanup.push(async () => { if (original.exitCode === null) { const exit = new Promise((resolve) => original.once("exit", resolve)); original.kill(); await exit; } });
try {
  for (let i = 0; ; i++) {
    if (original.exitCode !== null || i > 100) throw new Error(`Original reference did not start: ${errors}`);
    try { if ((await fetch(originalUrl + "/api/health")).ok) break; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const setup = await fetch(originalUrl + "/api/auth/setup", { method: "POST", headers: { Origin: originalUrl, "Content-Type": "application/json" }, body: JSON.stringify({ username: "admin", displayName: "Admin", password: "admin-pass-123" }) });
  if (!setup.ok) throw new Error(`Original reference setup failed: ${setup.status} ${await setup.text()}`);
  const originalIdentity = { cookie: setup.headers.get("set-cookie").split(";")[0], csrf: (await setup.json()).csrfToken };
  const originalRequest = async (path, body, method = "POST") => {
    const response = await fetch(originalUrl + path, { method, headers: { Origin: originalUrl, Cookie: originalIdentity.cookie, "X-Codex-CSRF-Token": originalIdentity.csrf, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const value = await response.json(); if (!response.ok) throw new Error(`Original fixture ${path}: ${JSON.stringify(value)}`); return value;
  };
  for (const name of ["第二项目", "第三项目"]) {
    const originalProject = (await originalRequest("/api/projects", { name })).project;
    const reactProject = (await f.request("/api/projects", { ...f.admin, method: "POST", body: { name } })).body.project;
    for (let index = 1; index <= 3; index++) {
      const title = `${name} · 对话 ${index}`;
      await originalRequest("/api/threads", { projectId: originalProject.id, name: title });
      const created = await f.request(`/api/lan/projects/${reactProject.id}/conversations`, { ...f.admin, method: "POST", body: {} });
      const renamed = await f.request(`/api/lan/conversations/${created.body.id}/commands`, { ...f.admin, method: "POST", body: { projectId: reactProject.id, command: { type: "rename", name: title } } });
      if (renamed.status !== 200) throw new Error(`React fixture rename: ${JSON.stringify(renamed.body)}`);
    }
  }
  await Promise.all(["report.md", "chart.html", "result.png"].map((name) => copyFile(join(projectPath, name), join(originalWorkspace, "默认项目", name))));
  console.log(JSON.stringify({ original: originalUrl, react: f.origin, username: "admin", password: "admin-pass-123", root, stopFile: join(root, ".stop") }));
  await new Promise((resolve) => {
    const timer = setInterval(() => { if (existsSync(join(root, ".stop"))) { clearInterval(timer); resolve(); } }, 300);
    process.once("SIGINT", () => { clearInterval(timer); resolve(); }); process.once("SIGTERM", () => { clearInterval(timer); resolve(); });
  });
} finally { for (const close of cleanup.reverse()) await close(); }
