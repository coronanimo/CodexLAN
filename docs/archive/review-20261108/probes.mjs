// Isolated review evidence. These assertions describe defects in the reviewed
// candidate, not desired regression-test expectations. No real accounts or
// workspace data accessed.
import assert from 'node:assert/strict';
import { NativeProjection } from '../../server/agents/codex/native-projection.mjs';
import { QueueCoordinator } from '../../server/core/queue-coordinator.mjs';
import { contentReferences } from '../../server/agents/codex/content-references.mjs';
import { CodexHistory } from '../../server/agents/codex/history.mjs';
import { encodePosition } from '../../server/agents/codex/presentation.mjs';
import { createCodexAdapter } from '../../server/agents/codex/adapter.mjs';
import { EventEmitter } from 'node:events';

const results = [];
{
  const writes = [], events = new EventEmitter();
  const adapter = createCodexAdapter({ connection: { events }, store: { threadProjects: { c: 'p' }, recordItemMetric: async (...args) => { writes.push(args); } } });
  events.emit('notification', { method: 'item/started', params: { threadId: 'c', turnId: 'r', item: { id: 'cmd', type: 'commandExecution', command: 'work', status: 'inProgress' } } });
  events.emit('notification', { method: 'item/commandExecution/outputDelta', params: { threadId: 'c', turnId: 'r', itemId: 'cmd', delta: 'unique output before disconnect' } });
  events.emit('offline');
  await Promise.resolve();
  assert.equal(writes.length, 1);
  assert.equal(writes[0][3].snapshot.aggregatedOutput, undefined);
  results.push({ issue: 'live-output-recovery', itemMetricWrites: writes.length, durableOutput: writes[0][3].snapshot.aggregatedOutput ?? null });
  await adapter.close();
}
{
  const p = new NativeProjection(), events = [];
  p.onEvent = (_, event) => events.push(event);
  const receive = (method, params) => p.receive({ method, params: { threadId: 'c', turnId: 'r', ...params } });
  receive('turn/started', { turn: { id: 'r', status: 'inProgress' } });
  receive('item/started', { item: { id: 'm', type: 'agentMessage', text: '', status: 'inProgress' } });
  receive('item/agentMessage/delta', { itemId: 'm', delta: 'x'.repeat(12001) });
  const version = p.sessions.get('c').runs.get('r').items.get('m').version;
  events.length = 0;
  receive('item/agentMessage/delta', { itemId: 'm', delta: 'later output' });
  assert.equal(events.length, 0);
  assert.equal(p.sessions.get('c').runs.get('r').items.get('m').version, version);
  results.push({ issue: 'long-message-stream', laterEvents: events.length, previewCharacters: 12000, itemRevisionUnchanged: true });
}
{
  const p = new NativeProjection(), events = [];
  p.onEvent = (_, event) => events.push(event);
  p.receive({ method: 'item/started', params: { threadId: 'c', turnId: 'r', item: { id: 'reason', type: 'reasoning', summary: [] } } });
  const initialRow = events.flatMap(e => e.upserts || []).find(e => e.row.kind === 'execution').row;
  events.length = 0;
  p.receive({ method: 'item/reasoning/summaryTextDelta', params: { threadId: 'c', turnId: 'r', itemId: 'reason', summaryIndex: 0, delta: 'A useful heading' } });
  assert.equal(initialRow.autoExpand, undefined);
  assert.equal(events.filter(e => e.kind === 'patch').length, 0);
  results.push({ issue: 'reasoning-presentation', initialTitle: initialRow.title, deltaEventKinds: events.map(e => e.kind), updatedPresentationRows: 0 });
}
{
  const p = new NativeProjection();
  p.receive({ method: 'turn/started', params: { threadId: 'c', turn: { id: 'r', status: 'inProgress' } } });
  const items = Array.from({ length: 120 }, (_, i) => ({ id: `cmd${i}`, type: 'commandExecution', status: 'completed', command: `command ${i}`, aggregatedOutput: `${i}:` + 'x'.repeat(65500) }));
  for (const item of items) p.receive({ method: 'item/completed', params: { threadId: 'c', turnId: 'r', item } });
  p.receive({ method: 'turn/completed', params: { threadId: 'c', turn: { id: 'r', status: 'completed', completedAt: Date.now() } } });
  for (let offset = 0; offset < items.length; offset += 50) p.merge('c', [{ id: 'r', status: 'completed', items: items.slice(offset, offset + 50) }], p.version, false, true);
  const retained = p.sessions.get('c').runs.get('r');
  assert.equal(retained.items.size, 120);
  results.push({ issue: 'completed-run-retention', canonicalItemsRead: 120, retainedItems: retained.items.size, retainedOutputCharacters: [...retained.items.values()].reduce((s, i) => s + (i.aggregatedOutput?.length || 0), 0) });
}
{
  let releaseProbe, submissions = 0;
  const queues = { c: [{ id: 'a', projectId: 'p', text: 'first' }, { id: 'b', projectId: 'p', text: 'second' }] };
  const store = { queues, threadProjects: { c: 'p' }, getProject: async () => ({ id: 'p' }), getQueueSnapshot: async () => queues.c,
    moveQueueItem: async () => { [queues.c[0], queues.c[1]] = [queues.c[1], queues.c[0]]; } };
  const agent = { onEvent: () => () => {}, notify() {}, probe: () => new Promise(resolve => { releaseProbe = resolve; }), submit: async () => { submissions++; } };
  const q = new QueueCoordinator(store, agent);
  const delivery = q.kick('c');
  await Promise.resolve();
  await q.edit('c', 'b', { direction: 'up' });
  releaseProbe({ status: 'idle' });
  await delivery;
  assert.equal(submissions, 0);
  assert.equal(q.jobs.size, 0);
  assert.equal(q.again.size, 0);
  results.push({ issue: 'queue-reorder-race', queue: queues.c.map(i => i.id), submissions, pendingJobs: q.jobs.size });
  await q.close();
}
{
  const input = '```js\nconst example = "[manual](docs/manual.md)";\n```';
  const output = contentReferences(input);
  assert.equal(output.text, '```js\nconst example = "manual";\n```');
  assert.equal(output.files.length, 1);
  const turn = { id: 'r', status: 'completed', items: [{ id: 'm', type: 'agentMessage', status: 'completed', text: input }] };
  const history = new CodexHistory({ request: async (method) => method === 'thread/turns/list' ? { data: [turn], nextCursor: null } : { thread: { id: 'c', status: 'idle' } } }, new NativeProjection(), { reconcileExecutionSupplements: async () => {} });
  try {
    const detail = await history.details('c', { ref: encodePosition({ page: null, run: 'r', item: 'm' }) });
    assert.equal(detail.text, output.text);
    results.push({ issue: 'code-block-rewrite', input, output, actualDetailText: detail.text });
  } finally { await history.resources.close(); }
}
process.stdout.write(JSON.stringify(results, null, 2) + '\n');
