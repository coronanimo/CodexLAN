import { useDetailPage } from "./useDetailPage";
import { AnsiText } from "./AnsiText";
import { useContext } from "react";
import { ReadContext } from "../../transport/ReadContext";
import { ResourceActions } from "./ResourceActions";

export function DetailDisclosure({ detailId, rowId, label = "输出" }: { detailId: string; rowId?: string; label?: string }) {
  const detail = useDetailPage(detailId, rowId);
  const read = useContext(ReadContext);
  const exportUrl = read ? `/api/lan/conversations/${encodeURIComponent(read.selection.conversationId)}/export?${new URLSearchParams({ projectId: read.selection.projectId, agentId: read.selection.agentInstanceId, ref: detailId })}` : "";
  if (!detail.available) return null;
  return <div className="detail-disclosure">
    <button aria-expanded={detail.open} onClick={detail.toggle}>{detail.open ? `收起${label}` : `查看${label}`}</button>
    {detail.open && <div>
      {detail.loading && <p role="status">正在读取…</p>}
      {detail.error && <p role="alert">{detail.error}<button onClick={() => void detail.load(null)}>重试</button></p>}
      {detail.page && <>
        {detail.page.live && <small>实时末尾输出 · 最多 16,000 字符</small>}
        <AnsiText text={detail.page.text} />
        {exportUrl && <a href={exportUrl} download>下载完整 Markdown</a>}
        <ResourceActions detailId={detailId} />
        <button disabled={detail.loading} onClick={() => void detail.load(null)}>回到开头</button>
        {detail.page.nextCursor !== null && <button disabled={detail.loading} onClick={() => void detail.load(detail.page!.nextCursor)}>下一段</button>}
      </>}
    </div>}
  </div>;
}
