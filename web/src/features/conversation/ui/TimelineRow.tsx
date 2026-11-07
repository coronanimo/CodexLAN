import { memo } from "react";
import { RichText } from "../../content/RichText";
import { useAppSelector } from "../../../app/hooks";
import { DetailDisclosure } from "../../details/DetailDisclosure";
import { QuestionForm } from "../../controls/ControlsPanel";
import { useActions } from "../../../app/ActionContext";
import type { QuestionRequest } from "@lan/commands";
import { RunDuration } from "./RunDuration";
import { usePreview } from "../../content/PreviewContext";

const labels = { running: "执行中", completed: "已完成", failed: "失败", interrupted: "已停止" };

export const TimelineRow = memo(function TimelineRow({ id }: { id: string }) {
  const row = useAppSelector((state) => state.conversation.entities[id]);
  const preview = usePreview();
  if (!row) return null;
  if (row.kind === "execution") return (
    <article data-row-id={id}>
      <div className="execution-row"><span>{row.label}</span><strong>{row.title}</strong><small>{labels[row.status]}</small></div>
      {row.files?.map((file) => <button key={file.path} onClick={() => preview?.({ kind: "file", path: file.path, image: file.image })}>{file.name}</button>)}
      {row.detailId && <DetailDisclosure key={row.detailId} detailId={row.detailId} rowId={id} />}
    </article>
  );
  if (row.kind === "summary") return (
    <footer className="summary-row" data-row-id={id}>
      {labels[row.status]}<RunDuration start={row.startedAt} end={row.completedAt} running={row.status === "running"} />
      {row.plan && <details><summary>计划 · {row.plan.plan.filter((step) => step.status === "completed").length}/{row.plan.plan.length}</summary>
        <p>{row.plan.explanation}</p><ol>{row.plan.plan.map((step, index) => <li key={index}>{step.status === "completed" ? "✓" : step.status === "inProgress" ? "进行中 · " : ""}{step.step}</li>)}</ol>
      </details>}
      {row.detailId && <DetailDisclosure key={row.detailId} detailId={row.detailId} />}
      {row.recoveryDetailId && <DetailDisclosure detailId={row.recoveryDetailId} label="恢复副本" />}
    </footer>
  );
  return (
    <article className={`message-row ${row.kind}`} data-row-id={id}>
      <div className="message-role">{row.author || (row.kind === "user" ? "你" : "助手")}</div>
      {row.kind === "assistant"
        ? <RichText text={row.text} streaming={row.streaming} />
        : <p className="user-text">{row.text}</p>}
      {row.truncated && <p>这是一段摘要，完整内容可分段查看。</p>}
      {row.files?.map((file) => <button key={file.path} onClick={() => preview?.({ kind: "file", path: file.path, image: file.image })}>{file.name}</button>)}
      {row.detailId && <DetailDisclosure key={row.detailId} detailId={row.detailId} />}
      {row.request && <AsyncQuestion request={row.request} conversationId={row.conversationId} />}
    </article>
  );
});

function AsyncQuestion({ request, conversationId }: { request: QuestionRequest; conversationId: string }) {
  const actions = useActions();
  const answered = useAppSelector((state) => state.controls[conversationId]?.answered.includes(request.id));
  return actions ? answered ? <p>已回答</p> : <QuestionForm request={request} /> : null;
}
