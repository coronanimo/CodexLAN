import type { ConversationSelection, HistoryPage, ReadClient } from "@lan/read-api";
import type { TimelineRow, PresentationPatch } from "@lan/presentation";
import type { AppStore } from "../store";
import { conversationReleased, orderedRowsPrepended, snapshotCommitted, windowReconciled, presentationPatched } from "../../features/conversation/model/conversationSlice";
import { controlsReceived, controlsReleased } from "../../features/controls/controlsSlice";
import { resourceChanged } from "../../features/details/resourcesSlice";

// One selected conversation owns its reads. No component or virtual row owns a
// history connection. Generation checks also cover clients ignoring abort.
export class ConversationReader {
  private selection: ConversationSelection | null = null;
  private controller: AbortController | null = null;
  private generation = 0;
  private before: string | null = null;
  private stopWatching: (() => void) | null = null;
  private selectionEpoch = 0;
  private controlsRequest: AbortController | null = null;
  private controlsTimer: ReturnType<typeof setTimeout> | undefined;
  private costs = new Map<string, number>();
  private retainedSize = 0;
  private paused = false;
  private hasSnapshot = false;
  private olderWindow = false;
  private snapshotRevision = 0;
  constructor(private client: ReadClient, private store: AppStore, private changed: (page: HistoryPage | null, status: string) => void = () => {}) {}

