import { createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import { conversationReleased } from "../conversation/model/conversationSlice";
export const resourcesSlice = createSlice({ name: "resources", initialState: {} as Record<string, Record<string, number>>, reducers: {
  resourceChanged(state, { payload }: PayloadAction<{ conversationId: string; rowId: string }>) {
    const revisions = state[payload.conversationId] ||= {}; revisions[payload.rowId] = (revisions[payload.rowId] || 0) + 1;
  },
}, extraReducers: (builder) => builder.addCase(conversationReleased, (state, action) => { delete state[action.payload]; }) });
export const { resourceChanged } = resourcesSlice.actions;
