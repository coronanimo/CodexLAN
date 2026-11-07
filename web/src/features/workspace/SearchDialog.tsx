import { Modal } from "../../components/Modal";
import type { WorkspaceController } from "../../app/controllers/WorkspaceController";
import { useSearch } from "../../app/controllers/useSearch";

export function SearchDialog({ controller, agentId, onClose }: { controller: WorkspaceController; agentId: string; onClose(): void }) {
  const search = useSearch(controller.client, agentId);
  return <Modal title="搜索会话" onClose={onClose}>
    <label>关键词<input autoFocus aria-label="搜索关键词" maxLength={200} value={search.query} onChange={(event) => search.setQuery(event.target.value)} /></label>
    {search.loading && <p role="status">正在搜索…</p>}{search.error && <p role="alert">{search.error}</p>}
    <ul className="management-list">{search.results.map((result) => <li key={result.id}><button onClick={() => { controller.select(result); onClose(); }}>{result.projectName} · {result.title}</button><p>{result.snippet}</p></li>)}</ul>
    {search.cursor && <button disabled={search.loading} onClick={() => void search.more()}>更多结果</button>}
  </Modal>;
}
