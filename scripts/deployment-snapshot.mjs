import { DatabaseSync, backup } from "node:sqlite";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { WorkspaceDatabase } from "../server/workspace-database.mjs";

// Online backup includes committed WAL pages. Never copy an open SQLite file.
export async function snapshot(source, destination, sourceRepository, targetRepository) {
  if (existsSync(destination)) throw new Error("Snapshot destination must be new.");
  await mkdir(destination, { recursive: true });
  const target = join(destination, "workspace-state.sqlite");
  const input = new DatabaseSync(source, { readOnly: true });
  try { await backup(input, target); } finally { input.close(); }
  const db = new DatabaseSync(target);
  try {
    if (db.prepare("PRAGMA user_version").get().user_version !== 14) throw new Error("Expected workspace schema 14.");
    const storage = new WorkspaceDatabase(db, target);
    const before = storage.read();
    const expected = structuredClone(before);
    let mapped = 0;
    for (const project of expected.projects) {
      if (resolve(project.path).toLowerCase() === resolve(sourceRepository).toLowerCase()) {
        project.path = targetRepository;
        mapped++;
      }
    }
    db.exec("BEGIN IMMEDIATE");
    try {
      for (const project of expected.projects) {
        db.prepare("UPDATE projects SET value=? WHERE id=?").run(JSON.stringify(project), project.id);
      }
      if (!isDeepStrictEqual(storage.read(), expected)) throw new Error("Business fields or relationships changed unexpectedly.");
      db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); throw error; }
    const report = {
      createdAt: new Date().toISOString(), source, destination, mappedProjects: mapped,
      projects: expected.projects.map(({ id, name, path, ownerId }) => ({ id, name, path, ownerId })),
      preserved: ["user identities and permissions", "project ordering and ownership", "thread bindings", "queue items and order", "queue revisions", "settings", "sessions", "access order", "async answers", "execution supplements"],
      verification: "All reconstructed business fields and relationships equal the snapshot, except the explicit CodexLAN project path mapping.",
    };
    await writeFile(join(destination, "migration-report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ destination, mappedProjects: mapped, projects: expected.projects.length, verified: true }));
  } finally { db.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [source, destination, sourceRepository, targetRepository] = process.argv.slice(2);
  if (!targetRepository) throw new Error("Usage: snapshot source.sqlite fresh-directory source-repository target-repository");
  await snapshot(source, destination, sourceRepository, targetRepository);
}
