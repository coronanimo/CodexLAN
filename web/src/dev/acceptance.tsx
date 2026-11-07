import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { App } from "../app/App";
import { createAppStore } from "../app/store";
import type { ReadClient, ConversationSelection, StreamHandlers, WorkspaceUpdate } from "@lan/read-api";
import type { TimelineRow } from "@lan/presentation";
import "../app/styles.css";

const store = createAppStore(), stats = { historyReads: 0, detailReads: 0, watches: 0, commands: 0 };
const selection: ConversationSelection = { conversationId: "fixture-a", agentInstanceId: "test-agent", projectId: "fixture-project" };
const rows: TimelineRow[] = [
  ...Array.from({ length: 2000 }, (_, index): TimelineRow => ({ id: `execution-${index}`, conversationId: selection.conversationId, runId: "large-run", revision: 1,
    kind: "execution", label: "工具", title: `execution ${index}`, status: "completed", detailId: `resource-${index}` })),
  { id: "answer", conversationId: selection.conversationId, runId: "large-run", kind: "assistant", revision: 1,
    text: "检查完成。\n\n$x^2+y^2$\n\n```mermaid\nflowchart LR\nA[输入] --> B[本地草稿]\n```", detailId: "answer-resource" },
  { id: "summary", conversationId: selection.conversationId, runId: "large-run", kind: "summary", status: "completed", revision: 1 },
];
let handlers: StreamHandlers, workspace: (event: WorkspaceUpdate) => void, revision = 1;
const summary = { id: selection.conversationId, projectId: selection.projectId, agentInstanceId: selection.agentInstanceId, title: "隔离验收 · 2000 次工具执行" };
const client: ReadClient = {
  bootstrap: async () => ({ version: 1, edition: { id: "test", displayName: "LAN Fixture", defaultProviderId: "test" },
    projects: [{ id: selection.projectId, name: "隔离项目", available: true }], agents: [{ instanceId: "test-agent", providerId: "test", displayName: "Test Agent", access: "interactive", status: "ready", settings: [],
      capabilities: { history: "paged", attachments: true, compact: true, fork: true, goals: true, approvals: true, questions: true, plans: true, interrupt: true, steer: true, usage: true } }] }),
  list: async () => ({ conversations: [summary], nextCursor: null }),
  watchWorkspace: (receive) => { workspace = receive; return () => {}; },
  watch: (_selection, receive) => { handlers = receive; stats.watches++; queueMicrotask(() => receive.snapshot({ conversationId: selection.conversationId, rows: rows.slice(-100), before: String(rows.length - 100), revision })); return () => {}; },
  history: async (_selection, before) => { stats.historyReads++; const end = before ? Number(before) : rows.length, start = Math.max(0, end - 100); return { conversationId: selection.conversationId, rows: rows.slice(start, end), before: start ? String(start) : null, revision }; },
  details: async (_selection, ref) => { stats.detailReads++; return { text: `\u001b[32mOutput: ${ref}\u001b[0m`, nextCursor: null }; },
  controls: async () => ({ conversationId: selection.conversationId, status: "idle", activeRunId: null, queue: [], queueCount: 0, queueRevision: 0, goal: null, questions: [], approvals: [], answered: [], settings: {} }),
  command: async () => { stats.commands++; return {}; },
};
Object.assign(window, { __lanAcceptance: {
  stats, state: () => store.getState(),
  patch: (text: string) => handlers.patch({ conversationId: selection.conversationId, appendRun: false, removeIds: [], upserts: [{ row: { ...rows.at(-2)!, kind: "assistant", text, revision: ++revision } }] }),
  metadata: () => workspace({ kind: "changed", conversation: { ...summary, title: "标题更新", status: "running" } }),
} });
createRoot(document.getElementById("root")!).render(<Provider store={store}><App client={client} /></Provider>);
