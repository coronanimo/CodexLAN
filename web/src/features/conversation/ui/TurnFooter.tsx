import type { SummaryRow } from "@lan/presentation";
import { useContext } from "react";
import { ResourceActions } from "../../details/ResourceActions";
import { MessageContent } from "../../details/MessageContent";
import { ReadContext } from "../../../transport/ReadContext";
import { usePreview } from "../../content/PreviewContext";
import { formatDuration, RunDuration } from "./RunDuration";
import { useActions } from "../../../app/ActionContext";
import { useAppSelector } from "../../../app/hooks";
import "./turn-footer.css";

export function TurnFooter({ row }: { row: SummaryRow }) {
  const preview = usePreview(), running = row.status === "running";
  const actions = useActions();
  const read = useContext(ReadContext);
  const elapsed = <span className="turn-footer-elapsed"><RunDuration start={row.startedAt} end={row.completedAt} duration={row.timing?.totalMs} running={running} /></span>;
  const controls = useAppSelector((state) => state.controls[row.conversationId]);
  const waiting = controls?.activeRunId === row.runId ? controls.questions.length ? "等待你的回答" : controls.approvals.length ? "等待你的批准" : "" : "";
  const label = running ? waiting || row.label || "正在生成" : { completed: "已完成", failed: "失败", interrupted: "已停止" }[row.status as "completed" | "failed" | "interrupted"];
  const completed = row.plan?.plan.filter((step) => step.status === "completed").length || 0;
  return <aside className="turn-footer summary-row" aria-label="本轮任务" data-tone={row.status === "completed" ? "complete" : row.status} data-row-id={row.id}>
    {row.plan && (row.plan.plan.length > 0 || row.plan.explanation) && <section className="turn-footer-plan"><h4>计划 <span className="turn-footer-progress">{completed}/{row.plan.plan.length}</span><span className="turn-plan-title">{row.plan.explanation}</span></h4><div className="turn-plan-body"><ol>{row.plan.plan.map((step, index) => <li key={index} className={step.status}><span className="turn-plan-marker" role="img" aria-label={step.status === "completed" ? "已完成" : step.status === "inProgress" ? "进行中" : "待执行"} /><span>{step.step}</span></li>)}</ol></div></section>}
    <div className="turn-footer-bar"><span className="turn-footer-kind">小结</span><div className="turn-footer-status" tabIndex={running ? -1 : 0} aria-label={running ? undefined : "本轮小结，窄屏可横向滚动查看完整耗时"}>
      <span className="turn-footer-headline">{label}</span>{!running && elapsed}
      {!!row.changes?.files && row.diffDetailId && <button className="turn-footer-diff" aria-label={`查看本轮累计文件差异：${row.changes.files} 个文件，新增 ${row.changes.added} 行，删除 ${row.changes.removed} 行`} onClick={() => preview?.({ kind: "diff", detailId: row.diffDetailId!, title: "本轮累计文件差异" })}><span className="turn-footer-files">{row.changes.files} 个文件</span>{row.changes.added > 0 && <span className="turn-footer-added">+{row.changes.added}</span>}{row.changes.removed > 0 && <span className="turn-footer-removed">−{row.changes.removed}</span>}</button>}
      {!running && row.timing && <section className="turn-footer-timing"><h4>耗时</h4><dl><div className="turn-footer-timing-field" data-metric="command"><dt>命令</dt><dd>{row.timing.commandUnknownCount ? row.timing.commandMs ? `≥ ${formatDuration(row.timing.commandMs)}` : "未记录" : formatDuration(row.timing.commandMs)} · {row.timing.commandCount} 项</dd></div><div className="turn-footer-timing-field" data-metric="provider"><dt>{actions?.providerName || read?.providerName || "代理"}{row.timing.providerMs !== null ? " ≈" : ""}</dt><dd>{row.timing.providerMs !== null ? `${formatDuration(row.timing.providerMs)}（推算）` : "未记录（命令数据不全）"}</dd></div></dl></section>}
    </div><div className="turn-footer-tools">{running && elapsed}{!running && row.detailId && <ResourceActions detailId={row.detailId} copyOnly />}</div></div>
    {!running && row.recoveryDetailId && <div className="turn-footer-details"><MessageContent text="" detailId={row.recoveryDetailId} revision={row.revision} truncated rich={false} renderText={(text) => text.trim() ? <section className="turn-footer-recovery"><h4>本地补充输出</h4><pre>{text}</pre></section> : null} /></div>}
  </aside>;
}
