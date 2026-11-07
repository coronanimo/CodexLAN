import { spawn } from "node:child_process";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";

export async function fixtureService(t, extra = {}) {
  const root = await mkdtemp(join(tmpdir(), "lan-fixture-")), workspace = join(root, "workspace"), data = join(root, "data");
  await Promise.all([mkdir(workspace), mkdir(data)]);
  const probe = createServer();
  await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const port = probe.address().port; await new Promise((resolve) => probe.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["server/index.mjs"], { cwd: process.env.LAN_TEST_APP_ROOT || new URL("../..", import.meta.url), windowsHide: true,
    stdio: ["ignore", "ignore", "pipe"], env: { ...process.env, NODE_ENV: "test", CODEX_CONFIG: "0", CODEX_WEB_HOST: "127.0.0.1",
      CODEX_WEB_PORT: String(port), CODEX_WORKDIR: workspace, CODEX_WEB_DATA_DIR: data,
      CODEX_TEST_APP_SERVER: fileURLToPath(new URL("fake-app-server.mjs", import.meta.url)), ...extra } });
  let errors = ""; child.stderr.on("data", (chunk) => { errors += chunk; });
  t.after(async () => { if (child.exitCode === null) { const exit = new Promise((resolve) => child.once("exit", resolve)); child.kill(); await exit; } });
  for (let attempt = 0; ; attempt++) {
    if (child.exitCode !== null || attempt > 100) throw new Error(`Fixture failed to start: ${errors}`);
    try { if ((await fetch(origin + "/api/health")).ok) break; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  async function request(path, { cookie, csrf, method = "GET", body, headers = {} } = {}) {
    const response = await fetch(origin + path, { method, headers: { Origin: origin, "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}), ...(csrf ? { "X-Codex-CSRF-Token": csrf } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
    const text = await response.text(); let parsed; try { parsed = JSON.parse(text); } catch { parsed = text; }
    return { status: response.status, response, body: parsed };
  }
  async function login(username, password) {
    const result = await request("/api/auth/login", { method: "POST", body: { username, password } });
    return { cookie: result.response.headers.get("set-cookie")?.split(";")[0], csrf: result.body.csrfToken, result };
  }
  const setup = await request("/api/auth/setup", { method: "POST", body: { username: "admin", password: "admin-pass-123", displayName: "Admin" } });
  const admin = { cookie: setup.response.headers.get("set-cookie")?.split(";")[0], csrf: setup.body.csrfToken };
  const bootstrap = (await request("/api/lan/bootstrap", admin)).body;
  return { root, workspace, data, origin, request, login, admin, bootstrap };
}
