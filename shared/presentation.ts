// LAN-owned identifiers. Adapters map native provider IDs at their boundary.
type BaseRow = { id: string; conversationId: string; runId: string };

export type MessageRow = BaseRow & { kind: "user" | "assistant"; text: string; author?: string; detailId?: string; truncated?: boolean };
export type ExecutionRow = BaseRow & {
  kind: "execution";
  label: string;
  title: string;
  status: "running" | "completed" | "failed" | "interrupted";
  detailId?: string;
};
export type SummaryRow = BaseRow & {
  kind: "summary";
  status: "running" | "completed" | "failed" | "interrupted";
};
export type TimelineRow = MessageRow | ExecutionRow | SummaryRow;
export type CommittedRows = { conversationId: string; rows: TimelineRow[] };
export type TimelineCommit = CommittedRows & { placement: "snapshot" | "prepend" | "append" | "update" };

export { rowKey } from "./presentation-key.mjs";
