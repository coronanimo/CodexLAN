import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

async function check(directory) {
  for (const file of await readdir(directory, { withFileTypes: true })) {
    const path = new URL(file.name + (file.isDirectory() ? "/" : ""), directory);
    if (file.isDirectory()) await check(path);
    else if (file.name.endsWith(".mjs")) {
      const result = spawnSync(process.execPath, ["--check", fileURLToPath(path)], { stdio: "inherit", windowsHide: true });
      if (result.status !== 0) throw new Error(`Syntax check failed: ${path}`);
    }
  }
}
for (const path of ["../server/", "../shared/", "../products/"]) await check(new URL(path, import.meta.url));
const result = spawnSync(process.execPath, [fileURLToPath(new URL("run-tests.mjs", import.meta.url))], { stdio: "inherit", windowsHide: true });
process.exitCode = result.status ?? 1;
