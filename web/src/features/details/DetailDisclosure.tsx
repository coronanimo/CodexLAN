import { useState } from "react";
import { useDetailPage } from "./useDetailPage";

export function DetailDisclosure({ detailId }: { detailId: string }) {
  const [open, setOpen] = useState(false);
  const detail = useDetailPage(detailId);
  if (!detail.available) return null;
  return <div className="detail-disclosure">
    <button aria-expanded={open} onClick={() => {
      setOpen(!open);
      if (!open && !detail.page) void detail.load(0);
    }}>{open ? "收起输出" : "查看输出"}</button>
    {open && <div>
      {detail.loading && <p role="status">正在读取…</p>}
      {detail.error && <p role="alert">{detail.error}<button onClick={() => void detail.load(0)}>重试</button></p>}
      {detail.page && <>
        <pre>{detail.page.text}</pre>
        <button disabled={detail.loading} onClick={() => void detail.load(0)}>回到开头</button>
        {detail.page.nextOffset !== null && <button disabled={detail.loading} onClick={() => void detail.load(detail.page!.nextOffset!)}>下一段</button>}
      </>}
    </div>}
  </div>;
}
