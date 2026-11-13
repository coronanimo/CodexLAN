import assert from 'node:assert/strict';
import test from 'node:test';
import { WorkspaceStore } from '../server/workspace-store.mjs';

test('partial live output covered by canonical lines is retired; unique or reordered data survives', async () => {
  for (const [saved, canonical, removed] of [
    ['first\r\nlast\r\n', 'first\r\nmiddle\r\nlast\r\n', true],
    ['first\nunique\n', 'first\nlast\n', false],
    ['last\nfirst\n', 'first\nlast\n', false],
  ]) {
    const metric = { snapshot: { id: 'i', type: 'commandExecution', status: 'inProgress', durationMs: 0, aggregatedOutput: saved } };
    const store = { ready: Promise.resolve(), turnMetrics: { c: { r: { items: { i: metric } } } }, persist: async () => {} };
    await WorkspaceStore.prototype.reconcileExecutionSupplements.call(store, 'c', [{ id: 'r', items: [
      { id: 'i', type: 'commandExecution', status: 'completed', durationMs: 287, aggregatedOutput: canonical },
    ] }]);
    assert.equal(!metric.snapshot, removed);
  }
});

test('an active native command does not retire its recovery location before the turn ends', async () => {
  const snapshot = { id: 'i', type: 'commandExecution', command: 'work', status: 'inProgress', aggregatedOutput: 'partial output' };
  const metric = { snapshot };
  const store = Object.assign(Object.create(WorkspaceStore.prototype), { ready: Promise.resolve(), turnMetrics: { c: { r: { items: { i: metric } } } }, persist: async () => {} });
  await store.reconcileExecutionSupplements('c', [{ id: 'r', status: 'inProgress', items: [snapshot] }]);
  assert.equal(metric.canonicalItemPresent, undefined);
  assert.equal(metric.snapshot, snapshot);
  await store.reconcileExecutionSupplements('c', [{ id: 'r', status: 'completed', items: [snapshot] }]);
  assert.equal(metric.canonicalItemPresent, true);
  assert.equal(metric.snapshot, snapshot, 'unfinished output remains available even at a known canonical location');
  assert.equal((await store.getTurnPresentation('c', 'r')).recoveryCount, 0);
});
