// Coalesce display changes, while native identity/lifecycle processing remains
// synchronous. A key belongs to one run, so append authority cannot leak to an
// unrelated historical completion in the same transport burst.
export class PresentationBatcher {
  listeners = new Map();
  pending = new Map();
  resources = new Map();
  timer = null;
  observe(id, listener) {
    if (!this.listeners.has(id)) this.listeners.set(id, new Set());
    this.listeners.get(id).add(listener);
    return () => { const set = this.listeners.get(id); set?.delete(listener); if (!set?.size) this.listeners.delete(id); };
  }
  send(id, event) { for (const listener of this.listeners.get(id) || []) listener(event); }
  publish(id, event) {
    if (event.kind === "resource.changed") {
      if (this.listeners.has(id)) this.resources.set(JSON.stringify([id, event.rowId]), { id, event });
      if (!this.timer) this.timer = setTimeout(() => this.flush(), 50);
      return;
    }
    if (event.kind !== "patch") { this.send(id, event); return; }
    if (!this.listeners.has(id)) return;
    const key = JSON.stringify([id, event.upserts[0]?.row.runId]);
    let batch = this.pending.get(key);
    if (!batch) { batch = { id, appendRun: false, rows: new Map(), removeIds: new Set() }; this.pending.set(key, batch); }
    batch.appendRun ||= event.appendRun;
    for (const entry of event.upserts) batch.rows.set(entry.row.id, entry);
    for (const removed of event.removeIds) { batch.rows.delete(removed); batch.removeIds.add(removed); }
    if (!this.timer) this.timer = setTimeout(() => this.flush(), 50);
  }
  flush() {
    clearTimeout(this.timer); this.timer = null;
    for (const { id, event } of this.resources.values()) this.send(id, event);
    this.resources.clear();
    for (const batch of this.pending.values()) {
      let upserts = [], bytes = 0, removeIds = [...batch.removeIds];
      const send = () => { this.send(batch.id, { kind: "patch", conversationId: batch.id, appendRun: batch.appendRun, removeIds, upserts }); upserts = []; bytes = 0; removeIds = []; };
      for (const row of batch.rows.values()) {
        const size = Buffer.byteLength(JSON.stringify(row));
        if (upserts.length && (upserts.length === 10 || bytes + size > 100_000)) send();
        upserts.push(row); bytes += size;
      }
      if (upserts.length || removeIds.length) send();
    }
    this.pending.clear();
  }
  close() { clearTimeout(this.timer); this.pending.clear(); this.resources.clear(); this.listeners.clear(); }
}
