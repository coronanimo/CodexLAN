import assert from 'node:assert/strict';
import test from 'node:test';
import { presentItem } from '../server/agents/codex/presentation.mjs';
import { itemText } from '../server/agents/codex/protocol-values.mjs';

test('execution summaries retain the original shell payload and native timing', () => {
  const item = { id: 'cmd', type: 'commandExecution', command: '"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -NoProfile -Command "Get-Content README.md"', cwd: 'D:\\Project', aggregatedOutput: 'done', status: 'completed', durationMs: 800, exitCode: 0 };
  const row = presentItem('c', { id: 'r' }, item);
  assert.equal(row.title, 'Get-Content README.md');
  assert.equal(row.durationMs, 800);
  assert.equal(row.aggregatedOutput, undefined);
  assert.equal(itemText(item), `目录：D:\\Project\n\n${item.command}\n\ndone\n\n退出码：0`);
});

test('reasoning and tool details retain the original readable sections', () => {
  const reasoning = { id: 'reason', type: 'reasoning', summary: ['**核对结果**'], content: ['**核对结果**', '后续思路'] };
  assert.equal(presentItem('c', { id: 'r' }, reasoning).title, '核对结果');
  assert.equal(itemText(reasoning), '**核对结果**\n\n后续思路');
  assert.match(itemText({ type: 'dynamicToolCall', arguments: { query: 'test' }, contentItems: [{ text: 'result' }] }), /结果\n\[\n/);
  assert.equal(itemText({ type: 'webSearch', query: 'test query', action: { type: 'search' } }), 'test query\n\n{\n  "type": "search"\n}');
});
