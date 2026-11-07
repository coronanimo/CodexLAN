import { memo } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useAppSelector } from "../../../app/hooks";
import { DetailDisclosure } from "../../details/DetailDisclosure";

const plugins = [remarkGfm];
const labels = { running: "执行中", completed: "已完成", failed: "失败", interrupted: "已停止" };

export const TimelineRow = memo(function TimelineRow({ id }: { id: string }) {
  const row = useAppSelector((state) => state.conversation.entities[id]);
  if (!row) return null;
  if (row.kind === "execution") return (
    <article data-row-id={id}>
      <div className="execution-row"><span>{row.label}</span><strong>{row.title}</strong><small>{labels[row.status]}</small></div>
      {row.detailId && <DetailDisclosure key={row.detailId} detailId={row.detailId} />}
    </article>
  );
  if (row.kind === "summary") return (
    <footer className="summary-row" data-row-id={id}>{labels[row.status]}</footer>
  );
  return (
    <article className={`message-row ${row.kind}`} data-row-id={id}>
      <div className="message-role">{row.author || (row.kind === "user" ? "你" : "助手")}</div>
      {row.kind === "assistant"
        ? <Markdown remarkPlugins={plugins}>{row.text}</Markdown>
        : <p className="user-text">{row.text}</p>}
      {row.truncated && <p>这是一段摘要，完整内容可分段查看。</p>}
      {row.detailId && <DetailDisclosure key={row.detailId} detailId={row.detailId} />}
    </article>
  );
});
