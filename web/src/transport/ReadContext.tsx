import { createContext } from "react";
import type { ConversationSelection, ReadClient } from "@lan/read-api";
import type { DetailPage } from "@lan/read-api";

export type DetailView = { open: boolean; page: DetailPage | null; cursor: string | null; fullText?: string; contentRevision?: number; references?: Pick<DetailPage, "files" | "visualizations"> };
export const ReadContext = createContext<{ client: ReadClient; selection: ConversationSelection; providerName?: string; details?: Map<string, DetailView> } | null>(null);
