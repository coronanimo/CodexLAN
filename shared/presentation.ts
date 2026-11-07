// LAN-owned identifiers. Adapters map native provider IDs at their boundary.
import type { QuestionRequest } from "./commands";
export type FileReference = { name: string; path: string; image: boolean };
type BaseRow = { id: string; conversationId: string; runId: string; revision?: number };

export type MessageRow = BaseRow & { kind: "user" | "assistant"; text: string; author?: string; detailId?: string; truncated?: boolean; streaming?: boolean; request?: QuestionRequest; files?: FileReference[] };
export type ExecutionRow = BaseRow & {
  kind: "execution";
  label: string;
  title: string;
  status: "running" | "completed" | "failed" | "interrupted";
  detailId?: string;
  files?: FileReference[];
};
export type SummaryRow = BaseRow & {
  kind: "summary";
  status: "running" | "completed" | "failed" | "interrupted";
  startedAt?: number | null; completedAt?: number | null;
  plan?: { explanation?: string; plan: { step: string; status: string }[] };
  recoveryDetailId?: string;
  detailId?: string;
};
export type TimelineRow = MessageRow | ExecutionRow | SummaryRow;
export type CommittedRows = { conversationId: string; rows: TimelineRow[] };
export type TimelineCommit = CommittedRows & { placement: "snapshot" | "prepend" | "append" | "update" };
export type PresentationPatch = {
  revision?: number;
  conversationId: string;
  appendRun: boolean;
  removeIds: string[];
  upserts: { row: TimelineRow; beforeId?: string; afterId?: string }[];
};

export { rowKey } from "./presentation-key.mjs";