  open(selection: ConversationSelection) {
    this.close();
    this.selection = selection;
    return this.client.watch ? this.watch() : this.read(false);
  }
  refresh() { this.paused = false; this.hasSnapshot = false; this.olderWindow = false; return this.client.watch ? this.watch() : this.read(false); }
  older() { return this.before ? this.read(true) : Promise.resolve(null); }
  close() {
    clearTimeout(this.controlsTimer); this.controlsTimer = undefined; this.controlsRequest?.abort();
    this.controller?.abort();
    this.stopWatching?.(); this.stopWatching = null;
    this.selectionEpoch++;
    this.generation++;
    if (this.selection) {
      this.store.dispatch(conversationReleased(this.selection.conversationId));
      this.store.dispatch(controlsReleased(this.selection.conversationId));
    }
    this.selection = null;
    this.before = null;
    this.costs.clear(); this.retainedSize = 0; this.paused = false; this.hasSnapshot = false; this.olderWindow = false;
    this.snapshotRevision = 0;
  }
  refreshControls = () => {
    if (this.controlsTimer !== undefined || !this.client.controls) return;
    this.controlsTimer = setTimeout(() => {
      this.controlsTimer = undefined;
      const selection = this.selection;
      if (!selection || !this.client.controls) return;
      this.controlsRequest?.abort();
      const request = this.controlsRequest = new AbortController();
      const epoch = this.selectionEpoch;
      this.client.controls(selection, request.signal).then((value) => {
        if (!request.signal.aborted && epoch === this.selectionEpoch) this.store.dispatch(controlsReceived(value));
      }).catch((error: Error) => { if (!request.signal.aborted && epoch === this.selectionEpoch) this.changed(null, error.message); });
    }, 100);
  };
  private watch(): Promise<HistoryPage | null> {
    const selection = this.selection;
    if (!selection || !this.client.watch) return Promise.resolve(null);
    this.stopWatching?.(); this.controller?.abort();
    const epoch = ++this.selectionEpoch;
    return new Promise((resolve) => {
      this.stopWatching = this.client.watch!(selection, {
        snapshot: (page) => {
          if (epoch !== this.selectionEpoch) return;
          this.generation++; this.controller?.abort();
          this.snapshotRevision = page.revision || 0;
          if (this.hasSnapshot && this.olderWindow) {
            const current = this.store.getState().conversation;
            const ids = current.timelines[selection.conversationId]?.ids || [];
            const overlap = ids.findIndex((id) => page.rows.some((row) => row.id === id));
            const combined = overlap < 0 ? null : [...ids.slice(0, overlap).map((id) => current.entities[id]!), ...page.rows];
            if (!this.paused && combined && this.fits(combined)) {
              this.store.dispatch(windowReconciled({ conversationId: selection.conversationId, rows: combined })); this.resetCosts(combined);
              this.changed(null, "实时连接正常");
            } else { this.paused = true; this.changed(null, "已保留阅读位置；点击最新记录同步后续内容。"); }
            resolve(null); this.refreshControls(); return;
          }
          this.store.dispatch(snapshotCommitted({ conversationId: selection.conversationId, rows: page.rows })); this.resetCosts(page.rows); this.hasSnapshot = true;
          this.before = page.before; this.changed(page, "实时连接正常"); resolve(page);
          this.refreshControls();
        },
        patch: (patch) => { if (epoch === this.selectionEpoch) this.patch(patch); },
        status: (message) => { if (epoch === this.selectionEpoch) this.changed(null, message); },
        controlsChanged: () => { if (epoch === this.selectionEpoch) this.refreshControls(); },
        resourceChanged: (rowId) => { if (epoch === this.selectionEpoch && this.costs.has(rowId)) this.store.dispatch(resourceChanged({ conversationId: selection.conversationId, rowId })); },
      });
    });
  }
  private fits(rows: TimelineRow[]) { return rows.length <= 1500 && rows.reduce((sum, row) => sum + rowSize(row), 0) <= 2_000_000; }
  private resetCosts(rows: TimelineRow[]) { this.costs = new Map(rows.map((row) => [row.id, rowSize(row)])); this.retainedSize = [...this.costs.values()].reduce((a, b) => a + b, 0); }
  private patch(patch: PresentationPatch) {
    if (this.paused) return;
    patch = { ...patch, upserts: patch.upserts.filter(({ row }) => this.costs.has(row.id) || row.revision === undefined || row.revision > this.snapshotRevision) };
    let size = this.retainedSize, count = this.costs.size;
    for (const id of patch.removeIds) { if (this.costs.has(id)) { count--; size -= this.costs.get(id)!; } }
    for (const { row } of patch.upserts) { size += rowSize(row) - (this.costs.get(row.id) || 0); if (!this.costs.has(row.id)) count++; }
    if (size > 2_000_000 || count > 1500) { this.paused = true; this.changed(null, "已达到本页阅读上限；点击最新记录继续。草稿已保留。"); return; }
    this.store.dispatch(presentationPatched(patch));
    // Unknown records outside the loaded canonical window are not retained.
    const entities = this.store.getState().conversation.entities;
    for (const id of patch.removeIds) { this.retainedSize -= this.costs.get(id) || 0; this.costs.delete(id); }
    for (const { row } of patch.upserts) if (entities[row.id]) {
      const cost = rowSize(row); this.retainedSize += cost - (this.costs.get(row.id) || 0); this.costs.set(row.id, cost);
    }
  }
  private async read(older: boolean): Promise<HistoryPage | null> {
    const selection = this.selection;
    if (!selection) return null;
    this.controller?.abort();
    const controller = this.controller = new AbortController();
    const generation = ++this.generation;
    try {
      const page = await this.client.history(selection, older ? this.before : null, controller.signal);
      if (controller.signal.aborted || generation !== this.generation) return null;
      const state = this.store.getState().conversation;
      const retained = (state.timelines[selection.conversationId]?.ids || []).map((id) => state.entities[id]!);
      const combined = [...page.rows.filter((row) => !this.costs.has(row.id)), ...retained];
      const replace = !older || !this.fits(combined);
      this.store.dispatch((replace ? snapshotCommitted : orderedRowsPrepended)({ conversationId: selection.conversationId, rows: page.rows }));
      this.resetCosts(replace ? page.rows : combined);
      if (older) { this.olderWindow = true; if (replace) { this.paused = true; this.changed(page, "正在阅读更早一页；点击最新记录恢复实时内容。"); } }
      this.before = page.before;
      if (!older) this.refreshControls();
      return page;
    } catch (error) {
      if (controller.signal.aborted || generation !== this.generation) return null;
      throw error;
    }
  }
}

function rowSize(row: TimelineRow) {
  const files = "files" in row ? (row.files || []).reduce((sum, file) => sum + (file.path.length + file.name.length) * 2 + 40, 0) : 0;
  if (row.kind === "user" || row.kind === "assistant") return files + row.text.length * 2 + (row.request ? JSON.stringify(row.request).length * 2 : 0) + 512;
  return row.kind === "summary" ? 512 + (row.plan ? JSON.stringify(row.plan).length * 2 : 0) : files + 1024;
}
