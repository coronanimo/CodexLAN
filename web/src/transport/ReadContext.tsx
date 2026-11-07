import { createContext } from "react";
import type { ConversationSelection, ReadClient } from "@lan/read-api";
import type { DetailPage } from "@lan/read-api";

export type DetailView = { open: boolean; page: DetailPage | null; cursor: string | null };
export const ReadContext = createContext<{ client: ReadClient; selection: ConversationSelection; details?: Map<string, DetailView> } | null>(null);
