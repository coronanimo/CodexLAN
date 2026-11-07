import type { TimelineCommit } from "./presentation";

// Protocol-neutral public metadata. A missing capability must not be emulated
// by relabelling a different operation (for example submit as steer).
export type AgentCapabilities = {
  history: "paged" | "snapshot" | "unavailable";
  interrupt: boolean;
  steer: boolean;
  fork: boolean;
  compact: boolean;
  attachments: boolean;
  approvals: boolean;
  questions: boolean;
  plans: boolean;
  goals: boolean;
  usage: boolean;
};

export type AgentDescriptor = {
  instanceId: string;
  providerId: string;
  displayName: string;
  capabilities: AgentCapabilities;
  settings: readonly AgentSetting[];
};

export type AgentSetting = {
  // Native options retain a provider namespace, e.g. codex.serviceTier.
  key: `${string}.${string}`;
  label: string;
} & (
  | { kind: "choice"; choices: readonly { value: string; label: string }[] }
  | { kind: "toggle" }
  | { kind: "number"; min?: number; max?: number }
);

export type ConversationRef = { conversationId: string; agentInstanceId: string };
export type RunState = {
  conversationId: string;
  runId: string;
  status: "running" | "completed" | "failed" | "interrupted";
};

// Versioned LAN envelope, separate from the provider's native event cursor.
// The common application layer owns this envelope and browser SSE filtering.
export type WorkspaceEvent = {
  epoch: string;
  sequence: number;
  agentInstanceId: string;
} & (
  | { kind: "timeline.committed"; commit: TimelineCommit }
  | { kind: "run.changed"; run: RunState }
  | { kind: "recovery.required"; conversationId: string }
);

export type EditionManifest = {
  id: string;
  displayName: string;
  defaultProviderId: string;
};
