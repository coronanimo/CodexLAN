import { spawnSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Node 20 on Windows does not expand the shell wildcard used by newer Node.
// Enumerate just our test entry points, never the fake App Server fixture.
const directory = new URL("../test/", import.meta.url);
const files = (await readdir(directory)).filter((name) => name.endsWith(".test.mjs")).sort()
  .map((name) => fileURLToPath(new URL(name, directory)));
const result = spawnSync(process.execPath, ["--test", ...process.argv.slice(2), ...files], { stdio: "inherit", windowsHide: true });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
