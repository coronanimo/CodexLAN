import type { AgentDescriptor, EditionManifest } from "./agent-contract";
import type { TimelineRow, PresentationPatch } from "./presentation";
import type { ConversationControls, ConversationCommand } from "./commands";
import type { AgentSetting } from "./agent-contract";
import type { User, UploadedFile } from "./workspace";

export type ReadBootstrap = {
  version: 1;
  edition: EditionManifest;
  user?: User;
  agents: (AgentDescriptor & { access: "read-only" | "interactive"; status: string })[];
  projects: { id: string; name: string; available: boolean }[];
};
export type ConversationSummary = { id: string; agentInstanceId: string; projectId: string; title: string; status?: string; queueCount?: number };
export type WorkspaceUpdate = { kind: "snapshot"; conversations: ConversationSummary[]; projects?: ReadBootstrap["projects"] }
  | { kind: "changed" | "created" | "removed"; conversation: ConversationSummary };
export type ConversationStreamEvent = { kind: "snapshot"; page: HistoryPage }
  | { kind: "resource.changed"; rowId: string }
  | ({ kind: "patch" } & PresentationPatch)
  | { kind: "controls.changed" | "removed" | "notice"; message?: string };
export type ConversationSelection = { conversationId: string; agentInstanceId: string; projectId: string };
export type HistoryPage = { conversationId: string; rows: TimelineRow[]; before: string | null; revision?: number };
export type DetailPage = { text: string; nextCursor: string | null; live?: boolean };
export type StreamHandlers = {
  snapshot(page: HistoryPage): void;
  patch(patch: PresentationPatch): void;
  status(message: string): void;
  controlsChanged?(): void;
  resourceChanged?(rowId: string): void;
};
export interface ReadClient {
  watchWorkspace?(receive: (update: WorkspaceUpdate) => void): () => void;
  search?(agentId: string, query: string, cursor: string | null, signal: AbortSignal): Promise<{ results: (ConversationSummary & { snippet: string; projectName: string })[]; nextCursor: string | null }>;
  fork?(selection: ConversationSelection, signal: AbortSignal): Promise<ConversationSummary>;
  upload?(selection: ConversationSelection, file: File, signal: AbortSignal, progress: (ratio: number) => void): Promise<UploadedFile>;
  queueItem?(selection: ConversationSelection, itemId: string, signal: AbortSignal): Promise<{ id: string; text: string }>;
  controls?(selection: ConversationSelection, signal: AbortSignal): Promise<ConversationControls>;
  command?(selection: ConversationSelection, command: ConversationCommand, signal: AbortSignal): Promise<{ name?: string }>;
  create?(projectId: string, agentId: string, signal: AbortSignal): Promise<ConversationSummary>;
  configuration?(agentId: string, signal: AbortSignal): Promise<AgentSetting[]>;
  watch?(selection: ConversationSelection, handlers: StreamHandlers): () => void;
  bootstrap(signal: AbortSignal): Promise<ReadBootstrap>;
  list(projectId: string, agentId: string, cursor: string | null, signal: AbortSignal): Promise<{ conversations: ConversationSummary[]; nextCursor: string | null }>;
  history(selection: ConversationSelection, before: string | null, signal: AbortSignal): Promise<HistoryPage>;
  details(selection: ConversationSelection, ref: string, cursor: string | null, signal: AbortSignal): Promise<DetailPage>;
}
