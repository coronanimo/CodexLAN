import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { networkInterfaces, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = join(repositoryRoot, "test-support", "fake-app-server.mjs");
const packageVersion = JSON.parse(await readFile(join(repositoryRoot, "package.json"), "utf8")).version;

test("keeps the loopback service available when the LAN port is occupied", { timeout: 20_000 }, async (context) => {
  const privateAddress = privateIpv4Address();
  if (!privateAddress) return context.skip("No private IPv4 address is available on this test machine.");

  const temporaryRoot = await mkdtemp(join(tmpdir(), "codex-lan-server-lifecycle-"));
  const workspace = join(temporaryRoot, "workspace");
  const data = join(temporaryRoot, "state");
  const localPort = await availableLoopbackPort();
  const origin = `http://127.0.0.1:${localPort}`;
  const blocker = createServer();
  await Promise.all([mkdir(workspace), mkdir(data)]);
  const replacementProjectPath = join(workspace, "admin", "默认项目");
  await mkdir(replacementProjectPath, { recursive: true });
  await writeFile(join(data, "workspace-state.json"), `${JSON.stringify({
    version: 9,
    projects: [{
      id: "11111111-1111-4111-8111-111111111111",
      name: "默认项目",
      path: replacementProjectPath,
      ownerId: "22222222-2222-4222-8222-222222222222",
      settings: {},
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
      legacyPaths: [workspace],
    }],
    queues: {},
    queueRevisions: {},
    threadSettings: {
      "33333333-3333-4333-8333-333333333333": { model: "test-model", serviceTier: "" },
    },
    turnMetrics: {
      "33333333-3333-4333-8333-333333333333": {
        "44444444-4444-4444-8444-444444444444": {
          startedAt: 1_700_000_000_000,
          items: {
            "55555555-5555-4555-8555-555555555555": {
              type: "commandExecution",
              startedAt: 1_700_000_000_100,
              snapshot: {
                id: "55555555-5555-4555-8555-555555555555",
                type: "commandExecution",
                command: "node test.mjs",
                status: "inProgress",
              },
            },
          },
        },
      },
    },
    users: [{
      id: "22222222-2222-4222-8222-222222222222",
      username: "admin",
      displayName: "Administrator",
      role: "admin",
      active: true,
      mustChangePassword: false,
      passwordSalt: "AAAAAAAAAAAAAAAAAAAAAA==",
      passwordHash: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==",
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
    }],
    threadOwners: {
      "33333333-3333-4333-8333-333333333333": "22222222-2222-4222-8222-222222222222",
    },
    sessions: {},
    legacyProjectIds: [],
  }, null, 2)}\n`, "utf8");
  await new Promise((resolveListen, rejectListen) => blocker.once("error", rejectListen).listen(0, privateAddress, resolveListen));
  const occupiedPort = blocker.address().port;
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      NODE_ENV: "test",
      CODEX_WEB_HOST: privateAddress,
      CODEX_WEB_PORT: String(occupiedPort),
      CODEX_LOCAL_PORT: String(localPort),
      CODEX_WORKDIR: workspace,
      CODEX_WEB_DATA_DIR: data,
      CODEX_TEST_APP_SERVER: fixturePath,
    },
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true,
  });
  let errors = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { errors += chunk; });

  try {
    const health = await waitForLanState(origin, child, () => errors);
    assert.equal(health.appVersion, packageVersion);
    assert.equal(health.nodeVersion, process.version.slice(1));
    assert.equal(health.nodeArchitecture, process.arch);
    assert.equal(health.codexAgent, "codex-lan-http-test");
    assert.equal(health.listeners.local.status, "ready");
    assert.equal(health.listeners.lan.status, "unavailable");
    assert.match(health.listeners.lan.error, new RegExp(`端口 ${occupiedPort} 已被占用`));
    const migratedState = JSON.parse(await readFile(join(data, "workspace-state.json"), "utf8"));
    assert.equal(migratedState.version, 13);
    assert.equal(migratedState.projects[0].path, workspace);
    assert.equal(Object.hasOwn(migratedState.projects[0], "legacyPaths"), false);
    assert.deepEqual(migratedState.threadSettings["33333333-3333-4333-8333-333333333333"], { model: "test-model" });
    assert.equal(
      migratedState.turnMetrics["33333333-3333-4333-8333-333333333333"]["44444444-4444-4444-8444-444444444444"]
        .items["55555555-5555-4555-8555-555555555555"].snapshot.command,
      "node test.mjs",
    );
    assert.equal(Object.hasOwn(migratedState, "threadOwners"), false);

    await stopChild(child);
  } finally {
    await stopChild(child);
    await new Promise((resolveClose) => blocker.close(resolveClose));
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("keeps first-time setup and project state available when Codex is not installed", { timeout: 20_000 }, async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "codex-lan-without-codex-"));
  const workspace = join(temporaryRoot, "workspace");
  const data = join(temporaryRoot, "state");
  const port = await availableLoopbackPort();
  const origin = `http://127.0.0.1:${port}`;
  await Promise.all([mkdir(workspace), mkdir(data)]);
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      CODEX_WEB_HOST: "127.0.0.1",
      CODEX_WEB_PORT: String(port),
      CODEX_WORKDIR: workspace,
      CODEX_WEB_DATA_DIR: data,
      CODEX_BIN: join(temporaryRoot, "codex-does-not-exist.exe"),
    },
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true,
  });
  let errors = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { errors += chunk; });

  try {
    const health = await waitForHealth(origin, child, () => errors);
    assert.notEqual(health.codexStatus, "ready");

    const setup = await fetch(`${origin}/api/auth/setup`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify({ username: "admin", displayName: "Administrator", password: "admin-pass-123" }),
    });
    assert.equal(setup.status, 201);
    const cookie = setup.headers.get("set-cookie")?.split(";", 1)[0];
    assert.ok(cookie);

    const projects = await fetch(`${origin}/api/projects`, { headers: { Cookie: cookie } });
    assert.equal(projects.status, 200);
    const projectBody = await projects.json();
    assert.equal(projectBody.projects.length, 1);
    assert.equal(projectBody.projects[0].name, "默认项目");

    const statusResponse = await fetch(`${origin}/api/status`, { headers: { Cookie: cookie } });
    assert.equal(statusResponse.status, 200);
    const statusBody = await statusResponse.json();
    assert.notEqual(statusBody.status, "ready");
    assert.match(statusBody.codexError, /codex-does-not-exist\.exe/);

    await stopChild(child);
    const migratedState = JSON.parse(await readFile(join(data, "workspace-state.json"), "utf8"));
    assert.equal(migratedState.version, 13);
    assert.equal(Object.hasOwn(migratedState, "legacyProjectIds"), false);
  } finally {
    await stopChild(child);
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});


