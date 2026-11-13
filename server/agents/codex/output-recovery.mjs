import { commandExecutionSnapshot } from "../../core/persistence-values.mjs";

// Keep a small durable tail even when the native process never sends completion.
export class OutputRecovery {
  pending = new Map(); writes = new Set(); timer = null;
  constructor(store, projection, failed) { Object.assign(this, { store, projection, failed }); }
  capture(id, runId, itemId) {
    const item = this.projection.sessions.get(id)?.runs.get(runId)?.items.get(itemId);
    if (!item || item.type !== "commandExecution") return;
    this.pending.set(JSON.stringify([id, runId, itemId]), { id, runId, itemId, snapshot: commandExecutionSnapshot(item) });
    if (!this.timer) this.timer = setTimeout(() => void this.flush(), 100);
  }
  flush() {
    clearTimeout(this.timer); this.timer = null;
    for (const { id, runId, itemId, snapshot } of this.pending.values()) {
      const operation = this.store.recordItemMetric(id, runId, itemId, { type: "commandExecution", snapshot }, { deferred: true });
      this.writes.add(operation);
      void operation.catch(this.failed).finally(() => this.writes.delete(operation));
    }
    this.pending.clear();
    return Promise.allSettled([...this.writes]);
  }
}
