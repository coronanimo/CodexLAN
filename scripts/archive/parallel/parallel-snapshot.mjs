import { DatabaseSync, backup } from "node:sqlite";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve, dirname, relative, isAbsolute, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { WorkspaceDatabase, WORKSPACE_SCHEMA_VERSION } from "../../../server/workspace-database.mjs";

export async function parallelSnapshot(source, destination) {
  source = resolve(source); destination = resolve(destination);
  const relation = relative(dirname(source), destination);
  if (!relation || relation !== ".." && !relation.startsWith(".." + sep) && !isAbsolute(relation)) throw new Error("并行数据目录必须与原版数据目录分开。");
  await mkdir(destination);
  const target = join(destination, "workspace-state.sqlite"), input = new DatabaseSync(source, { readOnly: true });
  try { await backup(input, target); } finally { input.close(); }
  const database = new DatabaseSync(target);
  try {
    const storage = new WorkspaceDatabase(database, target);
    if (storage.version !== WORKSPACE_SCHEMA_VERSION) throw new Error("并行快照需要已迁移的 SQLite v14 数据；原版未被修改。");
    const before = storage.read(), expected = { ...before, queues: {}, queueRevisions: {}, sessions: {} };
    storage.write(expected, { queues: new Set(Object.keys(before.queues)), queueRevisions: new Set(Object.keys(before.queueRevisions)), sessions: new Set(Object.keys(before.sessions)) });
    if (!isDeepStrictEqual(storage.read(), expected)) throw new Error("并行副本的账号、项目关系、设置或恢复记录与预期不符。");
    const report = { createdAt: new Date().toISOString(), source, destination, users: before.users.length, projects: before.projects.length,
      preserved: ["accounts and password records", "project ownership and grants", "conversation bindings", "settings", "access history", "async answer receipts", "recovery supplements"],
      excludedFromCopy: { queuedMessages: Object.values(before.queues).reduce((total, items) => total + items.length, 0), sessions: Object.keys(before.sessions).length },
      policy: "Original queues and sessions remain in the original installation. Existing conversations are read-only in the parallel installation." };
    await writeFile(join(destination, "parallel-snapshot.json"), JSON.stringify(report, null, 2), { mode: 0o600 });
    return report;
  } finally { database.close(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [source, destination] = process.argv.slice(2);
  if (!source || !destination) throw new Error("Usage: parallel-snapshot source.sqlite fresh-data-directory");
  const report = await parallelSnapshot(source, destination);
  console.log(JSON.stringify({ destination: report.destination, users: report.users, projects: report.projects, excludedFromCopy: report.excludedFromCopy }));
}