function privateIpv4Address() {
  return Object.values(networkInterfaces()).flat().find((address) => {
    if (!address || address.family !== "IPv4" || address.internal) return false;
    const octets = address.address.split(".").map(Number);
    return octets[0] === 10
      || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
      || (octets[0] === 192 && octets[1] === 168);
  })?.address || null;
}

async function availableLoopbackPort() {
  const probe = createServer();
  await new Promise((resolveListen, rejectListen) => probe.once("error", rejectListen).listen(0, "127.0.0.1", resolveListen));
  const port = probe.address().port;
  await new Promise((resolveClose) => probe.close(resolveClose));
  return port;
}

async function waitForHealth(origin, child, readErrors) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Missing-Codex test server exited early: ${readErrors()}`);
    try {
      const response = await fetch(`${origin}/api/health`);
      if (response.status === 200) return response.json();
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error(`Timed out waiting for missing-Codex health: ${readErrors()}`);
}

async function waitForLanState(origin, child, readErrors) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`LAN lifecycle test server exited early: ${readErrors()}`);
    try {
      const response = await fetch(`${origin}/api/health`);
      if (response.status === 200) {
        const health = await response.json();
        if (health.listeners?.lan?.status === "unavailable" && health.codexStatus === "ready") return health;
      }
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error(`Timed out waiting for LAN lifecycle state: ${readErrors()}`);
}

function onceExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolveExit) => child.once("exit", resolveExit));
}

async function stopChild(child) {
  if (child.exitCode === null && child.signalCode === null) child.kill();
  await onceExit(child);
}
