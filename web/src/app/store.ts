import { configureStore } from "@reduxjs/toolkit";
import { conversationSlice } from "../features/conversation/model/conversationSlice";
import { controlsSlice } from "../features/controls/controlsSlice";
import { resourcesSlice } from "../features/details/resourcesSlice";

export function createAppStore() {
  return configureStore({ reducer: { conversation: conversationSlice.reducer, controls: controlsSlice.reducer, resources: resourcesSlice.reducer } });
}
export type AppStore = ReturnType<typeof createAppStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];
