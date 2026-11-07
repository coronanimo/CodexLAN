import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { WorkspaceStore } from "../server/workspace-store.mjs";

let DatabaseSync;
try { ({ DatabaseSync } = await import("node:sqlite")); }
catch (error) { if (error.code !== "ERR_UNKNOWN_BUILTIN_MODULE") throw error; }
const sqliteTest = { skip: !DatabaseSync && "This Node version uses JSON storage; node:sqlite is unavailable." };

const threadId = "33333333-3333-4333-8333-333333333333";
const turnId = "44444444-4444-4444-8444-444444444444";
const itemId = "call_command";

test("queue identities, attachment references and uncertain delivery survive storage reload", async () => {
  const root = await mkdtemp(join(tmpdir(), "codexlan-queue-reload-"));
  const options = { dataRoot: root, stateFile: join(root, "state.json"), workspace: root, legacyJsonMirror: false };
  let store = new WorkspaceStore(options); await store.ready;
  await store.setThreadProject(threadId, "project");
  const first = await store.enqueue(threadId, "project", "first", [{ id: "opaque", path: join(root, "file.txt"), name: "file.txt", size: 14 }]);
  const second = await store.enqueue(threadId, "project", "second");
  await store.setQueueDelivery(threadId, first.id, { status: "uncertain", message: "timeout" });
  const revision = store.queueRevisions[threadId]; store.close();
  store = new WorkspaceStore(options); await store.ready;
  assert.deepEqual(store.queues[threadId].map((item) => item.id), [first.id, second.id]);
  assert.equal(store.queues[threadId][0].delivery.status, "uncertain");
  assert.deepEqual(store.queues[threadId][0].attachments, first.attachments);
  assert.equal(store.queueRevisions[threadId], revision); store.close();
});

