import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { snapshot } from "../scripts/deployment-snapshot.mjs";
import { WorkspaceDatabase } from "../server/workspace-database.mjs";

test("online snapshot includes WAL and preserves queue ordering, ownership and settings with only an explicit project path change", async () => {
  const root = await mkdtemp(join(tmpdir(), "codexlan-deploy-test-"));
  const source = join(root, "source.sqlite");
  const db = new DatabaseSync(source);
  db.exec("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0");
  const oldPath = join(root, "old");
  const newPath = join(root, "new");
  const state = { version: 13,
    users: [{ id: "owner", role: "admin", username: "owner" }],
    projects: [{ id: "project", ownerId: "owner", path: oldPath }],
    threadProjects: { thread: "project" }, threadSettings: { thread: { model: "test", effort: "high" } },
    queues: { thread: [{ id: "second", text: "first in queue", projectId: "project" }, { id: "first", text: "second in queue", projectId: "project" }] },
    queueRevisions: { thread: 7 }, threadAccesses: { owner: { thread: 42 } },
    sessions: { token: { userId: "owner", expiresAt: 9999999999999 } },
    asyncInputAnswers: { thread: ["answer"] }, turnMetrics: { thread: { turn: { items: { item: { startedAt: 123 } } } } },
  };
  new WorkspaceDatabase(db, source).migrate(state);
  const destination = join(root, "snapshot");
  await snapshot(source, destination, oldPath, newPath);
  const copied = new DatabaseSync(join(destination, "workspace-state.sqlite"), { readOnly: true });
  const expected = structuredClone(state);
  expected.projects[0].path = newPath;
  assert.deepEqual(new WorkspaceDatabase(copied).read(), expected);
  assert.deepEqual(new WorkspaceDatabase(db).read(), state);
  copied.close();
  db.close();
  await assert.rejects(snapshot(source, destination, oldPath, newPath), /must be new/);
});
