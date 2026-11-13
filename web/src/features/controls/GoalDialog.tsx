import { useState } from "react";
import type { ConversationControls } from "@lan/commands";
import { useActions } from "../../app/ActionContext";
import { Modal } from "../../components/Modal";
import "./GoalDialog.css";

export function goalLabel(status?: string) { return ({ active: "目标运行中", paused: "目标已暂停", blocked: "目标已阻塞", usageLimited: "目标用量受限", budgetLimited: "目标预算已用尽", complete: "目标已完成" })[status || ""] || "尚未设置目标"; }
export function goalTone(status?: string) { return status === "usageLimited" || status === "budgetLimited" ? "limited" : status || "empty"; }
export function GoalDialog({ goal, onClose }: { goal: ConversationControls["goal"]; onClose(): void }) {
  const actions = useActions();
  const [objective, setObjective] = useState(goal?.objective || ""), [budget, setBudget] = useState(String(goal?.tokenBudget || ""));
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  const run = async (patch: Extract<import("@lan/commands").ConversationCommand, { type: "goal" }>["patch"]) => {
    if (!actions || pending) return;
    setPending(true); setError("");
    try { await actions.execute({ type: "goal", patch }); actions.onSubmitted?.(); onClose(); }
    catch (error) { setError(error instanceof Error ? error.message : "目标更新失败。"); }
    finally { setPending(false); }
  };
  return <Modal kicker="持续执行" title="目标管理" className="thread-dialog goal-dialog" onClose={onClose}><form onSubmit={(event) => { event.preventDefault(); void run({ objective: objective.trim(), tokenBudget: budget ? Number(budget) : null, ...(!goal || goal.status === "complete" ? { status: "active" as const } : {}) }); }}>
    <div className="goal-summary" data-tone={goalTone(goal?.status)}><i className="goal-summary-mark" /><div><strong>{goalLabel(goal?.status)}</strong><small>{goal ? `${(goal.tokensUsed || 0).toLocaleString()}${goal.tokenBudget ? ` / ${goal.tokenBudget.toLocaleString()}` : ""} 令牌 · ${Math.round(goal.timeUsedSeconds || 0)} 秒` : `设置后，${actions?.providerName || "代理"} 会在聊天空闲时自动继续。`}</small></div></div>
    <label>长期目标<textarea disabled={pending} autoFocus rows={6} maxLength={200000} placeholder="说明要达成什么、如何验证，以及何时停止。" value={objective} onChange={(event) => setObjective(event.target.value)} required /></label>
    <label>令牌预算<input disabled={pending} type="number" min="1" max={Number.MAX_SAFE_INTEGER} step="1" inputMode="numeric" placeholder="不限制" value={budget} onChange={(event) => setBudget(event.target.value)} /></label>
    <p className="config-note">激活后会持续自动执行。暂停或清除目标不会中断当前正在运行的任务，可使用停止按钮立即中断。</p>
    <p className="form-error" role={error ? "alert" : undefined}>{error}</p>
    <div className="dialog-actions goal-dialog-actions">{goal ? <button className="danger-button" type="button" disabled={pending} onClick={() => void run(null)}>清除目标</button> : <span />}<span />
      <button className="quiet-button goal-cancel" type="button" disabled={pending} onClick={onClose}>取消</button>
      {goal && goal.status !== "complete" && <button className="quiet-button goal-toggle" type="button" disabled={pending} onClick={() => void run({ status: goal.status === "active" ? "paused" : "active" })}>{goal.status === "active" ? "暂停" : "恢复"}</button>}
      <button className="primary-button goal-save" disabled={pending || !objective.trim()}>{pending ? "正在保存…" : !goal || goal.status === "complete" ? "启动目标" : "保存修改"}</button>
    </div>
  </form></Modal>;
}
