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
import { AccountMenu } from "../features/workspace/AccountMenu";
import { ProjectManager } from "../features/workspace/ProjectManager";
import { Modal } from "../components/Modal";
import "../platform/android";
import { PreviewContext } from "../features/content/PreviewContext";
import type { Preview } from "../features/content/PreviewContext";
import { PreviewHost } from "../features/content/PreviewHost";

export function App({ client = lanClient }: { client?: ReadClient }) {
  const drafts = useRef(new Map<string, string>());
  const details = useRef(new Map<string, DetailView>());
  const pendingCommands = useRef(new Set<string>());
  const attachments = useMemo(() => new Attachments(client), [client]);
  const workspace = useMemo(() => new WorkspaceController(client, () => {
    drafts.current = new Map(); details.current = new Map(); attachments.close();
  }), [client, attachments]);
  const state = useSyncExternalStore(workspace.subscribe, workspace.snapshot, workspace.snapshot);
  const history = useConversationReader(client, state.selection);
  const [navigation, setNavigation] = useState(false), [search, setSearch] = useState(false), [projects, setProjects] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  useEffect(() => setPreview(null), [state.selection]);
  const closeNavigation = useCallback(() => setNavigation(false), []);
  useEffect(() => { void workspace.start(); return () => workspace.close(); }, [workspace]);
  useEffect(() => () => attachments.close(), [attachments]);
  useEffect(() => {
    const back = () => {
      const dialog = [...document.querySelectorAll<HTMLDialogElement>("dialog[open]")].at(-1);
      if (!dialog) return "exit";
      if (!dialog.dataset.required) dialog.close();
      return "handled";
    };
    window.codexHandleAndroidBack = back;
    return () => { if (window.codexHandleAndroidBack === back) delete window.codexHandleAndroidBack; };
  }, []);
  const descriptor = state.bootstrap?.agents.find((agent) => agent.instanceId === state.agentId);
  const selection = state.selection;
  const actionPort = useMemo(() => selection && client.command && descriptor?.access === "interactive" ? {
    conversationId: selection.conversationId, selection, capabilities: descriptor.capabilities, drafts: drafts.current, attachments,
    queuedText: async (id: string) => {
      if (!client.queueItem) throw new Error("当前连接不支持读取完整队列内容。");
      return (await client.queueItem(selection, id, new AbortController().signal)).text;
    },
    execute: async (command: ConversationCommand) => {
      const key = JSON.stringify([selection, command]);
      if (pendingCommands.current.has(key)) throw new Error("这个操作正在提交，请勿重复提交。");
      pendingCommands.current.add(key);
      try {
        const result = await client.command!(selection, command, new AbortController().signal);
        history.refreshControls(); return result;
      } finally { pendingCommands.current.delete(key); }
    },
  } : null, [client, selection, descriptor, attachments, history.refreshControls, workspace]);
  const readPort = useMemo(() => selection ? { client, selection, details: details.current } : null, [client, selection]);
  const logout = () => {
    drafts.current = new Map(); details.current = new Map(); attachments.close(); workspace.loggedOut();
  };
  if (state.unauthorized) return <Login onSuccess={() => void workspace.start()} />;
  const header = <>
    <div className="workbench-title"><button className="mobile-navigation" onClick={() => setNavigation(true)}>会话</button><h2>{state.selected?.title || state.bootstrap?.edition.displayName || "LAN 工作台"}</h2></div>
    <div className="preview-controls">
      {client.search && <button onClick={() => setSearch(true)}>搜索</button>}
      <button onClick={() => void workspace.start()}>刷新工作台</button>
      <button disabled={!selection || history.loading} onClick={history.refresh}>最新记录</button>
      <button disabled={!history.before || history.loading} onClick={history.older}>加载更早记录</button>
      {state.bootstrap?.user && <><AccountMenu user={state.bootstrap.user} onUser={(user) => workspace.user(user)} onLogout={logout} /><button onClick={() => setProjects(true)}>项目管理</button></>}
      {selection && <ConversationActions controller={workspace} title={state.selected?.title || "未命名会话"} />}
      <small>{history.connection}</small>
    </div>
    {(history.error || state.error) && <p role="alert">{history.error || state.error}</p>}
    {history.loading && <p role="status">正在读取…</p>}
    {actionPort && <ControlsPanel key={selection?.conversationId} fields={state.fields} />}
  </>;
  return <ActionContext.Provider value={actionPort}><ReadContext.Provider value={readPort}><PreviewContext.Provider value={setPreview}>
    <div className="workspace-frame">
      <div className="desktop-navigation"><WorkspaceSidebar state={state} controller={workspace} /></div>
      {selection ? <Workbench conversationId={selection.conversationId} header={header} drafts={drafts.current} />
        : <main className="react-workbench"><header className="workbench-header">{header}</header><p className="empty-workspace">{state.loading ? "正在读取工作台…" : "选择一个会话，或新建会话开始。"}</p></main>}
    </div>
    {navigation && <Modal title="会话" onClose={closeNavigation}><WorkspaceSidebar state={state} controller={workspace} onNavigate={closeNavigation} /></Modal>}
    {search && <SearchDialog controller={workspace} agentId={state.agentId} onClose={() => setSearch(false)} />}
    {projects && state.bootstrap?.user && <ProjectManager user={state.bootstrap.user} onClose={() => setProjects(false)} onChanged={() => void workspace.start()} />}
    {preview && selection && <PreviewHost key={JSON.stringify(preview)} preview={preview} selection={selection} onClose={() => setPreview(null)} />}
  </PreviewContext.Provider></ReadContext.Provider></ActionContext.Provider>;
}
