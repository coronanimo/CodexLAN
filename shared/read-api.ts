import type { AgentDescriptor, EditionManifest } from "./agent-contract";
import type { TimelineRow } from "./presentation";

export type ReadBootstrap = {
  version: 1;
  edition: EditionManifest;
  agents: (AgentDescriptor & { access: "read-only"; status: string })[];
  projects: { id: string; name: string; available: boolean }[];
};
export type ConversationSummary = { id: string; agentInstanceId: string; projectId: string; title: string };
export type ConversationSelection = { conversationId: string; agentInstanceId: string; projectId: string };
export type HistoryPage = { conversationId: string; rows: TimelineRow[]; before: string | null };
export type DetailPage = { text: string; nextOffset: number | null };
export interface ReadClient {
  bootstrap(signal: AbortSignal): Promise<ReadBootstrap>;
  list(projectId: string, agentId: string, cursor: string | null, signal: AbortSignal): Promise<{ conversations: ConversationSummary[]; nextCursor: string | null }>;
  history(selection: ConversationSelection, before: string | null, signal: AbortSignal): Promise<HistoryPage>;
  details(selection: ConversationSelection, ref: string, offset: number, signal: AbortSignal): Promise<DetailPage>;
}
