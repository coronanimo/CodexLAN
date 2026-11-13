import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ReadClient } from "@lan/read-api";
import type { ConversationCommand } from "@lan/commands";
import { lanClient } from "../transport/lan-client";
import { ReadContext } from "../transport/ReadContext";
import type { DetailView } from "../transport/ReadContext";
import { ActionContext } from "./ActionContext";
import { Workbench } from "./Workbench";
import { Login } from "./Login";
import { Attachments } from "./controllers/Attachments";
import { WorkspaceController } from "./controllers/WorkspaceController";
import { useConversationReader } from "./controllers/useConversationReader";
import { ControlsPanel } from "../features/controls/ControlsPanel";
import { WorkspaceSidebar } from "../features/workspace/WorkspaceSidebar";
import { ConversationActions } from "../features/workspace/ConversationActions";
import { SearchDialog } from "../features/workspace/SearchDialog";
import { AccountDialogs, AccountMenu } from "../features/workspace/AccountMenu";
import type { AccountPanel } from "../features/workspace/AccountMenu";
import { ProjectManager } from "../features/workspace/ProjectManager";
import { Modal } from "../components/Modal";
import "../platform/android";
import { PreviewContext } from "../features/content/PreviewContext";
import type { Preview } from "../features/content/PreviewContext";
import { PreviewHost } from "../features/content/PreviewHost";
import { useAppSelector } from "./hooks";
import { Icon } from "../components/Icon";
import { Dropdown } from "../components/Dropdown";
import "../features/workspace/WorkbenchHeader.css";
import { PreferencesContext } from "./PreferencesContext";
import { preferencesFor } from "./controllers/Preferences";
import { GlobalSettings } from "../features/workspace/GlobalSettings";
import { useStore } from "react-redux";
import type { AppStore } from "./store";
import { controlsReceived } from "../features/controls/controlsSlice";
import { useViewport } from "./controllers/useViewport";
import { ConversationTitleContext } from "./ConversationTitleContext";
import { FileAccessContext } from "../features/content/FileAccessContext";

