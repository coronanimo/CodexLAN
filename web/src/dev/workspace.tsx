import "../app/styles.css";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { App } from "../app/App";
import { createAppStore } from "../app/store";
import type { ReadClient, ConversationSummary, StreamHandlers, WorkspaceUpdate } from "@lan/read-api";
import type { ConversationControls } from "@lan/commands";
import type { AgentSetting } from "@lan/agent-contract";
import type { TimelineRow } from "@lan/presentation";

// Product interactions with local data only; API calls cannot reach real accounts.
const store = createAppStore(), mode = new URLSearchParams(location.search).get("mode");
const fields: AgentSetting[] = [
  { key: "fixture.model", label: "模型", role: "model", surface: "composer", kind: "choice", choices: [{ value: "default", label: "默认模型" }, { value: "fast", label: "快速模型" }] },
  { key: "fixture.reasoning", label: "推理深度", role: "reasoning", surface: "composer", kind: "choice", choices: [{ value: "high", label: "高" }, { value: "medium", label: "中" }] },
  { key: "fixture.tier", label: "优先级", role: "service-tier", surface: "composer", kind: "choice", choices: [{ value: "", label: "默认" }, { value: "fast", label: "快速" }] },
  { key: "fixture.summary", label: "思路摘要", role: "summary", surface: "settings", kind: "choice", choices: [{ value: "detailed", label: "详细" }, { value: "none", label: "关闭" }] },
  { key: "fixture.planning", label: "规划模式", role: "planning", surface: "settings", kind: "choice", switchValues: { enabled: "plan", disabled: "default" }, choices: [{ value: "default", label: "默认" }, { value: "plan", label: "规划" }] },
];
const user = { id: "fixture-user", username: "preview", displayName: "预览用户", role: mode === "admin" ? "admin" as const : "member" as const, active: true, mustChangePassword: false };
const projects = [{ id: "project-a", name: "项目资产", path: "D:/Preview/Assets", available: true }, { id: "project-b", name: "工作台开发", path: "D:/Preview/Workbench", available: true }];
const titles = ["整理项目资产", "研究环境与开发计划", "数据基础与目录梳理", "梳理部署与恢复流程", "核对项目权限", "重构会话工作台", "移动端布局与交互", "完善消息队列", "迁移设置与草稿", "历史记录分页", "排查输出渲染问题", "归档开发笔记"];
const catalog: ConversationSummary[] = titles.map((title, index) => ({ id: `ui-${index}`, projectId: "project-a", agentInstanceId: "fixture-agent", title, createdAt: 100 - index, updatedAt: 100 - index, status: index === 0 && mode === "running" ? "running" : "idle" }));
catalog.push({ id: "other-project", projectId: "project-b", agentInstanceId: "fixture-agent", title: "另一个项目的聊天", updatedAt: 101 });
const states = new Map<string, ConversationControls>(), histories = new Map<string, TimelineRow[]>();
let currentControls: ConversationControls, stream: StreamHandlers | undefined, workspace: ((event: WorkspaceUpdate) => void) | undefined, nextId = 0;
const stats = { commands: [] as unknown[], creates: 0, detailReads: 0, historyReads: 0, watches: 0, fileReads: 0, visualizationReads: 0 };
const makeRows = (id: string): TimelineRow[] => [
  { id: id + ":user", conversationId: id, runId: "run", revision: 1, kind: "user", text: "帮我梳理这个项目的资产，给出保留和后续整理的建议。" },
  { id: id + ":execution", conversationId: id, runId: "run", revision: 1, kind: "execution", label: "检查", title: "查看项目目录、研究报告与开发记录", status: "completed", detailId: "tool-output" },
  { id: id + ":answer", conversationId: id, runId: "run", revision: 1, kind: "assistant", text: "已按代码、研究资料和运行数据梳理了项目。建议先保留能支撑复现的材料，再整理可再生的中间结果。\n\n## 建议的保留顺序\n\n1. **模型、输入合同与审计证据**：这些共同构成模型身份，缺一部分就可能无法重建。\n2. **源代码、测试与研究记录**：保留关键实现，也保留说明设计决策的文档。\n3. **有价值的报告和失败路径**：保留数据口径对照、复现审计及已知问题。\n\n| 资产 | 后续处理 |\n| --- | --- |\n| 核心代码与测试 | 保留并整理入口 |\n| 研究结果与报告 | 按主题归档 |\n| 缓存及中间产物 | 核实可重建后再处理 |\n\n> 本次结论来自目录与代表性材料。原始数据和恢复副本需要单独核对，不能仅凭文件名判定其价值。", detailId: "answer-output" },
  { id: id + ":summary", conversationId: id, runId: "run", revision: 1, kind: "summary", status: "completed", startedAt: 1794060000000, completedAt: 1794060035000, recoveryDetailId: "recovery" },
];

