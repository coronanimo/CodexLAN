import { DatabaseSync, backup } from 'node:sqlite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const install = join(process.env.LOCALAPPDATA, 'Programs', 'CodexLAN');
const plan = JSON.parse(await readFile(join(install, 'project-layout.json'), 'utf8'));
const production = JSON.parse(await readFile(join(plan.Home, 'config.json'), 'utf8'));
Object.assign(process.env, JSON.parse(await readFile(join(install, 'environment.json'), 'utf8')));
const qaRoot = join(plan.MigrationRoot, `qa-${Date.now()}`);
const dataRoot = join(qaRoot, 'data');
await mkdir(dataRoot, { recursive: true });
const db = new DatabaseSync(join(plan.MigrationRoot, 'preview-data', 'workspace-state.sqlite'), { readOnly: true });
await backup(db, join(dataRoot, 'workspace-state.sqlite'));
db.close();
const { WorkspaceStore, AuthService } = await import(pathToFileURL(join(plan.Release, 'server', 'workspace-store.mjs')));
const store = new WorkspaceStore({ dataRoot, workspace: 'D:\\Code', stateFile: join(dataRoot, 'workspace-state.json'), legacyJsonMirror: false });
await store.ready;
// This is a disposable QA copy. Never permit a read to advance a production queue.
const queueIds = Object.keys(store.queues);
store.queues = {};
await store.persist({ queues: queueIds });
const auth = new AuthService(store);
const identities = new Map();
for (const user of store.users) {
  if (user.active) identities.set(user.id, await auth.createSession(user.id));
}
const projects = structuredClone(store.projects);
store.close();
const probe = createServer();
probe.listen(0, '127.0.0.1');
await once(probe, 'listening');
const port = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
const configPath = join(qaRoot, 'config.json');
await writeFile(configPath, JSON.stringify({ ...production, dataRoot, workspaceRoot: 'D:\\Code', host: '127.0.0.1', port,
  logRoot: join(qaRoot, 'logs'), attachmentRoot: join(qaRoot, 'attachments'), autoApprove: false, autoApproveBrowser: false }));
const child = spawn(join(install, 'runtime', 'node.exe'), [join(plan.Release, 'server', 'index.mjs')], {
  env: { ...process.env, CODEX_CONFIG: configPath }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
});
let errors = '';
child.stdout.resume();
child.stderr.on('data', (chunk) => { errors = (errors + chunk).slice(-6000); });
try {
  const origin = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    if (child.exitCode !== null) throw new Error(errors);
    try { ready = (await fetch(`${origin}/api/ready`)).ok; } catch {}
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  if (!ready) throw new Error('Candidate Codex backend did not become ready. ' + errors);
  let checked = 0, returnedThreads = 0;
  const checks = [];
  for (const project of projects) {
    if (!plan.Entries.some((entry) => entry.Target.toLowerCase() === project.path.toLowerCase())) continue;
    const identity = identities.get(project.ownerId);
    if (!identity) throw new Error('Project owner is not active.');
    const headers = { Cookie: `${auth.cookieName}=${identity.token}` };
    const list = await fetch(`${origin}/api/projects`, { headers });
    const listed = await list.json();
    if (!list.ok || !listed.projects.some((entry) => entry.id === project.id && entry.path === project.path)) throw new Error('Candidate project authorization/path check failed.');
    const page = await fetch(`${origin}/api/projects/${project.id}/threads?limit=10`, { headers });
    const result = await page.json();
    if (!page.ok) throw new Error(`Candidate history first page failed: ${JSON.stringify(result)}\n${errors}`);
    let count = result.threads.length;
    if (result.nextCursor) {
      const older = await fetch(`${origin}/api/projects/${project.id}/threads?limit=10&cursor=${encodeURIComponent(result.nextCursor)}`, { headers });
      const oldResult = await older.json();
      if (!older.ok) throw new Error(`Candidate relocated history page failed: ${JSON.stringify(oldResult)}\n${errors}`);
      count += oldResult.threads.length;
    }
    checked++;
    returnedThreads += count;
    checks.push({ id: project.id, path: project.path, returnedThreads: count });
  }
  await writeFile(join(plan.MigrationRoot, 'candidate-verification.json'), JSON.stringify({ ready: true, checkedProjects: checked, returnedThreads, checks, mode: 'Real Codex backend, authenticated HTTP project and history queries against a disposable DB copy; copied queues disabled.' }, null, 2));
  console.log(JSON.stringify({ ready: true, checkedProjects: checked, returnedThreads, qaRoot }));
} finally {
  if (child.connected) child.send({ type: 'codexlan:shutdown' });
  const timeout = setTimeout(() => child.kill(), 5000);
  timeout.unref();
  if (child.exitCode === null) await once(child, 'exit');
  clearTimeout(timeout);
}
