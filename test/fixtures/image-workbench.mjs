import { writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fixtureService } from "./lan-service.mjs";

const cleanups = [];
const f = await fixtureService({ after: (fn) => cleanups.push(fn) }, { CODEX_TEST_SEED_IMAGES: "1" }, { seed: true });
try {
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN0cAAAAASUVORK5CYII=", "base64");
  await Promise.all(["first.png", "second.png"].map((name) => writeFile(join(f.bootstrap.projects[0].path, name), png)));
  const stopFile = join(f.root, ".stop");
  console.log(JSON.stringify({ url: f.origin, username: "admin", password: "admin-pass-123", stopFile }));
  await new Promise((resolve) => {
    const timer = setInterval(() => { if (existsSync(stopFile)) { clearInterval(timer); resolve(); } }, 300);
    const stop = () => { clearInterval(timer); resolve(); };
    process.once("SIGINT", stop); process.once("SIGTERM", stop);
  });
} finally { for (const close of cleanups) await close(); }
