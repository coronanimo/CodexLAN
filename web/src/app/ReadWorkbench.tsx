import { useEffect, useMemo, useRef, useState } from "react";
import type { ConversationSummary, ReadBootstrap, ReadClient } from "@lan/read-api";
import { lanClient, HttpError } from "../transport/lan-client";
import { ReadContext } from "../transport/ReadContext";
import { useConversationReader } from "./controllers/useConversationReader";
import { Workbench } from "./Workbench";
import { Login } from "./Login";

export function ReadWorkbench({ client = lanClient }: { client?: ReadClient }) {
  const [bootstrap, setBootstrap] = useState<ReadBootstrap | null>(null);
  const [projectId, setProjectId] = useState("");
  const [agentId, setAgentId] = useState("");
  const [catalog, setCatalog] = useState<ConversationSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState("");
  const [error, setError] = useState("");
  const [unauthorized, setUnauthorized] = useState(false);
  const [reload, setReload] = useState(0);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const catalogRequest = useRef<AbortController | null>(null);
  const drafts = useRef(new Map<string, string>());
  useEffect(() => {
    const controller = new AbortController();
    client.bootstrap(controller.signal).then((data) => {
      if (controller.signal.aborted) return;
      setBootstrap(data); setUnauthorized(false); setError("");
      setProjectId(data.projects.find((project) => project.available)?.id || "");
      setAgentId((data.agents.find((agent) => agent.providerId === data.edition.defaultProviderId) || data.agents[0])?.instanceId || "");
      document.title = `${data.edition.displayName} · 只读预览`;
    }).catch((error: Error) => {
      if (controller.signal.aborted) return;
      if (error instanceof HttpError && error.status === 401) setUnauthorized(true);
      else setError(error.message);
    });
    return () => controller.abort();
  }, [client, reload]);
  useEffect(() => {
    if (!projectId || !agentId) return;
    catalogRequest.current?.abort();
    const controller = catalogRequest.current = new AbortController();
    setCatalog([]); setConversationId(""); setNextCursor(null); setCatalogLoading(true);
    client.list(projectId, agentId, null, controller.signal).then((page) => {
      if (controller.signal.aborted) return;
      setCatalog(page.conversations); setNextCursor(page.nextCursor);
      setConversationId(page.conversations[0]?.id || ""); setError("");
    }).catch((error: Error) => { if (!controller.signal.aborted) setError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setCatalogLoading(false); });
    return () => { controller.abort(); catalogRequest.current?.abort(); };
  }, [client, projectId, agentId, reload]);
  const selected = catalog.find((item) => item.id === conversationId && item.projectId === projectId && item.agentInstanceId === agentId);
  const selection = useMemo(() => selected ? { conversationId: selected.id, agentInstanceId: selected.agentInstanceId, projectId: selected.projectId } : null, [selected]);
  const context = useMemo(() => selection ? { client, selection } : null, [client, selection]);
  const history = useConversationReader(client, selection);
  const moreConversations = async () => {
    if (!nextCursor) return;
    const requestedProject = projectId, requestedAgent = agentId;
    catalogRequest.current?.abort();
    const controller = catalogRequest.current = new AbortController();
    setCatalogLoading(true);
    try {
      const page = await client.list(requestedProject, requestedAgent, nextCursor, controller.signal);
      if (controller.signal.aborted) return;
      setCatalog((current) => [...current, ...page.conversations.filter((item) => !current.some((existing) => existing.id === item.id))]);
      setNextCursor(page.nextCursor);
    } catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "读取失败。"); }
    finally { if (!controller.signal.aborted) setCatalogLoading(false); }
  };
  if (unauthorized) return <Login onSuccess={() => setReload((value) => value + 1)} />;
  const header = <>
    <h1>{bootstrap?.edition.displayName || "LAN 工作台"} · 只读预览</h1>
    <div className="catalog-controls">
      <label>代理<select aria-label="代理" value={agentId} onChange={(event) => setAgentId(event.target.value)}>
        {bootstrap?.agents.map((agent) => <option key={agent.instanceId} value={agent.instanceId}>{agent.displayName}</option>)}
      </select></label>
      <label>项目<select aria-label="项目" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
        {bootstrap?.projects.filter((project) => project.available).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
      </select></label>
      <label>会话<select aria-label="会话" value={conversationId} onChange={(event) => setConversationId(event.target.value)}>
        {catalog.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
      </select></label>
    </div>
    <div className="preview-controls">
      <button onClick={() => setReload((value) => value + 1)}>重新连接</button>
      <button disabled={!selection || history.loading} onClick={history.refresh}>刷新最新</button>
      <button disabled={!history.before || history.loading} onClick={history.older}>加载更早记录</button>
      {nextCursor && <button disabled={catalogLoading} onClick={() => void moreConversations()}>更多会话</button>}
      <small>手动刷新 · 暂未启用发送和实时订阅</small>
    </div>
    {(history.loading || catalogLoading || !bootstrap && !error) && <p role="status">正在读取…</p>}
    {(history.error || error) && <p role="alert">{history.error || error}</p>}
  </>;
  if (!selection) return <main className="react-workbench"><header className="workbench-header">{header}</header><p>请选择有记录的会话。</p></main>;
  return <ReadContext.Provider value={context}><Workbench conversationId={conversationId} header={header} drafts={drafts.current} /></ReadContext.Provider>;
}