function control(id: string) {
  if (!states.has(id)) states.set(id, { conversationId: id, writable: mode !== "readonly" || id.startsWith("new-"), status: mode === "running" && id === "ui-0" ? "running" : "idle", activeRunId: mode === "running" && id === "ui-0" ? "live-run" : null,
    queue: mode === "running" && id === "ui-0" ? [{ id: "queue-1", text: "整理完成后，补一份迁移说明。", truncated: false }] : [], queueCount: mode === "running" && id === "ui-0" ? 1 : 0, queueRevision: 1,
    goal: null, questions: [], approvals: [], answered: [], settings: { "fixture.model": "default", "fixture.reasoning": "high", "fixture.tier": "", "fixture.summary": "detailed", "fixture.planning": "default" },
    usage: { totalTokens: 18600, contextTokens: 12400, contextWindow: 128000, limits: [{ id: "fixture", label: "使用额度", windows: [{ minutes: 300, usedPercent: 12, resetsAt: 1794080000 }, { minutes: 10080, usedPercent: 36, resetsAt: 1794680000 }] }] } });
  return states.get(id)!;
}
const rowsFor = (id: string): TimelineRow[] => histories.get(id) || (id.startsWith("new-") ? [] : mode === "content" ? [
  { id: id + ":diff", conversationId: id, runId: "run", kind: "execution", label: "修改", title: "src/app.tsx", status: "completed", preview: "diff", detailId: "diff-output" },
  { id: id + ":answer", conversationId: id, runId: "run", kind: "assistant", text: "## 交付内容\n\n文档保留 **Markdown 排版**，代码修改可查看差异，图表可以交互。\n\n```mermaid\nflowchart LR\n输入 --> 处理 --> 结果\n```", files: [{ path: "D:/Preview/Assets/report.md", name: "report.md", image: false }, { path: "D:/Preview/Assets/result.png", name: "result.png", image: true }], visualizations: [{ path: "D:/Preview/Assets/chart.html", title: "交互图表", mode: "wide" }] },
] : makeRows(id));
const client: ReadClient = {
  bootstrap: async () => ({ version: 1, parallel: mode === "readonly", edition: { id: "fixture", displayName: "CodexLAN", defaultProviderId: "fixture" }, user, projects,
    agents: [{ instanceId: "fixture-agent", providerId: "fixture", displayName: "开发代理", access: "interactive", status: "ready", settings: fields,
      capabilities: { history: "paged", attachments: true, compact: true, fork: true, goals: true, approvals: true, questions: true, plans: true, interrupt: true, steer: true, usage: true } }] }),
  configuration: async () => fields,
  list: async (projectId, _agent, _cursor, _signal, order) => ({ conversations: catalog.filter((item) => item.projectId === projectId).sort((a, b) => order === "recent" ? (b.updatedAt || 0) - (a.updatedAt || 0) : 0), nextCursor: null }),
  listAll: async (_agent, _cursor, _signal, order) => ({ conversations: order === "recent" ? [...catalog].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)) : [...catalog], nextCursor: null }),
  watchWorkspace: (receive) => { workspace = receive; queueMicrotask(() => receive({ kind: "snapshot", conversations: catalog.filter((row) => row.status === "running"), projects })); return () => { workspace = undefined; }; },
  history: async ({ conversationId }, before) => { stats.historyReads++; return { conversationId, rows: before ? [{ id: conversationId + ":older", conversationId, runId: "older", kind: "user", text: "更早的一条项目消息。" }] : rowsFor(conversationId), before: null }; },
  watch: ({ conversationId }, handlers) => { stream = handlers; stats.watches++; queueMicrotask(() => { handlers.snapshot({ conversationId, rows: rowsFor(conversationId), before: conversationId.startsWith("new-") ? null : "older" }); handlers.status("实时连接正常"); }); return () => { stream = undefined; }; },
  controls: async ({ conversationId }) => currentControls = structuredClone(control(conversationId)),
  create: async (projectId, agentInstanceId, _signal, options) => { stats.creates++; const item = { id: `new-${++nextId}`, title: "未命名聊天", projectId, agentInstanceId }; catalog.unshift(item); control(item.id).settings = { ...control(item.id).settings, ...options?.settings }; return item; },
  queueItem: async ({ conversationId }, id) => ({ id, text: control(conversationId).queue.find((item) => item.id === id)?.text || "" }),
  upload: async (_selection, file, _signal, progress) => { progress(1); return { id: "upload-" + ++nextId, name: file.name, size: file.size }; },
  details: async ({ conversationId }, ref) => { stats.detailReads++; return { text: ref === "diff-output" ? "src/app.tsx\n@@ -1 +1 @@\n-const oldValue = 1;\n+const value = 2;\n" : ref === "answer-output" ? (rowsFor(conversationId).find((row) => row.kind === "assistant") as { text?: string })?.text || "" : `隔离预览 · ${ref}\n这是按需读取的输出内容。`, nextCursor: null }; },
  command: async (selection, command) => {
    stats.commands.push(command); const state = control(selection.conversationId);
    if (command.type === "settings") state.settings = { ...state.settings, ...command.values };
    if (command.type === "goal") state.goal = command.patch ? { objective: state.goal?.objective || "", status: state.goal?.status || "active", ...state.goal, ...command.patch } : null;
    if (command.type === "interrupt") { state.activeRunId = null; state.status = "idle"; }
    if (command.type === "queue.edit") state.queue = state.queue.map((item) => item.id === command.itemId ? { ...item, text: command.text } : item);
    if (command.type === "queue.remove") state.queue = state.queue.filter((item) => item.id !== command.itemId);
    if (command.type === "submit" || command.type === "guide") {
      const id = `sent-${++nextId}`, row: TimelineRow = { id, conversationId: selection.conversationId, runId: id, kind: "user", text: command.text, revision: 1 };
      histories.set(selection.conversationId, [...rowsFor(selection.conversationId), row]);
      stream?.patch({ conversationId: selection.conversationId, appendRun: true, removeIds: [], upserts: [{ row }] });
    }
    if (command.type === "rename") { const item = catalog.find((item) => item.id === selection.conversationId); if (item) item.title = command.name; }
    const item = catalog.find((item) => item.id === selection.conversationId);
    if (item) { item.status = state.status; item.goalStatus = state.goal?.status; item.queueCount = state.queue.length; workspace?.({ kind: "changed", conversation: { ...item } }); }
    state.queueCount = state.queue.length; return {};
  },
  search: async (_agentId, query) => ({ results: catalog.filter((item) => item.title.includes(query)).map((item) => ({ ...item, snippet: "隔离预览搜索结果", projectName: projects.find((p) => p.id === item.projectId)?.name || "" })), nextCursor: null }),
};
const nativeFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.origin);
  if (!url.pathname.startsWith("/api/")) return nativeFetch(input, init);
  if (url.pathname === "/api/auth/session") return Response.json({ user, csrfToken: "isolated-preview" });
  if (url.pathname === "/api/auth/profile") { const body = JSON.parse(String(init?.body || "{}")); user.displayName = body.displayName; return Response.json({ user }); }
  if (url.pathname === "/api/projects" && (!init?.method || init.method === "GET")) return Response.json({ projects });
  if (url.pathname === "/api/projects" && init?.method === "POST") { const body = JSON.parse(String(init.body)); const project = { id: "project-" + ++nextId, name: body.name, path: body.path || "D:/Preview/" + body.name, available: true }; projects.push(project); return Response.json({ project }); }
  if (/\/files\/download$/.test(url.pathname)) {
    stats.fileReads++;
    if (url.searchParams.get("path")?.endsWith(".png")) return new Response(init?.method === "HEAD" ? null : new Uint8Array(), { headers: { "Content-Type": "image/png" } });
    return new Response("# 项目报告\n\n这是 **原有 Markdown 阅读体验**。\n\n| 项目 | 状态 |\n|---|---|\n| 样式 | 保留 |", { headers: { "Content-Type": "text/markdown" } });
  }
  if (/\/visualization$/.test(url.pathname)) { stats.visualizationReads++; return new Response("<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'\"><style>body{font:16px system-ui;padding:20px}button{padding:12px}</style><h1>交互图表</h1><button id=\"counter\">0</button><script>document.querySelector('button').onclick=function(){this.textContent=Number(this.textContent)+1;parent.postMessage({fixtureVisualizationCount:Number(this.textContent)},'*')}</script>", { headers: { "Content-Type": "text/html" } }); }
  if (url.pathname === "/api/users" && (!init?.method || init.method === "GET")) return Response.json({ users: [user] });
  throw new Error("隔离预览不连接真实服务。");
};
Object.assign(window, { __workspacePreview: { stats, controls: () => currentControls, state: () => store.getState(), workspaceEvent: (event: WorkspaceUpdate) => workspace?.(event) } });
createRoot(document.getElementById("root")!).render(<Provider store={store}><App client={client} /></Provider>);
