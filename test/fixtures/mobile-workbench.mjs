import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { fixtureService } from "./lan-service.mjs";

// Uses the compiled application, HTTP adapters and provider fixture together.
// No production identities, sessions, project files or native tasks are used.
const cleanups = [];
const f = await fixtureService({ after: (fn) => cleanups.push(fn) }, { CODEX_WEB_HOST: "auto", CODEX_TEST_SEED_CONTENT: "1", CODEX_TEST_REQUIRE_LOADED: "1" }, { seed: true });
const root = f.bootstrap.projects[0].path;
await Promise.all([
  writeFile(join(root, "report.md"), "# 项目报告\n\n这是 **完整 HTTP 链路** 的 Markdown 预览。\n\n| 行为 | 状态 |\n|---|---|\n| 文件预览 | 保留 |"),
  writeFile(join(root, "chart.html"), "<h1>交互图表</h1><button id=\"counter\">0</button><script>document.querySelector('button').onclick=function(){this.textContent=Number(this.textContent)+1;}</script>"),
  writeFile(join(root, "result.png"), Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN0cAAAAASUVORK5CYII=", "base64")),
]);
const health = (await f.request("/api/health")).body;
const stopFile = join(f.root, ".stop");
console.log(JSON.stringify({ url: health.listeners.lan.url, username: "admin", password: "admin-pass-123", isolatedRoot: f.root, projectId: f.bootstrap.projects[0].id, stopFile }));
await new Promise((resolve) => {
  const timer = setInterval(() => { if (existsSync(stopFile)) { clearInterval(timer); resolve(); } }, 300);
  const stop = () => { clearInterval(timer); resolve(); };
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
});
for (const close of cleanups) await close();
