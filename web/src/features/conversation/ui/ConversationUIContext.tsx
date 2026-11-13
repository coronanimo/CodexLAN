import { createContext, useContext } from "react";
export const ConversationUIContext = createContext({ goalOpen: false, setGoalOpen: (_value: boolean) => {}, latestRequest: 0, requestLatest: () => {} });
export const useConversationUI = () => useContext(ConversationUIContext);
