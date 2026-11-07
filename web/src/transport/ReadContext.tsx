import { createContext } from "react";
import type { ConversationSelection, ReadClient } from "@lan/read-api";

export const ReadContext = createContext<{ client: ReadClient; selection: ConversationSelection } | null>(null);
