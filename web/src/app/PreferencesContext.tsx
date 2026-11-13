import { createContext, useContext, useSyncExternalStore } from "react";
import { preferencesFor } from "./controllers/Preferences";
export const PreferencesContext = createContext(preferencesFor());
export function usePreferences() {
  const preferences = useContext(PreferencesContext);
  const state = useSyncExternalStore(preferences.subscribe, preferences.snapshot, preferences.snapshot);
  return { ...state, preferences };
}
