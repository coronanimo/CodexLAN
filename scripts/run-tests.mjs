import { spawnSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Explicit entry points also work on Node 20/Windows and exclude server fixtures.
const directory = new URL("../test/", import.meta.url);
const files = (await readdir(directory)).filter((name) => name.endsWith(".test.mjs")).sort()
  .map((name) => fileURLToPath(new URL(name, directory)));
const result = spawnSync(process.execPath, ["--test", ...process.argv.slice(2), ...files], {
  stdio: "inherit", windowsHide: true,
  env: { ...process.env, NODE_ENV: "test", CODEX_CONFIG: "0" },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
