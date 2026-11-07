import type { AgentDescriptor, ConversationRef, RunState } from "../../shared/agent-contract";
import type { TimelineCommit } from "../../shared/presentation";
import type { ConversationSummary, DetailPage, HistoryPage, ReadBootstrap } from "../../shared/read-api";

// The first implemented seam is read-only. Command/lifecycle extraction below
// remains a separate draft, not a claim that a read adapter supports task writes.
export interface ReadAgentAdapter {
  describe(): ReadBootstrap["agents"][number];
  list(project: { id: string; path: string }, user: { id: string }, options?: { cursor?: string | null }): Promise<{
    conversations: ConversationSummary[]; nextCursor: string | null;
  }>;
  readHistory(conversationId: string, options?: { before?: string | null; limit?: number }): Promise<HistoryPage>;
  readDetail(conversationId: string, options: { ref: string; offset?: number }): Promise<DetailPage>;
}

// Preparation contract, not a working Codex/Pi/Claude/AGY adapter. The next phase
// validates these ports against the existing Codex paths before freezing them.
export type AgentInput = {
  text: string;
  attachments: readonly { id: string; localPath: string; mediaType: string }[];
};
export type AdapterContext = { signal: AbortSignal };
export type AdapterEvent =
  | { kind: "timeline.committed"; commit: TimelineCommit }
  | { kind: "run.changed"; run: RunState }
  | { kind: "recovery.required"; conversationId: string };

export interface AgentAdapter {
  describe(context: AdapterContext): Promise<AgentDescriptor>;
  start(context: AdapterContext): Promise<void>;
  close(): Promise<void>;
  createConversation(projectDirectory: string, context: AdapterContext): Promise<ConversationRef>;
  // The shared queue advances only after explicit acceptance/terminal evidence.
  // A timeout is not permission to retry an ambiguously accepted submission.
  submit(ref: ConversationRef, input: AgentInput, context: AdapterContext): Promise<{ runId: string }>;
  subscribe(listener: (event: AdapterEvent) => void, context: AdapterContext): () => void;
  history?: {
    read(ref: ConversationRef, cursor: string | null, context: AdapterContext): Promise<{
      commit: TimelineCommit; nextCursor: string | null;
    }>;
  };
  interrupt?: (ref: ConversationRef, runId: string, context: AdapterContext) => Promise<void>;
  steer?: (ref: ConversationRef, runId: string, input: AgentInput, context: AdapterContext) => Promise<void>;
}
