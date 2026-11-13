import { Modal } from "../../components/Modal";
import type { WorkspaceController } from "../../app/controllers/WorkspaceController";
import { useSearch } from "../../app/controllers/useSearch";
import { Icon } from "../../components/Icon";
import "./SearchDialog.css";

export function SearchDialog({ controller, agentId, onClose, initialQuery = "", onQuery }: { controller: WorkspaceController; agentId: string; onClose(): void; initialQuery?: string; onQuery?(query: string): void }) {
  const search = useSearch(controller.client, agentId, initialQuery);
  return <Modal bare title="搜索对话" className="search-dialog" onClose={onClose} header={(titleId, close) => <div className="search-heading"><div><h2 id={titleId}>搜索对话</h2><p>搜索有权访问的项目和聊天内容</p></div><button className="icon-button" aria-label="关闭搜索" onClick={close}>×</button></div>}>
    <div className="search-input-wrap"><Icon name="search" /><input type="search" autoFocus autoComplete="off" placeholder="搜索对话内容或标题" aria-label="搜索对话" maxLength={200} value={search.query} onChange={(event) => { search.setQuery(event.target.value); onQuery?.(event.target.value); }} /></div>
    <div className="search-results" aria-live="polite">{!search.results.length && (search.error ? `搜索失败：${search.error}` : !search.query.trim() ? "输入关键词，查找对话。" : search.loading ? "正在搜索…" : search.cursor ? "本页没有可访问的结果，可继续加载。" : "没有找到匹配的对话。")}{search.results.map((result) => <button className="search-result" key={result.id} onClick={() => { controller.select(result); onClose(); }}><strong>{result.title}</strong><small>{result.projectName}</small><span>{result.snippet}</span></button>)}</div>
    {search.error && search.results.length > 0 && <p className="form-error" role="alert">加载更多失败：{search.error}</p>}
    {search.cursor && <button className="quiet-button search-more" disabled={search.loading} onClick={() => void search.more()}>加载更多</button>}
  </Modal>;
}
