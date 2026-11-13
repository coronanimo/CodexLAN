import { createEntityAdapter, createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import type { CommittedRows, TimelineRow } from "./types";
import type { PresentationPatch } from "@lan/presentation";

const rows = createEntityAdapter<TimelineRow>();
const INITIAL_INDEX = 1_000_000;
type Timeline = { ids: string[]; positions: Record<string, number>; firstItemIndex: number; needsSnapshot: boolean; viewportRevision: number };
type OrderedRows = CommittedRows;

export const conversationSlice = createSlice({
  name: "conversation",
  initialState: rows.getInitialState({ timelines: {} as Record<string, Timeline> }),
  reducers: {
    presentationPatched(state, { payload }: PayloadAction<PresentationPatch>) {
      const timeline = state.timelines[payload.conversationId];
      if (!timeline) return;
      for (const id of payload.removeIds) {
        const index = timeline.ids.indexOf(id);
        if (index >= 0) { timeline.ids.splice(index, 1); rows.removeOne(state, id); }
        delete timeline.positions[id];
      }
      const pending: PresentationPatch["upserts"] = [];
      for (const entry of payload.upserts) {
        const { row } = entry;
        if (row.conversationId !== payload.conversationId) continue;
        if (state.entities[row.id]) {
          const previous = state.entities[row.id]!;
          if (row.revision !== undefined && previous.revision !== undefined && row.revision <= previous.revision) continue;
          rows.setOne(state, row); continue;
        }
        if (row.kind === "summary" && payload.appendRun) {
          timeline.ids.push(row.id); rows.addOne(state, row); continue;
        }
        pending.push(entry);
      }
      // Coalescing can make an insertion depend on a later entry in this same
      // bounded patch. Resolve the anchors before discarding out-of-window rows.
      while (pending.length) {
        let inserted = false;
        for (let index = 0; index < pending.length;) {
          const { row, beforeId, afterId } = pending[index]!;
          const before = beforeId ? timeline.ids.indexOf(beforeId) : -1;
          const after = afterId ? timeline.ids.indexOf(afterId) : -1;
          if (before < 0 && after < 0) { index++; continue; }
          timeline.ids.splice(before >= 0 ? before : after + 1, 0, row.id); rows.addOne(state, row);
          pending.splice(index, 1); inserted = true;
        }
        if (!inserted) break;
      }
      for (const { id, revision, beforeId, afterId } of payload.placements || []) {
        const index = timeline.ids.indexOf(id), entity = state.entities[id];
        if (index < 0 || !entity || revision <= (timeline.positions[id] || 0)) continue;
        const after: number = afterId ? timeline.ids.indexOf(afterId) : -1;
        const before: number = beforeId ? timeline.ids.indexOf(beforeId) : -1;
        const anchor = after >= 0 ? afterId! : before >= 0 ? beforeId! : undefined;
        if (!anchor || anchor === id || state.entities[anchor]?.runId !== entity.runId) continue;
        // A page proves relative order, not that unseen live rows between two
        // anchors should be displaced. Move only a violated relationship.
        if (after >= 0 ? index < after : index > before) {
          timeline.ids.splice(index, 1);
          timeline.ids.splice(timeline.ids.indexOf(anchor) + (after >= 0 ? 1 : 0), 0, id);
        }
        timeline.positions[id] = revision;
      }
    },
    snapshotCommitted(state, { payload }: PayloadAction<OrderedRows>) {
      const owned = payload.rows.filter((row) => row.conversationId === payload.conversationId);
      const ids = [...new Set(owned.map((row) => row.id))];
      const retained = new Set(ids);
      rows.removeMany(state, (state.timelines[payload.conversationId]?.ids || []).filter((id) => !retained.has(id)));
      rows.upsertMany(state, owned);
      state.timelines[payload.conversationId] = { ids, positions: {}, firstItemIndex: INITIAL_INDEX, needsSnapshot: false, viewportRevision: (state.timelines[payload.conversationId]?.viewportRevision || 0) + 1 };
    },
    windowReconciled(state, { payload }: PayloadAction<OrderedRows>) {
      const timeline = state.timelines[payload.conversationId];
      if (!timeline) return;
      const retained = new Set(payload.rows.map((row) => row.id));
      rows.removeMany(state, timeline.ids.filter((id) => !retained.has(id)));
      for (const id of Object.keys(timeline.positions)) if (!retained.has(id)) delete timeline.positions[id];
      rows.setMany(state, payload.rows);
      timeline.ids = payload.rows.map((row) => row.id);
    },
    // Only call these after the protocol adapter has established canonical order.
    orderedRowsPrepended(state, { payload }: PayloadAction<OrderedRows>) {
      const timeline = state.timelines[payload.conversationId];
      if (!timeline) return;
      const known = new Set(timeline.ids);
      const added = payload.rows.filter((row) => {
        if (row.conversationId !== payload.conversationId || known.has(row.id)) return false;
        known.add(row.id);
        return true;
      });
      if (!added.length) return;
      rows.addMany(state, added);
      timeline.ids.unshift(...added.map((row) => row.id));
      timeline.firstItemIndex -= added.length;
    },
    orderedRowsAppended(state, { payload }: PayloadAction<OrderedRows>) {
      const timeline = state.timelines[payload.conversationId];
      if (!timeline) return;
      const known = new Set(timeline.ids);
      const added = payload.rows.filter((row) => {
        if (row.conversationId !== payload.conversationId || known.has(row.id)) return false;
        known.add(row.id);
        return true;
      });
      if (!added.length) return;
      rows.addMany(state, added);
      timeline.ids.push(...added.map((row) => row.id));
    },
    rowsCommitted(state, { payload }: PayloadAction<OrderedRows>) {
      const timeline = state.timelines[payload.conversationId];
      if (!timeline) return;
      for (const row of payload.rows) {
        if (row.conversationId !== payload.conversationId) continue;
        const existing = state.entities[row.id];
        if (!existing || existing.conversationId !== payload.conversationId) {
          // Receipt order never invents a chronological slot.
          timeline.needsSnapshot = true;
          continue;
        }
        rows.setOne(state, row);
      }
    },
    conversationReleased(state, { payload: conversationId }: PayloadAction<string>) {
      rows.removeMany(state, state.timelines[conversationId]?.ids || []);
      delete state.timelines[conversationId];
    },
  },
});

export const { snapshotCommitted, windowReconciled, orderedRowsPrepended, orderedRowsAppended, rowsCommitted, conversationReleased, presentationPatched } = conversationSlice.actions;
