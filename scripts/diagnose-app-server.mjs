import { AppServerClient } from '../server/codex-client.mjs';
const config = JSON.parse(await (await import('node:fs/promises')).readFile('C:/Users/Shiwei/.codexlan/config.json', 'utf8'));
const client = new AppServerClient({ workspace: config.workspaceRoot, codexBin: config.codexBin, appVersion: '0.8.0' });
try {
  await client.ready;
  const result = await client.request('thread/list', { limit: 1, useStateDbOnly: true });
  console.log(JSON.stringify({ state: client.state, threadListWorks: Array.isArray(result.data), returned: result.data?.length }));
} finally { await client.close(); }