export function App({ client = lanClient }: { client?: ReadClient }) {
  useViewport();
  const appStore = useStore.withTypes<AppStore>()();
  const drafts = useRef(new Map<string, string>());
  const details = useRef(new Map<string, DetailView>());
  const pendingCommands = useRef(new Set<string>());
  const attachments = useMemo(() => new Attachments(client), [client]);
  const workspace = useMemo(() => new WorkspaceController(client, () => {
    drafts.current = new Map(); details.current = new Map(); attachments.close();
  }, (id) => appStore.getState().controls[id]?.settings || {}), [client, attachments, appStore]);
  const state = useSyncExternalStore(workspace.subscribe, workspace.snapshot, workspace.snapshot);
  const history = useConversationReader(client, state.selected?.draft ? null : state.selection);
  useEffect(() => { if (state.selected?.draft) { const controls = workspace.draftControls(state.selected.id); if (controls) appStore.dispatch(controlsReceived(controls)); } }, [state.selected, workspace, appStore]);
  const [navigation, setNavigation] = useState(false), [search, setSearch] = useState(false), [projects, setProjects] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  useEffect(() => setSearchQuery(""), [state.bootstrap?.user?.id]);
  const [settings, setSettings] = useState(false), [newProject, setNewProject] = useState(false);
  const [accountPanel, setAccountPanel] = useState<AccountPanel | null>(null);
  useEffect(() => setAccountPanel(null), [state.bootstrap?.user?.id]);
  const [preview, setPreview] = useState<Preview | null>(null);
  useEffect(() => setPreview(null), [state.selection]);
  const closeNavigation = useCallback(() => setNavigation(false), []);
  useEffect(() => { void workspace.start(); return () => workspace.close(); }, [workspace]);
  useEffect(() => () => attachments.close(), [attachments]);
  useEffect(() => {
    const back = () => {
      const dialog = [...document.querySelectorAll<HTMLDialogElement>("dialog[open]")].at(-1);
      if (!dialog) { if (document.querySelector(".topbar-menu")) { document.dispatchEvent(new Event("lan-dismiss-overlays")); return "handled"; } return "exit"; }
      if (!dialog.dataset.required) dialog.close();
      return "handled";
    };
    window.codexHandleAndroidBack = back;
    return () => { if (window.codexHandleAndroidBack === back) delete window.codexHandleAndroidBack; };
  }, []);
  const descriptor = state.bootstrap?.agents.find((agent) => agent.instanceId === state.agentId);
  const selection = state.selection;
  const writable = useAppSelector((store) => selection ? store.controls[selection.conversationId]?.writable : undefined);
  const usage = useAppSelector((store) => selection ? store.controls[selection.conversationId]?.usage : undefined);
  const canWrite = state.selected?.draft || !state.bootstrap?.parallel || writable === true;
  const actionPort = useMemo(() => selection && canWrite && client.command && descriptor?.access === "interactive" ? {
    conversationId: selection.conversationId, selection, capabilities: descriptor.capabilities, settings: state.fields, providerName: descriptor.displayName, currentSettings: () => appStore.getState().controls[selection.conversationId]?.settings || {}, drafts: drafts.current, attachments,
    localDraft: state.selected?.draft === true,
    focusRequest: state.focusDraftId === selection.conversationId ? state.focusRequest : 0,
    resolveSelection: () => state.selected?.draft ? workspace.materialize(selection.conversationId) : Promise.resolve(selection),
    onSubmitted: () => {
      const realId = workspace.materializedId(selection.conversationId);
      if (realId) { const draft = drafts.current.get(selection.conversationId); if (draft) drafts.current.set(realId, draft); drafts.current.delete(selection.conversationId); attachments.move(selection.conversationId, realId); workspace.activateDraft(selection.conversationId); }
    },
    queuedText: async (id: string) => {
      if (!client.queueItem) throw new Error("当前连接不支持读取完整队列内容。");
      return (await client.queueItem(selection, id, new AbortController().signal)).text;
    },
    execute: async (command: ConversationCommand) => {
      const key = JSON.stringify([selection, command]);
      if (pendingCommands.current.has(key)) throw new Error("这个操作正在提交，请勿重复提交。");
      pendingCommands.current.add(key);
      try {
        if (state.selected?.draft && command.type === "settings") { const controls = workspace.updateDraft(selection.conversationId, command.values); if (controls) appStore.dispatch(controlsReceived(controls)); return {}; }
        if (state.selected?.draft && command.type === "rename") { workspace.rename(selection.conversationId, command.name.trim()); return {}; }
        if (state.selected?.draft && command.type === "delete") { workspace.remove(selection.conversationId); return {}; }
        const target = state.selected?.draft ? await workspace.materialize(selection.conversationId) : selection;
        const result = await client.command!(target, command, new AbortController().signal);
        history.refreshControls(); return result;
      } finally { pendingCommands.current.delete(key); }
    },
  } : null, [client, selection, descriptor, attachments, history.refreshControls, workspace, canWrite, state.fields, appStore, state.selected?.draft, state.focusDraftId, state.focusRequest]);
  const readPort = useMemo(() => selection && !state.selected?.draft ? { client, selection, providerName: descriptor?.displayName, details: details.current } : null, [client, selection, state.selected?.draft, descriptor?.displayName]);
  const fileAccess = useMemo(() => ({ projects: state.bootstrap?.projects || [], role: state.bootstrap?.user?.role || "member" }), [state.bootstrap?.projects, state.bootstrap?.user?.role]);
  const logout = () => {
    drafts.current = new Map(); details.current = new Map(); attachments.close(); workspace.loggedOut();
  };
  if (state.unauthorized) return <Login onSuccess={() => void workspace.start()} />;
  const projectName = state.bootstrap?.projects.find((project) => project.id === state.projectId)?.name;
  const sidebarFooter = <>
    {state.bootstrap?.user && <AccountMenu user={state.bootstrap.user} usage={usage} onPanel={(panel) => { closeNavigation(); setAccountPanel(panel); }} onLogout={logout} onSettings={() => { closeNavigation(); setSettings(true); }} onRefresh={() => location.reload()} />}
  </>;
  const header = <>
    <div className="topbar">
      <button className="icon-button mobile-navigation" aria-label="打开会话导航" onClick={() => setNavigation(true)}><span className="drawer-lines" aria-hidden="true" /></button>
      <div className="topbar-context"><span>{projectName || "尚未选择"}</span><span className="context-separator" aria-hidden="true">/</span><Dropdown className="recent-thread-wrap" label="切换最近聊天" triggerClassName="thread-switcher-button" panelClassName="recent-thread-menu" align="left" disabled={!selection} trigger={<><strong className="thread-name">{state.selected?.title || "尚未打开聊天"}</strong><Icon name="threads" viewBox="0 0 16 16" className="thread-switcher-icon" /></>}>
        {state.recent.map((item) => <button key={item.id} className={`recent-thread-item ${item.id === selection?.conversationId ? "active" : ""} ${item.status === "running" ? "running" : item.goalStatus === "active" ? "goal-active" : ""}`} onClick={() => workspace.select(item)}><strong>{item.title}</strong><small>{state.bootstrap?.projects.find((project) => project.id === item.projectId)?.name}</small></button>)}
      </Dropdown></div>
      <div className="topbar-actions">
        {state.active.length > 0 && <Dropdown label="查看运行中的任务" triggerClassName="run-status-button icon-button" panelClassName="run-strip" trigger={<span className="run-status-dot" />}>
          {state.active.map((item) => <button className={`run-card ${item.id === selection?.conversationId ? "active" : ""}`} key={item.id} onClick={() => workspace.select(item)}><span className="run-card-dot" /><span><strong>{state.bootstrap?.projects.find((project) => project.id === item.projectId)?.name} · {item.title}</strong><small>{item.status === "running" ? "执行中" : item.goalStatus === "active" ? "目标持续执行中" : "等待队列"}{item.queueCount ? ` · 队列 ${item.queueCount}` : ""}</small></span></button>)}
        </Dropdown>}
        {client.search && <button className="icon-button search-trigger" aria-label="搜索对话" title="搜索对话" onClick={() => setSearch(true)}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></svg></button>}
        <button className="icon-button quick-new-thread" aria-label="新建聊天" title="在当前项目新建聊天" disabled={state.creating || !state.projectId || !client.create} onClick={() => void workspace.create()}><span className="quick-new-thread-plus" aria-hidden="true" /></button>
        {selection && <ConversationActions key={selection.conversationId} controller={workspace} title={state.selected?.title || "未命名会话"} />}
      </div>
    </div>
    {(history.error || state.error) && <p className="workbench-alert" role="alert">{history.error || state.error}</p>}
    {history.loading && <p className="workbench-loading" role="status">正在读取…</p>}
  </>;
  return <PreferencesContext.Provider value={preferencesFor(state.bootstrap?.user?.id)}><ConversationTitleContext.Provider value={state.selected?.title || "会话记录"}><ActionContext.Provider value={actionPort}><ReadContext.Provider value={readPort}><PreviewContext.Provider value={setPreview}><FileAccessContext.Provider value={fileAccess}>
    <div className="workspace-shell">
      <div className="desktop-navigation"><WorkspaceSidebar state={state} controller={workspace} footer={sidebarFooter} onManageProjects={() => { setNewProject(false); setProjects(true); }} onNewProject={() => { setNewProject(true); setProjects(true); }} /></div>
      {selection ? <Workbench conversationId={selection.conversationId} header={header} drafts={drafts.current} history={history} controls={actionPort && <ControlsPanel key={selection.conversationId} fields={state.fields} loading={state.configurationLoading || !state.selected?.draft && history.controlsState.loading} error={state.configurationError || history.controlsState.error} onRetry={() => { if (state.configurationError) void workspace.retryConfiguration(); else history.refreshControls(); }} />} />
        : <main className="workbench"><header className="workbench-header">{header}</header><div className="empty-state"><b>{state.loading ? "正在读取工作台…" : "开始一个新会话"}</b><p>选择项目，继续已有的工作，或创建新的会话。</p><button className="primary-button" disabled={state.creating || !state.projectId || !state.agentId || !client.create} onClick={() => void workspace.create()}>新建会话</button></div></main>}
    </div>
    {navigation && <Modal title="会话" className="navigation-modal" onClose={closeNavigation}><WorkspaceSidebar state={state} controller={workspace} footer={sidebarFooter} onNavigate={closeNavigation} onManageProjects={() => { closeNavigation(); setNewProject(false); setProjects(true); }} onNewProject={() => { closeNavigation(); setNewProject(true); setProjects(true); }} /></Modal>}
    {search && <SearchDialog controller={workspace} agentId={state.agentId} initialQuery={searchQuery} onQuery={setSearchQuery} onClose={() => setSearch(false)} />}
    {projects && state.bootstrap?.user && <ProjectManager user={state.bootstrap.user} selectedProjectId={state.projectId} workspaceRoot={state.bootstrap.workspaceRoot} providerName={descriptor?.displayName || "代理"} onOpen={(id) => void workspace.project(id)} initialNew={newProject} onClose={() => setProjects(false)} onChanged={(projectId) => void workspace.start(projectId)} />}
    {state.bootstrap?.user && <AccountDialogs user={state.bootstrap.user} panel={accountPanel} providerName={descriptor?.displayName || "代理"} onUser={(user) => workspace.user(user)} onClose={() => setAccountPanel(null)} />}
    {settings && <GlobalSettings fields={state.fields} productName={state.bootstrap?.edition.displayName || ""} title={state.selected?.title || ""} connection={history.connection} onClose={() => setSettings(false)} />}
    {preview && selection && <PreviewHost key={preview.kind === "attachment" ? preview.id : JSON.stringify(preview)} preview={preview} selection={selection} onClose={() => setPreview(null)} />}
  </FileAccessContext.Provider></PreviewContext.Provider></ReadContext.Provider></ActionContext.Provider></ConversationTitleContext.Provider></PreferencesContext.Provider>;
}
