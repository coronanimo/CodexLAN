import { DatabaseSync, backup } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { WorkspaceDatabase } from '../server/workspace-database.mjs';
import { AppServerClient } from '../server/codex-client.mjs';

const key = (path) => resolve(path).toLowerCase();

export async function migrateLayout(source, destination, plan, index = []) {
  if (existsSync(destination)) throw new Error('Migration destination must be fresh.');
  await mkdir(destination, { recursive: true });
  const input = new DatabaseSync(source, { readOnly: true });
  try { await backup(input, join(destination, 'workspace-state.sqlite')); } finally { input.close(); }
  const db = new DatabaseSync(join(destination, 'workspace-state.sqlite'));
  try {
    const storage = new WorkspaceDatabase(db);
    const original = storage.read();
    const expected = structuredClone(original);
    const entries = new Map(plan.Entries.flatMap((entry) => [[key(entry.Source), entry], [key(entry.Target), entry]]));
    const relocated = [];
    for (const project of expected.projects) {
      const entry = entries.get(key(project.path));
      if (entry) { relocated.push({ id: project.id, from: project.path, to: entry.Target }); project.path = entry.Target; }
    }
    for (const { projectId, threadId } of index) {
      if (!expected.projects.some((project) => project.id === projectId)) throw new Error('History index references a missing project.');
      const previous = expected.threadProjects[threadId];
      if (previous && previous !== projectId) continue; // Never steal another project's binding.
      expected.threadProjects[threadId] = projectId;
    }
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const project of expected.projects) db.prepare('UPDATE projects SET value=? WHERE id=?').run(JSON.stringify(project), project.id);
      for (const [threadId, projectId] of Object.entries(expected.threadProjects)) db.prepare('INSERT INTO thread_bindings VALUES (?, ?) ON CONFLICT(thread_id) DO NOTHING').run(threadId, projectId);
      if (!isDeepStrictEqual(storage.read(), expected)) throw new Error('Project layout migration changed unapproved business fields or relationships.');
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    const report = { verified: true, relocated, indexedThreads: index.length, preserved: 'All original account permissions, project IDs and member grants, queue order and revisions, settings, existing bindings, access order, sessions, async answers and execution supplements. Only explicit project paths and additional native-history bindings changed.' };
    await writeFile(join(destination, 'layout-migration-report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ verified: true, projects: relocated.length, indexedThreads: index.length, destination }));
  } finally { db.close(); }
}

async function indexNativeHistory(config, plan) {
  const input = new DatabaseSync(join(config.dataRoot, 'workspace-state.sqlite'), { readOnly: true });
  const projects = input.prepare('SELECT value FROM projects ORDER BY position').all().map(({ value }) => JSON.parse(value));
  input.close();
  const client = new AppServerClient({ workspace: config.workspaceRoot, codexBin: config.codexBin, appVersion: '0.8.0' });
  const index = [];
  try {
    await client.ready;
    for (const project of projects) {
      const entry = plan.Entries.find((entry) => [entry.Source, entry.Target].some((path) => key(path) === key(project.path)));
      if (!entry) continue;
      for (const cwd of new Set([entry.Source, entry.Target])) {
        let cursor;
        const cursors = new Set();
        do {
          const page = await client.request('thread/list', { cwd, limit: 100, useStateDbOnly: true, ...(cursor ? { cursor } : {}) });
          for (const thread of page.data || []) {
            if (typeof thread.cwd !== 'string' || key(thread.cwd) !== key(cwd)) throw new Error('Native thread listing returned a different project path.');
            index.push({ projectId: project.id, threadId: thread.id });
          }
          cursor = page.nextCursor;
          if (cursor && cursors.has(cursor)) throw new Error('Native history cursor repeated.');
          if (cursor) cursors.add(cursor);
        } while (cursor);
      }
    }
  } finally { await client.close(); }
  return index;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [configPath, planPath, destination, environmentPath] = process.argv.slice(2);
  if (environmentPath) Object.assign(process.env, JSON.parse(await readFile(environmentPath, 'utf8')));
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  const plan = JSON.parse(await readFile(planPath, 'utf8'));
  const index = await indexNativeHistory(config, plan);
  await migrateLayout(join(config.dataRoot, 'workspace-state.sqlite'), destination, plan, index);
}
