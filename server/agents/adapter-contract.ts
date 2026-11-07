import type { AgentSetting } from "../../shared/agent-contract";
import type { PresentationPatch } from "../../shared/presentation";
import type { ConversationSummary, DetailPage, HistoryPage, ReadBootstrap } from "../../shared/read-api";
import type { ConversationCommand, ConversationControls } from "../../shared/commands";

type Project = { id: string; path: string; settings?: Record<string, string> };
type User = { id: string };
export type AgentInput = { id: string; text: string; runId?: string;
  attachments?: readonly { id?: string; path: string; name: string; size: number }[] };
export type AgentEvent = ({ kind: "patch" } & PresentationPatch)
  | { kind: "resource.changed"; rowId: string }
  | { kind: "input.accepted"; inputId: string }
  | { kind: "run.terminal"; runId: string }
  | { kind: "notice"; message: string }
  | { kind: "controls.changed" | "goal.changed" | "conversation.created" | "catalog.changed" | "removed" | "recovery.required" };

// Application ports implemented by the Codex adapter. Native wire messages,
// cursors and provider settings conversion stay inside its implementation.
export interface AgentAdapter {
  describe(): ReadBootstrap["agents"][number];
  list(project: Project, user: User, options?: { cursor?: string | null }): Promise<{
    conversations: ConversationSummary[]; nextCursor: string | null;
  }>;
  search(projects: Project[], user: User, query: string, cursor?: string | null): Promise<{ results: ConversationSummary[]; nextCursor: string | null }>;
  readHistory(conversationId: string, options?: { before?: string | null; limit?: number }): Promise<HistoryPage>;
  readDetail(conversationId: string, options: { ref: string; after?: string | null }): Promise<DetailPage>;
  export(conversationId: string, ref: string): AsyncGenerator<string>;
  create(project: Project, user: User): Promise<ConversationSummary>;
  fork(conversationId: string, project: Project, user: User): Promise<ConversationSummary>;
  controls(conversationId: string): Promise<Omit<ConversationControls, "answered" | "queue" | "queueCount" | "queueRevision">>;
  configuration(): Promise<AgentSetting[]>;
  validateSettings(settings: Record<string, string>): Promise<Record<string, string>>;
  execute(conversationId: string, project: Project, command: ConversationCommand): Promise<unknown>;
  // Input errors expose delivery: rejected | uncertain. Only a definite
  // inactive-run rejection permits the application to enqueue an async answer.
  submit(conversationId: string, project: Project, input: AgentInput): Promise<{ runId: string }>;
  guide(conversationId: string, project: Project, input: AgentInput): Promise<{ runId: string }>;
  probe(conversationId: string, project: Project): Promise<{ status: string; activeRunId: string | null; goal?: ConversationControls["goal"] }>;
  prepareAnswer(conversationId: string, requestId: string, answers: unknown): Promise<{ text: string }>;
  accepted(conversationId: string, inputId: string): boolean;
  observe(conversationId: string, listener: (event: AgentEvent) => void): () => void;
  onEvent(listener: (conversationId: string, event: AgentEvent) => void): () => void;
  notify(conversationId: string, event: AgentEvent): void;
  summary(conversationId: string): ConversationSummary;
  knownIds(): string[];
  projectHasActiveThread(projectId: string): boolean | Promise<boolean>;
  forgetProject(projectId: string, conversationIds: string[]): void;
  close(): void | Promise<void>;
}
