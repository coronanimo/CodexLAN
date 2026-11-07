import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { createCodexReadAdapter } from "../server/agents/codex/read-adapter.mjs";

test("bounds rows and detail chunks without truncating authoritative output or inventing order", async () => {
  const output = "complete tool output\n".repeat(5_000);
  const turn = { id: "run", status: "completed", items: [
    { id: "user", type: "userMessage", content: [{ type: "text", text: "prompt" }] },
    ...Array.from({ length: 250 }, (_, index) => ({ id: `tool-${index}`, type: "mcpToolCall", tool: "test", result: { output } })),
    { id: "answer", type: "agentMessage", text: "a".repeat(30_000) },
  ] };
  const adapter = createCodexReadAdapter({ status: () => "ready", conversations: {
    readRawThreadPage: async () => ({ thread: { turns: [turn] }, canonicalTurns: [turn], history: { hasMore: false } }),
  } });
  const pages = [];
  let before = null;
  do {
    const page = await adapter.readHistory("conversation", { before, limit: 100 });
    assert.ok(page.rows.length <= 100);
    assert.ok(!JSON.stringify(page).includes("complete tool output"));
    pages.unshift(page.rows); before = page.before;
  } while (before);
  const all = pages.flat();
  assert.equal(all.length, 253);
  assert.equal(new Set(all.map((row) => row.id)).size, 253);
  assert.equal(all[0].kind, "user");
  assert.equal(all.at(-1).kind, "summary");
  assert.equal(all.at(-2).text.length, 12_000);
  const tool = all.find((row) => row.kind === "execution");
  let detail = "", offset = 0;
  do {
    const page = await adapter.readDetail("conversation", { ref: tool.detailId, offset });
    assert.ok(page.text.length <= 16_000);
    detail += page.text; offset = page.nextOffset;
  } while (offset !== null);
  assert.equal(JSON.parse(detail.replace(/^结果\n/, "")).output, output);
  await assert.rejects(adapter.readHistory("conversation", { before: "bad" }), /历史位置无效/);
});

test("neutral read routes retain authentication, shared-project access and no task writes", { timeout: 20_000 }, async (t) => {
  const root = await mkdtemp(join(tmpdir(), "lan-read-"));
  const workspace = join(root, "workspace"), data = join(root, "data"), trace = join(root, "trace.jsonl");
  await Promise.all([mkdir(workspace), mkdir(data)]);
  const probe = createServer();
  await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["server/index.mjs"], {
    cwd: new URL("..", import.meta.url), windowsHide: true, stdio: ["ignore", "ignore", "pipe"],
    env: { ...process.env, NODE_ENV: "test", CODEX_CONFIG: "0", CODEX_WEB_HOST: "127.0.0.1", CODEX_WEB_PORT: String(port),
      CODEX_WORKDIR: workspace, CODEX_WEB_DATA_DIR: data, CODEX_TEST_APP_SERVER: fileURLToPath(new URL("fixtures/fake-app-server.mjs", import.meta.url)),
      CODEX_TEST_SEED_CWD: join(workspace, "默认项目"), CODEX_TEST_SEED_COMMANDS: "250", CODEX_TEST_TRACE_FILE: trace },
  });
  let errors = "";
  child.stderr.on("data", (chunk) => { errors += chunk; });
  t.after(async () => {
    if (child.exitCode === null) {
      const exited = new Promise((resolve) => child.once("exit", resolve));
      child.kill(); await exited;
    }
  });
  const request = async (path, { cookie, csrf, method = "GET", body } = {}) => {
    const response = await fetch(origin + path, { method, headers: { Origin: origin, "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}), ...(csrf ? { "X-Codex-CSRF-Token": csrf } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { response, status: response.status, body: await response.json() };
  };
  for (let attempt = 0; ; attempt++) {
    if (child.exitCode !== null || attempt > 100) throw new Error(`Test service did not start: ${errors}`);
    try { if ((await fetch(origin + "/api/health")).ok) break; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal((await request("/api/lan/bootstrap")).status, 401);
  const setup = await request("/api/auth/setup", { method: "POST", body: { username: "admin", displayName: "Administrator", password: "admin-pass-123" } });
  assert.equal(setup.status, 201);
  const admin = setup.response.headers.get("set-cookie").split(";")[0], csrf = setup.body.csrfToken;
  const bootstrap = await request("/api/lan/bootstrap", { cookie: admin });
  assert.equal(bootstrap.body.edition.displayName, "CodexLAN");
  assert.equal(bootstrap.body.agents[0].access, "read-only");
  assert.equal(Object.hasOwn(bootstrap.body.projects[0], "path"), false);
  const projectId = bootstrap.body.projects[0].id;
  const catalog = await request(`/api/lan/projects/${projectId}/conversations`, { cookie: admin });
  const id = catalog.body.conversations[0].id;
  const path = `/api/lan/conversations/${id}/history?projectId=${projectId}`;
  const page = await request(path, { cookie: admin });
  assert.equal(page.status, 200); assert.equal(page.body.rows.length, 100); assert.ok(page.body.before);
  assert.ok(page.body.rows.every((row) => !Object.hasOwn(row, "aggregatedOutput")));
  const tool = page.body.rows.find((row) => row.kind === "execution");
  const detailPath = `/api/lan/conversations/${id}/details?projectId=${projectId}&ref=${encodeURIComponent(tool.detailId)}`;
  assert.match((await request(detailPath, { cookie: admin })).body.text, /passed/);
  assert.equal((await request(path + "&agentId=missing", { cookie: admin })).status, 404);
  assert.equal((await request(path + "&limit=201", { cookie: admin })).status, 400);
  const member = await request("/api/users", { method: "POST", cookie: admin, csrf, body: { username: "member", displayName: "Member", password: "member-pass-123", role: "member" } });
  const login = await request("/api/auth/login", { method: "POST", body: { username: "member", password: "member-pass-123" } });
  const memberCookie = login.response.headers.get("set-cookie").split(";")[0];
  assert.equal((await request(detailPath, { cookie: memberCookie })).status, 404);
  await request(`/api/projects/${projectId}/members`, { method: "PUT", cookie: admin, csrf, body: { memberIds: [member.body.user?.id || member.body.id] } });
  assert.equal((await request(path, { cookie: memberCookie })).status, 200);
  await request(`/api/projects/${projectId}/members`, { method: "PUT", cookie: admin, csrf, body: { memberIds: [] } });
  assert.equal((await request(detailPath, { cookie: memberCookie })).status, 404);
  const calls = (await readFile(trace, "utf8")).trim().split(/\r?\n/).map(JSON.parse);
  assert.ok(calls.every((call) => !["turn/start", "turn/steer", "thread/start", "thread/goal/set"].includes(call.method)));
});
