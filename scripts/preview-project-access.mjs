import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
const installation = join(process.env.LOCALAPPDATA, 'Programs', 'CodexLAN');
const plan = JSON.parse(await readFile(join(installation, 'project-layout.json'), 'utf8'));
const root = await mkdtemp(join(tmpdir(), 'codexlan-project-access-ui-'));
await mkdir(join(root, 'projects'));
const probe = createServer();
probe.listen(0, '127.0.0.1');
await once(probe, 'listening');
const port = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
const configPath = join(root, 'config.json');
await writeFile(configPath, JSON.stringify({ host: '127.0.0.1', port, workspaceRoot: join(root, 'projects'), dataRoot: join(root, 'data'), logRoot: join(root, 'logs'), attachmentRoot: join(root, 'attachments') }));
const child = spawn(join(installation, 'runtime', 'node.exe'), [join(plan.Release, 'server', 'index.mjs')], {
  env: { ...process.env, NODE_ENV: 'test', CODEX_CONFIG: configPath, CODEX_TEST_APP_SERVER: join(process.cwd(), 'test', 'fixtures', 'fake-app-server.mjs'), CODEX_TEST_SEED_COUNT: '0' },
  windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
});
child.stdout.resume(); child.stderr.resume();
const origin = `http://127.0.0.1:${port}`;
for (let attempt = 0; attempt < 50; attempt++) {
  try { if ((await fetch(`${origin}/api/ready`)).ok) break; } catch {}
  await new Promise((resolve) => setTimeout(resolve, 200));
}
const response = await fetch(`${origin}/api/auth/setup`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'preview', displayName: '界面验收', password: 'preview-password-123' }) });
const identity = await response.json();
if (!response.ok) throw new Error('Preview setup failed.');
await fetch(`${origin}/api/users`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: response.headers.get('set-cookie').split(';')[0], 'X-Codex-CSRF-Token': identity.csrfToken }, body: JSON.stringify({ username: 'collaborator', displayName: '协作成员', password: 'member-password-123' }) });
console.log(JSON.stringify({ origin, username: 'preview', password: 'preview-password-123', root }));
process.on('SIGINT', () => child.send({ type: 'codexlan:shutdown' }));
process.on('SIGTERM', () => child.send({ type: 'codexlan:shutdown' }));
await once(child, 'exit');
