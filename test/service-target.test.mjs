import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, access } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { assertServiceTarget } from "../server/service-target.mjs";

test("managed service control protects its own instance and allows a separate instance", async () => {
  const root = await mkdtemp(join(tmpdir(), "lan-service-target-"));
  const original = join(root, "original"), react = join(root, "react"), nested = join(original, "nested");
  await Promise.all([mkdir(nested, { recursive: true }), mkdir(react)]);
  for (const action of ["stop", "restart", "handoff"]) {
    await assert.rejects(assertServiceTarget({ action, managed: true, callerDataRoot: original, targetDataRoot: original }), /hosting or unidentified/);
    await assert.rejects(assertServiceTarget({ action, managed: true, callerDataRoot: original, targetDataRoot: nested }), /hosting or unidentified/);
    await assert.rejects(assertServiceTarget({ action, managed: true, callerDataRoot: nested, targetDataRoot: original }), /hosting or unidentified/);
    await assert.rejects(assertServiceTarget({ action, managed: true, targetDataRoot: react }), /hosting or unidentified/);
    await assert.rejects(assertServiceTarget({ action, managed: true, callerDataRoot: join(root, "missing"), targetDataRoot: react }), /hosting or unidentified/);
    await assertServiceTarget({ action, managed: true, callerDataRoot: original, targetDataRoot: react });
    await assertServiceTarget({ action, managed: true, callerDataRoot: react, targetDataRoot: original });
  }
  await assertServiceTarget({ action: "stop", managed: false });
  await assertServiceTarget({ action: "status", managed: true });
});

test("the service CLI rejects its host before writing and accepts a different configured instance", async () => {
  const root = await mkdtemp(join(tmpdir(), "lan-service-cli-")), caller = join(root, "caller"), target = join(root, "target");
  await Promise.all([mkdir(caller), mkdir(target)]);
  const configuration = join(root, "config.json"), logs = join(root, "logs");
  await writeFile(configuration, JSON.stringify({ dataRoot: target, logRoot: logs, host: "127.0.0.1", port: 8690 }));
  const run = (callerDataRoot) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["server/service.mjs", "stop"], { cwd: new URL("..", import.meta.url), windowsHide: true,
      env: { ...process.env, CODEX_CONFIG: configuration, CODEXLAN_MANAGED_PROCESS: "1", CODEXLAN_MANAGED_DATA_ROOT: callerDataRoot }, stdio: ["ignore", "pipe", "pipe"] });
    let output = ""; child.stdout.on("data", (chunk) => { output += chunk; }); child.stderr.on("data", (chunk) => { output += chunk; });
    child.on("error", reject); child.on("exit", (code) => resolve({ code, output }));
  });
  const self = await run(target); assert.equal(self.code, 1); assert.match(self.output, /hosting or unidentified/);
  await assert.rejects(access(join(target, "service")));
  const other = await run(caller); assert.equal(other.code, 0); assert.match(other.output, /supervisor is not running/);
});
