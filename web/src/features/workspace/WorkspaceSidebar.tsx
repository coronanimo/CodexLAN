import { memo, useCallback } from "react";
import { Virtuoso } from "react-virtuoso";
import type { ConversationSummary } from "@lan/read-api";
import type { WorkspaceController, WorkspaceState } from "../../app/controllers/WorkspaceController";

const ConversationButton = memo(function ConversationButton({ item, controller, selected, onNavigate }: { item: ConversationSummary; controller: WorkspaceController; selected: boolean; onNavigate?(): void }) {
  return <button className="conversation-link" aria-current={selected ? "page" : undefined} onClick={() => { controller.select(item); onNavigate?.(); }}>
    <span>{item.title}</span>{(item.status === "running" || !!item.queueCount) && <small>{item.status === "running" ? "执行中" : ""}{item.queueCount ? ` · 队列 ${item.queueCount}` : ""}</small>}
  </button>;
});

export function WorkspaceSidebar({ state, controller, onNavigate }: { state: WorkspaceState; controller: WorkspaceController; onNavigate?(): void }) {
  const render = useCallback((_index: number, item: ConversationSummary) => <ConversationButton item={item} controller={controller} selected={item.id === state.selected?.id} onNavigate={onNavigate} />, [controller, state.selected?.id, onNavigate]);
  return <aside className="workspace-sidebar" aria-label="会话导航">
    <h1>{state.bootstrap?.edition.displayName || "LAN 工作台"}</h1>
    <label>代理<select aria-label="代理" value={state.agentId} onChange={(event) => controller.agent(event.target.value)}>
      {state.bootstrap?.agents.map((agent) => <option key={agent.instanceId} value={agent.instanceId}>{agent.displayName}</option>)}
    </select></label>
    <label>项目<select aria-label="项目" value={state.projectId} onChange={(event) => controller.project(event.target.value)}>
      {state.bootstrap?.projects.filter((project) => project.available).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
    </select></label>
    <button disabled={state.creating || !state.projectId || !state.agentId || !controller.client.create} onClick={() => void controller.create()}>{state.creating ? "正在创建…" : "新会话"}</button>
    <div className="conversation-navigation"><Virtuoso data={state.catalog} defaultItemHeight={52} computeItemKey={(_index, item) => item.id} itemContent={render} /></div>
    {state.loading && <p role="status">正在读取…</p>}
    {state.nextCursor && <button disabled={state.loading} onClick={() => void controller.more()}>更多会话</button>}
    {state.active.length > 0 && <details className="activity-navigation"><summary>活跃会话（{state.active.length}）</summary>
      <div>{state.active.map((item) => <ConversationButton key={item.id} item={item} controller={controller} selected={item.id === state.selected?.id} onNavigate={onNavigate} />)}</div>
    </details>}
  </aside>;
}
