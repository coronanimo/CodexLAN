import { memo, useCallback } from "react";
import type { ReactNode } from "react";
import { Virtuoso } from "react-virtuoso";
import type { ConversationSummary } from "@lan/read-api";
import type { WorkspaceController, WorkspaceState } from "../../app/controllers/WorkspaceController";
import { Icon } from "../../components/Icon";
import { Dropdown } from "../../components/Dropdown";
import "./WorkspaceSidebar.css";

const ConversationButton = memo(function ConversationButton({ item, controller, selected, projectName, onNavigate }: { item: ConversationSummary; controller: WorkspaceController; selected: boolean; projectName?: string; onNavigate?(): void }) {
  return <button className={`thread-item ${projectName ? "cross-project" : ""} ${selected ? "active" : ""} ${item.status === "running" ? "running" : item.goalStatus === "active" ? "goal-active" : ""}`} aria-current={selected ? "page" : undefined} onClick={() => { controller.select(item); onNavigate?.(); }}>
    <strong title={item.title}>{item.title}</strong><small>{projectName || (item.status === "running" ? "执行中" : item.goalStatus === "active" ? "目标续跑中" : item.queueCount ? `队列 ${item.queueCount}` : "空闲")}</small>
  </button>;
});
export function WorkspaceSidebar({ state, controller, onNavigate, footer, onManageProjects, onNewProject }: { state: WorkspaceState; controller: WorkspaceController; onNavigate?(): void; footer?: ReactNode; onManageProjects?(): void; onNewProject?(): void }) {
  const crossProject = state.sidebarView === "recent";
  const projects = state.bootstrap?.projects || [];
  const productName = state.bootstrap?.edition.displayName || "LAN 工作台";
  const rows = crossProject ? [...state.globalCatalog].sort((a, b) => state.sidebarOrder === "recent" ? (Date.parse(b.accessedAt || "") || (b.updatedAt || 0) * 1000) - (Date.parse(a.accessedAt || "") || (a.updatedAt || 0) * 1000) : projects.findIndex((project) => project.id === a.projectId) - projects.findIndex((project) => project.id === b.projectId)) : state.catalog;
  const loading = crossProject ? state.globalLoading : state.loading, cursor = crossProject ? state.globalCursor : state.nextCursor;
  const render = useCallback((_index: number, item: ConversationSummary) => <ConversationButton item={item} controller={controller} selected={item.id === state.selected?.id} projectName={crossProject ? projects.find((p) => p.id === item.projectId)?.name : undefined} onNavigate={onNavigate} />, [controller, state.selected?.id, onNavigate, crossProject, projects]);
  const orderedProjects = state.sidebarOrder === "recent" ? [...projects].sort((a, b) => {
    const activity = (id: string) => Math.max(0, ...state.recent.filter((row) => row.projectId === id).map((row) => Date.parse(row.accessedAt || "") || (row.updatedAt || 0) * 1000));
    return activity(b.id) - activity(a.id);
  }) : projects;
  return <aside className="sidebar workspace-sidebar" aria-label="会话导航">
    <div className="sidebar-brand"><span className="brand-mark" aria-hidden="true"><span>{productName[0]}</span><i>L</i></span><h1 className="sidebar-wordmark">{productName.endsWith("LAN") ? <>{productName.slice(0, -3)}<span>LAN</span></> : productName}</h1></div>
    <nav className="sidebar-navigation-controls" aria-label="侧边栏显示方式"><div className="sidebar-control-row"><div className="sidebar-segmented"><button aria-label="按项目组织" aria-pressed={!crossProject} onClick={() => controller.navigation("projects")}>项目</button><button aria-label="按最近对话组织" aria-pressed={crossProject} onClick={() => controller.navigation("recent")}>最近对话</button></div></div>
      <Dropdown className="sidebar-sort-wrap" triggerClassName="sidebar-sort-trigger" panelClassName="sidebar-sort-menu" label={`排序方式：${state.sidebarOrder === "recent" ? "最近使用" : "原始顺序"}`} trigger={<Icon name="sort" />}><span>排序方式</span>{(["original", "recent"] as const).map((order) => <button key={order} role="menuitemradio" aria-checked={state.sidebarOrder === order} onClick={() => controller.navigation(undefined, order)}><Icon name="check" /><strong>{order === "original" ? "原始顺序" : "最近使用"}</strong></button>)}</Dropdown>
    </nav>
    {(state.bootstrap?.agents.length || 0) > 1 && <label className="sidebar-agent">代理<select aria-label="代理" value={state.agentId} onChange={(event) => controller.agent(event.target.value)}>{state.bootstrap?.agents.map((agent) => <option key={agent.instanceId} value={agent.instanceId}>{agent.displayName}</option>)}</select></label>}
    <div className="sidebar-navigation-body">
      {!crossProject && <section className="sidebar-section projects-section"><div className="section-heading"><span>项目</span><span className="section-actions"><button className="text-button" onClick={onNewProject}>新建</button><button className="text-button" onClick={onManageProjects}>管理</button></span></div>
        <div className="project-list">{orderedProjects.map((project) => <button key={project.id} className={`project-item ${project.id === state.projectId ? "active" : ""} ${!project.available ? "unavailable" : ""}`} aria-pressed={project.id === state.projectId} onClick={() => controller.project(project.id)}><strong>{project.name}</strong><small title={project.path}>{!project.available ? "目录不可用 · " : ""}{project.path}</small></button>)}</div>
      </section>}
      <section className="sidebar-section chats-section"><div className="section-heading"><span>{crossProject ? "最近对话" : "聊天"}</span><button className="text-button" aria-label="新会话" disabled={state.creating || !state.projectId || !state.agentId || !controller.client.create || projects.find((project) => project.id === state.projectId)?.available === false} onClick={() => { void controller.create(); onNavigate?.(); }}>新建</button></div>
        {!rows.length && <p className="sidebar-empty">{loading ? "正在加载对话…" : crossProject ? "还没有可显示的对话" : "这个项目还没有聊天"}</p>}
        {crossProject && state.globalError && <p className="sidebar-empty error" role="alert">{state.globalError}<button className="text-button" onClick={() => controller.navigation("recent")}>重试</button></p>}
        <div className="conversation-navigation"><Virtuoso data={rows} defaultItemHeight={crossProject ? 38 : 32} computeItemKey={(_index, item) => item.id} itemContent={render} /></div>
        {loading && rows.length > 0 && <p className="sidebar-loading" role="status">正在读取…</p>}
        {cursor && <button className="thread-load-more" disabled={loading} onClick={() => void controller.more()}><Icon name="history" />更多会话</button>}
      </section>
    </div>
    <footer className="sidebar-dock"><div className="sidebar-tools">{footer}</div></footer>
  </aside>;
}
