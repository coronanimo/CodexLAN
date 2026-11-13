import { writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fixtureService } from "./lan-service.mjs";

const cleanups = [];
const f = await fixtureService({ after: close => cleanups.push(close) }, { CODEX_TEST_SEED_CONTENT: "1" }, { seed: true });
try {
  await writeFile(join(f.bootstrap.projects[0].path, "report.md"), "# Large preview\n" + "x".repeat(200001));
  const stopFile = join(f.root, ".stop");
  process.stdout.write(JSON.stringify({ url: f.origin, username: "admin", password: "admin-pass-123", stopFile }) + "\n");
  await new Promise(resolve => {
    const timer = setInterval(() => { if (existsSync(stopFile)) { clearInterval(timer); resolve(); } }, 250);
    for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { clearInterval(timer); resolve(); });
  });
} finally { for (const close of cleanups) await close(); }
