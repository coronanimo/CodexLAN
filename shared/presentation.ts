// LAN-owned identifiers. Adapters map native provider IDs at their boundary.
import type { QuestionRequest } from "./commands";
export type FileReference = { name: string; path: string; image: boolean; label?: string };
export type VisualizationReference = { path: string; title: string; mode: "wide" | "standard" };
type BaseRow = { id: string; conversationId: string; runId: string; revision?: number };
export type ChangeStats = { files: number; added: number; removed: number };

export type MessageRow = BaseRow & { kind: "user" | "assistant"; text: string; author?: string; appearance?: "guidance" | "progress"; timestamp?: number | null; replyTo?: string; detailId?: string; truncated?: boolean; streaming?: boolean; request?: QuestionRequest; files?: FileReference[]; visualizations?: VisualizationReference[] };
export type ExecutionRow = BaseRow & {
  kind: "execution";
  label: string;
  title: string;
  status: "running" | "completed" | "failed" | "interrupted";
  detailId?: string;
  files?: FileReference[];
  preview?: "diff" | "image";
  changes?: ChangeStats;
  hideCompletedStatus?: boolean;
  startedAt?: number | null;
  completedAt?: number | null;
  durationMs?: number;
  autoExpand?: boolean;
};
export type SummaryRow = BaseRow & {
  kind: "summary";
  label?: string;
  status: "running" | "completed" | "failed" | "interrupted";
  startedAt?: number | null; completedAt?: number | null;
  plan?: { explanation?: string; plan: { step: string; status: string }[] };
  recoveryDetailId?: string;
  changes?: ChangeStats;
  diffDetailId?: string;
  timing?: { totalMs: number; commandMs: number; commandCount: number; commandUnknownCount: number; providerMs: number | null };
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
  // Adapter-confirmed relative positions, independent of content revisions.
  // Applies only to retained rows; never materializes an unloaded history page.
  placements?: { id: string; revision: number; beforeId?: string; afterId?: string }[];
  upserts: { row: TimelineRow; beforeId?: string; afterId?: string }[];
};

export { rowKey } from "./presentation-key.mjs";
