import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = join(repositoryRoot, "test-support", "fake-app-server.mjs");

test("enforces HTTP authentication, origin, CSRF, role, rate-limit, and path boundaries", { timeout: 30_000 }, async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "codex-lan-http-test-"));
  const workspace = join(temporaryRoot, "workspace");
  const data = join(temporaryRoot, "data");
  const outsideFile = join(temporaryRoot, "outside-secret.txt");
  await Promise.all([mkdir(workspace), mkdir(data), writeFile(outsideFile, "must-not-leak", "utf8")]);
  const port = await availablePort();
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      NODE_ENV: "test",
      CODEX_WEB_HOST: "127.0.0.1",
      CODEX_WEB_PORT: String(port),
      CODEX_WORKDIR: workspace,
      CODEX_WEB_DATA_DIR: data,
      CODEX_TEST_APP_SERVER: fixturePath,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let output = "";
  let errors = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { errors += chunk; });

  try {
    await waitForHealth(origin, child, () => errors);
    const setupToken = await waitForSetupToken(() => output, child, () => errors);

    const anonymous = await request(origin, "/api/auth/session");
    assert.equal(anonymous.status, 401);
    assert.equal(anonymous.body.setupRequired, true);

    const rejectedOrigin = await request(origin, "/api/auth/setup", {
      method: "POST",
      origin: null,
      body: { setupToken, username: "admin", displayName: "Administrator", password: "admin-pass-123" },
    });
    assert.equal(rejectedOrigin.status, 403);

    const setup = await request(origin, "/api/auth/setup", {
      method: "POST",
      body: { setupToken, username: "admin", displayName: "Administrator", password: "admin-pass-123" },
    });
    assert.equal(setup.status, 201);
    const adminCookie = sessionCookie(setup.response);
    assert.match(setup.response.headers.get("set-cookie") || "", /HttpOnly/i);
    assert.match(setup.response.headers.get("set-cookie") || "", /SameSite=Strict/i);
    const adminCsrf = setup.body.csrfToken;

    const session = await request(origin, "/api/auth/session", { cookie: adminCookie });
    assert.equal(session.status, 200);
    assert.equal(session.body.user.role, "admin");

    const missingCsrf = await request(origin, "/api/projects", {
      method: "POST",
      cookie: adminCookie,
      body: { name: "Rejected project" },
    });
    assert.equal(missingCsrf.status, 403);

    const wrongOrigin = await request(origin, "/api/projects", {
      method: "POST",
      cookie: adminCookie,
      csrf: adminCsrf,
      origin: "http://invalid.example",
      body: { name: "Rejected project" },
    });
    assert.equal(wrongOrigin.status, 403);

    const createdProject = await request(origin, "/api/projects", {
      method: "POST",
      cookie: adminCookie,
      csrf: adminCsrf,
      body: { name: "Integration project" },
    });
    assert.equal(createdProject.status, 201);

    const projects = await request(origin, "/api/projects", { cookie: adminCookie });
    assert.equal(projects.status, 200);
    assert.equal(projects.body.projects.some((project) => project.id === createdProject.body.project.id), true);
    const adjacentSecret = join(dirname(createdProject.body.project.path), "outside-secret.txt");
    await writeFile(adjacentSecret, "must-not-leak", "utf8");
    const traversal = await request(origin, `/api/projects/${createdProject.body.project.id}/files/download?path=${encodeURIComponent("../outside-secret.txt")}`, { cookie: adminCookie });
    assert.equal(traversal.status, 403);
    assert.doesNotMatch(JSON.stringify(traversal.body), /must-not-leak/);

    const member = await request(origin, "/api/users", {
      method: "POST",
      cookie: adminCookie,
      csrf: adminCsrf,
      body: { username: "member", displayName: "Member", password: "member-pass-123" },
    });
    assert.equal(member.status, 201);

    const memberLogin = await request(origin, "/api/auth/login", {
      method: "POST",
      body: { username: "member", password: "member-pass-123" },
    });
    assert.equal(memberLogin.status, 200);
    const memberCookie = sessionCookie(memberLogin.response);

    const memberUsers = await request(origin, "/api/users", { cookie: memberCookie });
    assert.equal(memberUsers.status, 403);
    const memberAdminDownload = await request(origin, `/api/admin/files/download?path=${encodeURIComponent(outsideFile)}`, { cookie: memberCookie });
    assert.equal(memberAdminDownload.status, 403);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const failed = await request(origin, "/api/auth/login", {
        method: "POST",
        body: { username: "missing-user", password: "wrong-password" },
      });
      assert.equal(failed.status, 401);
    }
    const blocked = await request(origin, "/api/auth/login", {
      method: "POST",
      body: { username: "missing-user", password: "wrong-password" },
    });
    assert.equal(blocked.status, 429);

    const persistedState = await readFile(join(data, "workspace-state.json"), "utf8");
    assert.doesNotMatch(persistedState, /admin-pass-123|member-pass-123/);
  } finally {
    child.kill("SIGTERM");
    const exited = await Promise.race([
      onceExit(child).then(() => true),
      new Promise((resolveWait) => setTimeout(() => resolveWait(false), 1_000)),
    ]);
    if (!exited && child.exitCode === null) {
      child.kill("SIGKILL");
      await onceExit(child);
    }
    assert.equal(resolve(temporaryRoot).startsWith(resolve(tmpdir())), true);
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

async function request(origin, path, { method = "GET", body, cookie, csrf, origin: requestOrigin = origin } = {}) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (cookie) headers.Cookie = cookie;
  if (csrf) headers["X-Codex-CSRF-Token"] = csrf;
  if (requestOrigin) headers.Origin = requestOrigin;
  const response = await fetch(`${origin}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  return { response, status: response.status, body: text ? JSON.parse(text) : null };
}

function sessionCookie(response) {
  const value = response.headers.get("set-cookie") || "";
  const cookie = value.split(";", 1)[0];
  assert.match(cookie, /^codex_workspace_session=/);
  return cookie;
}

async function availablePort() {
  const probe = createServer();
  await new Promise((resolveListen, rejectListen) => probe.once("error", rejectListen).listen(0, "127.0.0.1", resolveListen));
  const port = probe.address().port;
  await new Promise((resolveClose, rejectClose) => probe.close((error) => error ? rejectClose(error) : resolveClose()));
  return port;
}

async function waitForHealth(origin, child, readErrors) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Test server exited early: ${readErrors()}`);
    try {
      const response = await fetch(`${origin}/api/health`);
      if (response.status === 200) return;
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error(`Timed out waiting for test server health: ${readErrors()}`);
}

async function waitForSetupToken(readOutput, child, readErrors) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const match = readOutput().match(/首次初始化密钥[^\r\n]*[\r\n]+([^\s]+)/);
    if (match) return match[1];
    if (child.exitCode !== null) throw new Error(`Test server exited before setup token: ${readErrors()}`);
    await new Promise((resolveWait) => setTimeout(resolveWait, 25));
  }
  throw new Error(`Timed out waiting for setup token. Output: ${readOutput()} Errors: ${readErrors()}`);
}

function onceExit(child) {
  if (child.exitCode !== null) return Promise.resolve();
  return new Promise((resolveExit) => child.once("exit", resolveExit));
}
