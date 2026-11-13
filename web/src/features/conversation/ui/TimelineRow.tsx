import { memo } from "react";
import { MessageContent } from "../../details/MessageContent";
import { useAppSelector } from "../../../app/hooks";
import { DetailDisclosure } from "../../details/DetailDisclosure";
import { QuestionForm } from "../../controls/QuestionForm";
import type { QuestionRequest } from "@lan/commands";
import { TurnFooter } from "./TurnFooter";
import { usePreview } from "../../content/PreviewContext";
import { ResourceActions } from "../../details/ResourceActions";
import "./messages.css";
import "./execution.css";
import "./turn-footer.css";
import { FileCards } from "../../content/FileCards";
import { RunDuration } from "./RunDuration";

const labels = { running: "执行中", completed: "已完成", failed: "失败", interrupted: "已停止" };

export const TimelineRow = memo(function TimelineRow({ id }: { id: string }) {
  const row = useAppSelector((state) => state.conversation.entities[id]);
  const preview = usePreview();
  if (!row) return null;
  if (row.kind === "execution") {
    const heading = <><span className="execution-kind">{row.label}</span><strong><span className="execution-title-label">{row.title}</span>{!!row.changes?.added && <span className="diff-stat added">+{row.changes.added}</span>}{!!row.changes?.removed && <span className="diff-stat removed">−{row.changes.removed}</span>}</strong><span className="execution-item-status" title={labels[row.status]} aria-label={`${labels[row.status]}用时`}><RunDuration start={row.startedAt} end={row.completedAt} duration={row.durationMs} running={row.status === "running"} /></span></>;
    return <article className={`execution-entry ${row.status}`} data-row-id={id}>
      {row.preview && (row.detailId || row.files?.length) ? <button className="execution-summary" onClick={() => row.preview === "diff" && row.detailId ? preview?.({ kind: "diff", detailId: row.detailId, title: row.title }) : row.files?.[0] && preview?.({ kind: "file", path: row.files[0].path, image: true })}>{heading}</button>
        : row.detailId ? <DetailDisclosure key={row.detailId} detailId={row.detailId} rowId={id} trigger={heading} autoExpand={row.autoExpand} /> : <div className="execution-summary">{heading}</div>}
      {!row.preview && <FileCards files={row.files} />}
    </article>;
  }
  if (row.kind === "summary") return <TurnFooter row={row} />;
  if (row.request) return <AsyncQuestion request={row.request} conversationId={row.conversationId} />;
  if (row.appearance === "progress") return <div className="progress-message" data-row-id={id}><span className="progress-message-marker" aria-hidden="true" /><p>{row.text}</p></div>;
  return (
    <article className={`message ${row.appearance === "guidance" ? "guide" : row.kind} ${row.kind === "assistant" ? `markdown-output ${row.streaming ? "streaming" : ""}` : ""}`} data-row-id={id}>
      <div className="message-meta"><span className="message-role">{row.author || (row.kind === "user" ? "你" : "助手")}</span>{row.timestamp && <time className="message-time" dateTime={new Date(row.timestamp).toISOString()} title={new Date(row.timestamp).toLocaleString()}>{new Date(row.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}</time>}{row.kind === "assistant" && <ResourceActions message text={row.text} detailId={row.detailId} />}</div>
      <div className="message-body">
      <MessageContent text={row.text} rich={row.kind === "assistant"} streaming={row.streaming} truncated={row.truncated} detailId={row.detailId} revision={row.revision} files={row.files} visualizations={row.visualizations} />
      </div>
    </article>
  );
});

function AsyncQuestion({ request, conversationId }: { request: QuestionRequest; conversationId: string }) {
  const answered = useAppSelector((state) => state.controls[conversationId]?.answered.includes(request.id));
  const reply = useAppSelector((state) => (state.conversation.timelines[conversationId]?.ids || []).map((id) => state.conversation.entities[id]).find((row) => row?.kind === "user" && row.replyTo === request.id));
  return <QuestionForm request={request} answered={answered} answerText={reply?.kind === "user" ? reply.text : ""} answerDetailId={reply?.kind === "user" ? reply.detailId : undefined} answerTruncated={reply?.kind === "user" && reply.truncated} />;
}
