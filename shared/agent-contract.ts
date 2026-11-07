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

export type EditionManifest = {
  id: string;
  displayName: string;
  defaultProviderId: string;
};
