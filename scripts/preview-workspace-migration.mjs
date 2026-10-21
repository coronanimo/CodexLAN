import { DatabaseSync, backup } from "node:sqlite";
import { mkdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { loadServerConfig } from "../server/config.mjs";
import { WorkspaceStore } from "../server/workspace-store.mjs";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
if (process.argv.length !== 3) throw new Error("Usage: node scripts/preview-workspace-migration.mjs <new-preview-directory>");
const destination = resolve(process.argv[2]);
const config = await loadServerConfig({ appRoot });
// Refuse an existing destination: this command must never cut over a live DB.
await mkdir(destination);
const file = join(destination, "workspace-state.sqlite");
const source = new DatabaseSync(join(config.dataRoot, "workspace-state.sqlite"), { readOnly: true });
try { await backup(source, file); }
finally { source.close(); }
const start = performance.now();
const store = new WorkspaceStore({ dataRoot: destination, stateFile: join(destination, "workspace-state.json"), workspace: config.workspaceRoot, legacyJsonMirror: false });
try {
  await store.ready;
  const metricThreads = Object.values(store.turnMetrics);
  console.log(JSON.stringify({
    previewDirectory: destination,
    schemaVersion: store.storage.version,
    migrationMs: Math.round(performance.now() - start),
    users: store.users.length,
    projects: store.projects.length,
    bindings: Object.keys(store.threadProjects).length,
    queuedItems: Object.values(store.queues).reduce((sum, queue) => sum + queue.length, 0),
    supplementTurns: metricThreads.reduce((sum, turns) => sum + Object.keys(turns).length, 0),
    supplementItems: metricThreads.reduce((sum, turns) => sum + Object.values(turns).reduce((count, turn) => count + Object.keys(turn.items || {}).length, 0), 0),
    migrationBackup: store.storage.backupFile || null,
    sqliteBytes: (await stat(file)).size,
  }, null, 2));
} finally { store.close(); }
