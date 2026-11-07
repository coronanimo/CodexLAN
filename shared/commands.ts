export type Question = { id: string; header: string; question: string; isOther: boolean; isSecret: boolean;
  options: { label: string; description: string }[] };
export type QuestionRequest = { id: string; delivery: "blocking" | "async"; questions: Question[] };
export type ConversationControls = {
  conversationId: string; activeRunId: string | null; status: string;
  queueRevision: number; queueCount: number; queue: { id: string; text: string; truncated: boolean; error?: string; delivery?: string }[];
  goal: { objective: string; status: string; tokenBudget?: number | null } | null;
  questions: QuestionRequest[];
  approvals: { id: string; title: string; description: string; decisions: { value: string; label: string }[] }[];
  answered: string[];
  settings: Record<string, string | number | boolean>;
  usage?: { totalTokens: number | null; contextTokens: number | null; contextWindow: number | null;
    limits: { id: string; label: string; windows: { usedPercent: number | null; minutes: number | null; resetsAt: number | null }[] }[] };
};
export type ConversationCommand =
  | { type: "submit" | "guide"; text: string; runId?: string; attachments?: string[] }
  | { type: "interrupt"; runId: string }
  | { type: "compact" }
  | { type: "delete" | "suggestName" }
  | { type: "rename"; name: string }
  | { type: "queue.remove" | "queue.guide"; itemId: string; runId?: string }
  | { type: "queue.edit"; itemId: string; text: string }
  | { type: "queue.move"; itemId: string; direction: "up" | "down" }
  | { type: "queue.retry"; itemId: string; verified?: boolean }
  | { type: "answer"; requestId: string; delivery: "blocking" | "async"; answers: Record<string, { answers: string[] }> }
  | { type: "approve"; requestId: string; decision: string }
  | { type: "goal"; patch: { objective?: string; status?: "active" | "paused"; tokenBudget?: number | null } | null }
  | { type: "settings"; values: Record<string, string | number | boolean> };