test("migrates legacy compressed state with a consistent backup and exact business fields", sqliteTest, async () => {
  const root = await mkdtemp(join(tmpdir(), "codexlan-storage-migration-"));
  const file = join(root, "workspace-state.sqlite");
  const before = { version: 13, users: [], projects: [], threadProjects: { [threadId]: "project" },
    threadSettings: { [threadId]: {} }, queues: { [threadId]: [
      { id: "message-b", projectId: "project", text: "先做 B", createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "message-a", projectId: "project", text: "再做 A", createdAt: "2026-01-01T00:00:01.000Z", updatedAt: "2026-01-01T00:00:02.000Z" },
    ] }, queueRevisions: { [threadId]: 7 }, threadAccesses: { owner: { [threadId]: "2026-01-01T01:00:00.000Z" } },
    sessions: { opaqueTokenHash: { userId: "owner", csrfToken: "csrf", expiresAt: Date.now() + 60_000 } },
    asyncInputAnswers: { [threadId]: ["call_answered"] }, turnMetrics: { [threadId]: { [turnId]: {
      startedAt: 0, completedAt: 900, durationMs: 900, plan: { plan: [{ step: "迁移", status: "completed" }] },
      items: { [itemId]: { type: "commandExecution", startedAt: 0, durationMs: 0,
        snapshot: { id: itemId, type: "commandExecution", command: "echo done", cwd: root, status: "completed", aggregatedOutput: "完成\n", exitCode: 0 } } },
    } } } };
  let legacy = new DatabaseSync(file);
  let store;
  try {
    legacy.exec("PRAGMA journal_mode=WAL; CREATE TABLE state (key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE turn_metrics(thread_id TEXT PRIMARY KEY, value BLOB NOT NULL)");
    const write = legacy.prepare("INSERT INTO state VALUES (?, ?)");
    for (const [key, value] of Object.entries(before)) if (key !== "turnMetrics") write.run(key, JSON.stringify(value));
    legacy.prepare("INSERT INTO turn_metrics VALUES (?, ?)").run(threadId, deflateSync(JSON.stringify(before.turnMetrics[threadId])));
    // Keep the old connection open to exercise a source with committed WAL.
    store = new WorkspaceStore({ dataRoot: root, stateFile: join(root, "workspace-state.json"), workspace: root, legacyJsonMirror: false });
    await store.ready;
    assert.deepEqual(store.snapshot(), before);
    assert.deepEqual(store.storage.read(), before);
    assert.equal(store.storage.version, 14);
    assert.deepEqual(await store.getThreadSettings(threadId, { model: "fallback" }), {});
    assert.deepEqual(await store.getThreadSettings("absent", { model: "fallback" }), { model: "fallback" });
    const backupName = (await readdir(root)).find((name) => name.includes(".pre-v14-"));
    assert.ok(backupName);
    const backup = new DatabaseSync(join(root, backupName), { readOnly: true });
    try {
      assert.equal(backup.prepare("SELECT value FROM state WHERE key='queueRevisions'").get().value, JSON.stringify(before.queueRevisions));
      assert.ok(backup.prepare("SELECT value FROM turn_metrics WHERE thread_id=?").get(threadId).value.length);
    } finally { backup.close(); }
    await assert.rejects(readFile(join(root, "workspace-state.json")), { code: "ENOENT" });
  } finally {
    store?.close();
    legacy.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("an output update writes one supplement, not unrelated histories or application records", sqliteTest, async () => {
  const root = await mkdtemp(join(tmpdir(), "codexlan-storage-delta-"));
  const store = new WorkspaceStore({ dataRoot: root, stateFile: join(root, "state.json"), workspace: root, legacyJsonMirror: false });
  try {
    await store.ready;
    await store.recordTurnMetric(threadId, turnId, { startedAt: 1 });
    await store.recordItemMetric(threadId, turnId, itemId, { type: "commandExecution", startedAt: 2,
      snapshot: { id: itemId, type: "commandExecution", command: "echo done", cwd: root, status: "inProgress" } });
    store.database.exec("CREATE TABLE changes (name TEXT); CREATE TEMP TRIGGER changed_supplement AFTER UPDATE ON execution_supplements BEGIN INSERT INTO changes VALUES ('supplement'); END; CREATE TEMP TRIGGER changed_settings AFTER INSERT ON thread_settings BEGIN INSERT INTO changes VALUES ('settings'); END;");
    await store.recordItemMetric(threadId, turnId, itemId, { snapshot: { id: itemId, type: "commandExecution", command: "echo done", cwd: root, status: "inProgress", aggregatedOutput: "done" } });
    assert.deepEqual(store.database.prepare("SELECT name FROM changes").all().map((row) => row.name), ["supplement"]);
    await store.setThreadSettings(threadId, { model: "model" });
    assert.deepEqual(store.database.prepare("SELECT name FROM changes").all().map((row) => row.name), ["supplement", "settings"]);
    assert.equal(store.database.prepare("SELECT count(*) AS count FROM sqlite_master WHERE name IN ('state','turn_metrics')").get().count, 0);
    await store.recordItemMetric(threadId, turnId, itemId, { snapshot: { id: itemId, type: "commandExecution", command: "echo done", cwd: root, status: "inProgress", aggregatedOutput: "done", exitCode: 0, durationMs: 0 } });
    await store.reconcileExecutionSupplements(threadId, [{ id: turnId, items: [] }]);
    assert.ok((await store.getTurnMetrics(threadId))[turnId].items[itemId].snapshot);
    await store.reconcileExecutionSupplements(threadId, [{ id: turnId, items: [{ id: itemId, type: "commandExecution", command: "echo done", cwd: root, status: "completed", aggregatedOutput: "full output\ndone", exitCode: 0, durationMs: 12 }] }]);
    assert.equal((await store.getTurnMetrics(threadId))[turnId].items[itemId].snapshot, undefined);
    assert.equal(store.storage.read().turnMetrics[threadId][turnId].items[itemId].snapshot, undefined);
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});
