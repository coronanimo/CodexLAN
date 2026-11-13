import { DatabaseSync } from "node:sqlite";
import { isDeepStrictEqual } from "node:util";
import { resolve, relative, isAbsolute, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { WorkspaceDatabase } from "../server/workspace-database.mjs";

export function relocateState(sqliteFile, oldHome, newHome) {
  const db = new DatabaseSync(sqliteFile);
  try {
    const storage = new WorkspaceDatabase(db, sqliteFile), before = storage.read(), expected = structuredClone(before);
    const relocate = (value) => {
      if (typeof value !== "string" || !isAbsolute(value)) return value;
      const suffix = relative(resolve(oldHome), resolve(value));
      return suffix === ".." || suffix.startsWith(`..${sep}`) || isAbsolute(suffix) ? value : resolve(newHome, suffix);
    };
    for (const project of expected.projects) project.path = relocate(project.path);
    for (const items of Object.values(expected.queues)) for (const item of items) for (const attachment of item.attachments || []) attachment.path = relocate(attachment.path);
    for (const turns of Object.values(expected.turnMetrics)) for (const turn of Object.values(turns)) for (const item of Object.values(turn.items || {})) {
      if (item.snapshot?.cwd) item.snapshot.cwd = relocate(item.snapshot.cwd);
    }
    storage.write(expected, null);
    if (!isDeepStrictEqual(storage.read(), expected)) throw new Error("Relocation changed application data unexpectedly.");
    return { verified: true, users: expected.users.length, projects: expected.projects.length, queuedMessages: Object.values(expected.queues).reduce((n, items) => n + items.length, 0) };
  } finally { db.close(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [sqliteFile, oldHome, newHome] = process.argv.slice(2);
  if (!sqliteFile || !oldHome || !newHome) throw new Error("Usage: formalize-state database old-home new-home");
  process.stdout.write(JSON.stringify(relocateState(sqliteFile, oldHome, newHome)) + "\n");
}
