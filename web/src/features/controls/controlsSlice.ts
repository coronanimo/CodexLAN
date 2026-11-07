import { createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import type { ConversationControls } from "@lan/commands";

export const controlsSlice = createSlice({ name: "controls", initialState: {} as Record<string, ConversationControls>, reducers: {
  controlsReceived(state, { payload }: PayloadAction<ConversationControls>) { state[payload.conversationId] = payload; },
  controlsReleased(state, { payload }: PayloadAction<string>) { delete state[payload]; },
} });
export const { controlsReceived, controlsReleased } = controlsSlice.actions;
