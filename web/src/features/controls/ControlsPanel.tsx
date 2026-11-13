import type { AgentSetting } from "@lan/agent-contract";
import { useActions } from "../../app/ActionContext";
import { useAppSelector } from "../../app/hooks";
import { useConversationUI } from "../conversation/ui/ConversationUIContext";
import { GoalDialog, goalLabel, goalTone } from "./GoalDialog";
import { SettingControl } from "./SettingControl";
import { ActionButton } from "./ActionButton";
import { Icon } from "../../components/Icon";
import { QuestionForm } from "./QuestionForm";
import "./ControlsPanel.css";
export { QuestionForm } from "./QuestionForm";

export function PendingRequests({ conversationId }: { conversationId: string }) {
  const state = useAppSelector((store) => store.controls[conversationId]);
  if (!state || !state.questions.length && !state.approvals.length) return null;
  return <details open className="conversation-pending"><summary>需要处理的事项（{state.questions.length + state.approvals.length}）</summary><div className="pending-request-list">
    {state.questions.map((request) => <QuestionForm key={request.id} request={request} />)}
    {state.approvals.map((request) => <section className="user-input-card approval-card" key={request.id}><div className="user-input-heading"><strong>{request.title}</strong></div><pre className="approval-detail">{request.description}</pre><div className="approval-actions">{request.decisions.map((decision) => <ActionButton key={decision.value} command={{ type: "approve", requestId: request.id, decision: decision.value }}>{decision.label}</ActionButton>)}</div></section>)}
  </div></details>;
}
export function ControlsPanel({ fields, loading = false, error = "", onRetry }: { fields: AgentSetting[]; loading?: boolean; error?: string; onRetry?: () => void }) {
  const actions = useActions(), ui = useConversationUI();
  const state = useAppSelector((store) => actions ? store.controls[actions.conversationId] : undefined);
  if (!actions) return null;
  const quick = fields.filter((field) => field.surface === "composer");
  const planning = fields.find((field) => field.role === "planning" && field.kind === "choice" && field.switchValues && field.choices.some((choice) => choice.value === field.switchValues!.enabled));
  const planActive = !!planning && state?.settings[planning.key] === planning.switchValues?.enabled;
  return <>
    <div className="composer-quick-settings">{quick.map((field, index) => <SettingControl key={field.key} field={field} current={state?.settings[field.key] ?? field.defaultValue ?? ""} compact={index} disabled={!state || !!error} />)}</div>
    {(loading || error) && <span className="composer-settings-status" role={error ? "alert" : "status"}>{error ? `设置读取失败：${error}` : "正在读取模型设置…"}{error && onRetry && <button type="button" className="text-button" onClick={onRetry}>重试</button>}</span>}
    {actions.capabilities.goals && <button type="button" className="composer-tool-button goal-mode-button" disabled={!state} aria-label="管理目标" aria-pressed={state?.goal?.status === "active"} data-tone={goalTone(state?.goal?.status)} title={goalLabel(state?.goal?.status)} onClick={() => ui.setGoalOpen(true)}><Icon name="goal" /><span className="composer-tool-label">目标</span></button>}
    {planning && <ActionButton disabled={!state || !!state.activeRunId || state.goal?.status === "active"} label={planActive ? "退出规划模式" : "进入规划模式"} className={`composer-tool-button plan-mode-button ${planActive ? "active" : ""}`} command={{ type: "settings", values: { [planning.key]: planActive ? planning.switchValues!.disabled : planning.switchValues!.enabled } }}><Icon name="plan" /><span className="composer-tool-label">规划</span></ActionButton>}
    {ui.goalOpen && state && <GoalDialog goal={state.goal} onClose={() => ui.setGoalOpen(false)} />}
  </>;
}
