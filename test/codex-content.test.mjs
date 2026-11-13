import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { contentReferences } from "../server/agents/codex/content-references.mjs";
import { presentItem } from "../server/agents/codex/presentation.mjs";
import { presentationText } from "../server/agents/codex/protocol-values.mjs";
import { readVisualization } from "../server/agents/codex/visualization.mjs";
import { localFileDownloadUrl } from "../shared/content-files.mjs";

test("Windows visualization JSON keeps its backslashes while escaped links remain literal", () => {
  const path = "C:\\Users\\owner\\project\\chart.html";
  const result = contentReferences(`Before\nvisualize${JSON.stringify({ path, title: "Chart" })}\nAfter`);
  assert.equal(result.visualizations[0].path, path); assert.equal(result.text, "Before\n\nAfter");
  const escaped = "\\[example](docs/example.md)";
  assert.deepEqual(contentReferences(escaped), { text: escaped, files: [], visualizations: [] });
});

test("message roles, timestamps and timing remain presentation facts", () => {
  const turn = { id: "r", status: "completed", startedAt: 1700000000, completedAt: 1700000012, items: [{ id: "cmd", type: "commandExecution", durationMs: 800 }] };
  const guide = presentItem("c", turn, { id: "u", type: "userMessage", inputKind: "guide", content: [{ type: "text", text: "more" }] });
  assert.equal(guide.appearance, "guidance"); assert.equal(guide.author, "引导"); assert.equal(guide.timestamp, 1700000000000);
  const reply = presentItem("c", turn, { id: "u2", type: "userMessage", content: [{ type: "text", text: "[CodexLAN async answer: q]\n我的回答：继续" }] });
  assert.equal(reply.replyTo, "q"); assert.equal(reply.text, "我的回答：继续");
  const progress = presentItem("c", turn, { id: "a", type: "agentMessage", phase: "commentary", text: "Working" });
  assert.equal(progress.appearance, "progress"); assert.equal(progress.timestamp, 1700000012000);
  assert.deepEqual(presentItem("c", turn, null).timing, { totalMs: 12000, commandMs: 800, commandCount: 1, commandUnknownCount: 0, providerMs: 11200 });
  assert.equal(presentItem("c", { ...turn, itemsPartial: true }, null).timing, undefined, "partial item pages must not invent a complete command total");
});

test("original file directives become neutral cards and do not leak into reply or copy text", () => {
  const text = '报告 [文档](file:///D:/Project/report.md:12:4)\n:codex-file-citation{path="D:/Project/report.md" label="报告"}\nvisualize{"path":"D:/Project/chart.html","title":"结果图","mode":"wide"}';
  const result = contentReferences(text);
  assert.equal(result.files.length, 1); assert.equal(result.files[0].path, "D:/Project/report.md");
  assert.equal(result.visualizations[0].title, "结果图");
  const row = presentItem("c", { id: "r", status: "completed" }, { id: "a", type: "agentMessage", text });
  assert.equal(row.files[0].image, false); assert.equal(row.visualizations[0].mode, "wide");
  assert.equal(row.files[0].label, "报告");
  assert.equal(row.text, "报告 文档"); assert.equal(presentationText({ type: "agentMessage", text }), row.text);
  assert.equal(presentationText({ type: "userMessage", content: [{ type: "text", text: "[CodexLAN async answer: q]\n我的回答" }] }), "我的回答");
  assert.equal(contentReferences('[官网](https://example.com) visualizeinvalid').text, '[官网](https://example.com) visualizeinvalid');
});

test("two uploaded images stay two images across native and markdown Windows path forms", () => {
  const paths = ["C:\\uploads\\id-one.png", "C:\\uploads\\id-two.png"];
  const row = presentItem("c", { id: "r" }, { id: "u", type: "userMessage", content: [
    { type: "text", text: '看看这两张\n[first.png](C:/uploads/id-one.png)\n[second.png](c:/uploads/id-two.png)' },
    ...paths.map((path) => ({ type: "localImage", path })),
  ] });
  assert.equal(row.text, "看看这两张");
  assert.deepEqual(row.files, paths.map((path, index) => ({ path, name: index ? "id-two.png" : "id-one.png", label: index ? "second.png" : "first.png", image: true })));
  const inline = contentReferences('请比较 [第一张](C:/uploads/one.png) 和 [第二张](C:/uploads/two.png)', { omitStandaloneFileLabels: true });
  assert.equal(inline.text, "请比较 第一张 和 第二张");
});

test("file changes and image tools retain their original preview actions without embedding diff bodies", () => {
  const change = presentItem("c", { id: "r" }, { id: "f", type: "fileChange", changes: [{ path: "app.tsx", diff: "+private detail" }] });
  assert.equal(change.preview, "diff"); assert.equal(change.title, "已修改 1 个文件"); assert.equal(change.label, "文件"); assert.deepEqual(change.changes, { files: 1, added: 1, removed: 0 }); assert.ok(!JSON.stringify(change).includes("private detail"));
  const image = presentItem("c", { id: "r" }, { id: "i", type: "imageView", path: "D:/Project/output.png" });
  assert.equal(image.preview, "image"); assert.equal(image.files[0].path, "D:/Project/output.png");
  const options = { projects: [{ id: "p", path: "D:/Project" }, { id: "child", path: "D:/Project/nested" }], projectId: "current", role: "admin", path: "D:/Project/nested/report.md" };
  assert.match(localFileDownloadUrl(options), /^\/api\/projects\/child\/files\/download/);
  assert.match(localFileDownloadUrl({ ...options, path: "report.md" }), /^\/api\/projects\/current\/files\/download/);
  assert.match(localFileDownloadUrl({ ...options, path: "E:/outside/report.md" }), /^\/api\/admin\/files\/download/);
});

test("interactive HTML retains scripts and original document styles within the existing project boundary", async () => {
  const root = await mkdtemp(join(tmpdir(), "lan-visualization-")), projectPath = join(root, "project"), inside = join(projectPath, "chart.html"), outside = join(root, "outside.html");
  await mkdir(projectPath); await writeFile(inside, "<button>0</button><script>document.querySelector('button').onclick=()=>{}</script>"); await writeFile(outside, "outside");
  const context = { project: { path: projectPath }, user: { role: "member" } };
  const html = await readVisualization(inside, context);
  assert.match(html, /<script>/); assert.match(html, /Content-Security-Policy/); assert.match(html, /script-src 'unsafe-inline' https:\/\/cdn.jsdelivr.net/); assert.match(html, /<style>[\s\S]+body/);
  await assert.rejects(readVisualization(outside, context), (error) => error.statusCode === 403);
  assert.match(await readVisualization(outside, { ...context, user: { role: "admin" } }), /outside/);
});
