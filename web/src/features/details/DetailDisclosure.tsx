import { useDetailPage } from "./useDetailPage";
import { AnsiText } from "./AnsiText";
import type { ReactNode } from "react";
import "./DetailDisclosure.css";

export function DetailDisclosure({ detailId, rowId, label = "输出", trigger, autoExpand }: { detailId: string; rowId?: string; label?: string; trigger?: ReactNode; autoExpand?: boolean }) {
  const detail = useDetailPage(detailId, rowId, autoExpand);
  if (!detail.available) return null;
  return <div className="detail-disclosure">
    <button type="button" className={trigger ? "execution-summary" : "message-action-button"} aria-label={detail.open ? `收起${label}` : `查看${label}`} aria-expanded={detail.open} onClick={detail.toggle}>{trigger || (detail.open ? `收起${label}` : `查看${label}`)}</button>
    {detail.open && <div className="execution-detail" aria-busy={detail.loading}>
      {detail.loading && <p role="status">正在读取…</p>}
      {detail.error && <p role="alert">{detail.error}<button className="quiet-button" onClick={() => void detail.load(null)}>重试</button></p>}
      {detail.page && <>
        <AnsiText text={detail.page.text} />
        {(detail.cursor !== null || detail.page.nextCursor !== null) && <nav className="detail-pagination" aria-label="输出分页">
          {detail.cursor !== null && <button type="button" className="text-button" disabled={detail.loading} onClick={() => void detail.load(null)}>回到开头</button>}
          {detail.page.nextCursor !== null && <button type="button" className="text-button" disabled={detail.loading} onClick={() => void detail.load(detail.page!.nextCursor)}>下一段</button>}
        </nav>}
      </>}
    </div>}
  </div>;
}
