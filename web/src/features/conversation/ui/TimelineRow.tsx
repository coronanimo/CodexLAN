import { memo } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useAppSelector } from "../../../app/hooks";

const plugins = [remarkGfm];
const labels = { running: "执行中", completed: "已完成", failed: "失败", interrupted: "已停止" };

export const TimelineRow = memo(function TimelineRow({ id }: { id: string }) {
  const row = useAppSelector((state) => state.conversation.entities[id]);
  if (!row) return null;
  if (row.kind === "execution") return (
    <article className="execution-row" data-row-id={id}>
      <span>{row.label}</span><strong>{row.title}</strong><small>{labels[row.status]}</small>
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
    </article>
  );
});
