import { createEntityAdapter, createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import type { CommittedRows, TimelineRow } from "./types";

const rows = createEntityAdapter<TimelineRow>();
const INITIAL_INDEX = 1_000_000;
type Timeline = { ids: string[]; firstItemIndex: number; needsSnapshot: boolean };
type OrderedRows = CommittedRows;

export const conversationSlice = createSlice({
  name: "conversation",
  initialState: rows.getInitialState({ timelines: {} as Record<string, Timeline> }),
  reducers: {
    snapshotCommitted(state, { payload }: PayloadAction<OrderedRows>) {
      const owned = payload.rows.filter((row) => row.conversationId === payload.conversationId);
      const ids = [...new Set(owned.map((row) => row.id))];
      const retained = new Set(ids);
      rows.removeMany(state, (state.timelines[payload.conversationId]?.ids || []).filter((id) => !retained.has(id)));
      rows.upsertMany(state, owned);
      state.timelines[payload.conversationId] = { ids, firstItemIndex: INITIAL_INDEX, needsSnapshot: false };
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

export const { snapshotCommitted, orderedRowsPrepended, orderedRowsAppended, rowsCommitted, conversationReleased } = conversationSlice.actions;
