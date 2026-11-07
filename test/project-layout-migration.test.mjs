import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { WorkspaceDatabase } from '../server/workspace-database.mjs';
import { migrateLayout } from '../scripts/migrate-project-layout.mjs';

test('layout migration preserves owners, sharing, ordered queues, settings and foreign history bindings', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codexlan-layout-state-'));
  const source = join(root, 'live.sqlite');
  const database = new DatabaseSync(source);
  database.exec('PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0');
  const oldPath = join(root, 'old');
  const newPath = join(root, 'new');
  const state = { version: 13, users: [{ id: 'owner', role: 'member' }, { id: 'shared', role: 'member' }],
    projects: [{ id: 'p', path: oldPath, ownerId: 'owner', memberIds: ['shared'] }, { id: 'foreign', path: root, ownerId: 'shared' }],
    threadProjects: { old: 'p', foreignThread: 'foreign' }, threadSettings: { old: { effort: 'high' } },
    queues: { old: [{ id: 'b', projectId: 'p', text: 'first' }, { id: 'a', projectId: 'p', text: 'second' }] },
    queueRevisions: { old: 42 }, threadAccesses: { shared: { old: 'yesterday' } }, sessions: { token: { userId: 'owner' } },
    asyncInputAnswers: { old: ['answer'] }, turnMetrics: { old: { turn: { items: { item: { completedAt: 123 } } } } },
  };
  const originalStorage = new WorkspaceDatabase(database, source);
  originalStorage.migrate(state);
  const destination = join(root, 'migrated');
  await migrateLayout(source, destination, { Entries: [{ Source: oldPath, Target: newPath }] }, [{ projectId: 'p', threadId: 'native' }, { projectId: 'p', threadId: 'foreignThread' }]);
  const result = new DatabaseSync(join(destination, 'workspace-state.sqlite'), { readOnly: true });
  const expected = structuredClone(state);
  expected.projects[0].path = newPath;
  expected.threadProjects.native = 'p';
  assert.deepEqual(new WorkspaceDatabase(result).read(), expected);
  assert.deepEqual(originalStorage.read(), state);
  result.close();
  database.close();
});
