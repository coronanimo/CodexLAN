import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = join(repositoryRoot, "test", "fixtures", "fake-app-server.mjs");

test("manages persisted thread goals and forwards their live state", { timeout: 20_000 }, async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "codex-lan-goal-test-"));
  const workspace = join(temporaryRoot, "workspace");
  const data = join(temporaryRoot, "data");
  const traceFile = join(temporaryRoot, "app-server-trace.jsonl");
  await Promise.all([mkdir(workspace), mkdir(data)]);
  const port = await availablePort();
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["server/index.mjs"], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      NODE_ENV: "test",
      CODEX_WEB_HOST: "127.0.0.1",
      CODEX_WEB_PORT: String(port),
      CODEX_WORKDIR: workspace,
      CODEX_WEB_DATA_DIR: data,
      CODEX_TEST_APP_SERVER: fixturePath,
      CODEX_TEST_TRACE_FILE: traceFile,
    },
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true,
  });
  let errors = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { errors += chunk; });

  try {
    await waitForHealth(origin, child, () => errors);
    const setup = await request(origin, "/api/auth/setup", {
      method: "POST",
      body: { username: "admin", displayName: "Administrator", password: "admin-pass-123" },
    });
    assert.equal(setup.status, 201);
    const cookie = setup.response.headers.get("set-cookie")?.split(";", 1)[0];
    const csrf = setup.body.csrfToken;
    const projects = await request(origin, "/api/projects", { cookie });
    const projectId = projects.body.projects[0].id;

    const created = await request(origin, "/api/threads", {
      method: "POST",
      cookie,
      csrf,
      body: {
        projectId,
        settings: { model: "gpt-5.6-sol", effort: "medium", summary: "detailed" },
        firstMessage: "Goal integration",
      },
    });
    assert.equal(created.status, 201);
    const threadId = created.body.thread.id;
    assert.equal(created.body.thread.goal, null);

    const updatedEvents = await fetch(`${origin}/api/events`, { headers: { Cookie: cookie } });
    const started = await request(origin, `/api/threads/${threadId}/goal`, {
      method: "PATCH",
      cookie,
      csrf,
      body: { projectId, objective: "Finish when the integration check passes", status: "active", tokenBudget: 12_345 },
    });
    assert.equal(started.status, 200);
    assert.equal(started.body.goal.status, "active");
    assert.equal(started.body.goal.tokenBudget, 12_345);
    const listed = await request(origin, `/api/projects/${projectId}/threads`, { cookie });
    assert.equal(listed.status, 200);
    assert.equal(listed.body.threads.find((thread) => thread.id === threadId)?.goal?.status, "active");
    const updateEventText = await readSseUntil(updatedEvents.body.getReader(), (contents) => (
      contents.includes('"method":"thread/goal/updated"') && contents.includes("Finish when the integration check passes")
    ));
    assert.match(updateEventText, /thread\/goal\/updated/);

    const current = await request(origin, `/api/threads/${threadId}/goal?projectId=${projectId}`, { cookie });
    assert.equal(current.status, 200);
    assert.equal(current.body.goal.objective, started.body.goal.objective);

    const paused = await request(origin, `/api/threads/${threadId}/goal`, {
      method: "PATCH",
      cookie,
      csrf,
      body: { projectId, status: "paused" },
    });
    assert.equal(paused.status, 200);
    assert.equal(paused.body.goal.status, "paused");
    assert.equal(paused.body.goal.objective, started.body.goal.objective);

    const invalidStatus = await request(origin, `/api/threads/${threadId}/goal`, {
      method: "PATCH",
      cookie,
      csrf,
      body: { projectId, status: "complete" },
    });
    assert.equal(invalidStatus.status, 400);
    const invalidBudget = await request(origin, `/api/threads/${threadId}/goal`, {
      method: "PATCH",
      cookie,
      csrf,
      body: { projectId, tokenBudget: 0 },
    });
    assert.equal(invalidBudget.status, 400);

    const clearedEvents = await fetch(`${origin}/api/events`, { headers: { Cookie: cookie } });
    const cleared = await request(origin, `/api/threads/${threadId}/goal?projectId=${projectId}`, {
      method: "DELETE",
      cookie,
      csrf,
    });
    assert.equal(cleared.status, 200);
    assert.equal(cleared.body.cleared, true);
    const clearEventText = await readSseUntil(clearedEvents.body.getReader(), (contents) => contents.includes('"method":"thread/goal/cleared"'));
    assert.match(clearEventText, /thread\/goal\/cleared/);
    const afterClear = await request(origin, `/api/threads/${threadId}/goal?projectId=${projectId}`, { cookie });
    assert.equal(afterClear.body.goal, null);

    const trace = (await readFile(traceFile, "utf8")).trim().split(/\r?\n/).map(JSON.parse);
    assert.ok(trace.some((entry) => entry.method === "thread/goal/get" && entry.params.threadId === threadId));
    assert.ok(trace.some((entry) => entry.method === "thread/goal/set" && entry.params.tokenBudget === 12_345));
    assert.ok(trace.some((entry) => entry.method === "thread/goal/clear" && entry.params.threadId === threadId));
  } finally {
    if (child.exitCode === null) child.kill();
    await onceExit(child);
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

async function request(origin, path, { method = "GET", body, cookie, csrf } = {}) {
  const headers = { Accept: "application/json", Origin: origin };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (cookie) headers.Cookie = cookie;
  if (csrf) headers["X-Codex-CSRF-Token"] = csrf;
  const response = await fetch(`${origin}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  return { response, status: response.status, body: text ? JSON.parse(text) : null };
}

async function readSseUntil(reader, predicate) {
  const decoder = new TextDecoder();
  const deadline = Date.now() + 5_000;
  let contents = "";
  try {
    while (Date.now() < deadline) {
      const remaining = Math.max(1, deadline - Date.now());
      const result = await Promise.race([
        reader.read(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timed out reading Goal events.")), remaining)),
      ]);
      if (result.done) break;
      contents += decoder.decode(result.value, { stream: true });
      if (predicate(contents)) return contents;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  throw new Error(`Expected Goal SSE event was not received: ${contents}`);
}

async function availablePort() {
  const probe = createServer();
  await new Promise((resolveListen, rejectListen) => probe.once("error", rejectListen).listen(0, "127.0.0.1", resolveListen));
  const port = probe.address().port;
  await new Promise((resolveClose) => probe.close(resolveClose));
  return port;
}

async function waitForHealth(origin, child, readErrors) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Goal test server exited early: ${readErrors()}`);
    try {
      const response = await fetch(`${origin}/api/health`);
      if (response.status === 200) return;
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error(`Timed out waiting for Goal test server: ${readErrors()}`);
}

function onceExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolveExit) => child.once("exit", resolveExit));
}
