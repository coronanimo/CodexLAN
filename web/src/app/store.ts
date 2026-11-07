import { configureStore } from "@reduxjs/toolkit";
import { conversationSlice } from "../features/conversation/model/conversationSlice";

export function createAppStore() {
  return configureStore({ reducer: { conversation: conversationSlice.reducer } });
}
export type AppStore = ReturnType<typeof createAppStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];
