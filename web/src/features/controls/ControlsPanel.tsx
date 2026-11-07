import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type { AgentSetting } from "@lan/agent-contract";
import type { ConversationCommand, QuestionRequest } from "@lan/commands";
import { useActions } from "../../app/ActionContext";
import { useAppSelector } from "../../app/hooks";

function ActionButton({ command, children, disabled = false }: { command: ConversationCommand; children: ReactNode; disabled?: boolean }) {
  const actions = useActions();
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  const execute = async () => {
    if (!actions || pending) return;
    setPending(true); setError("");
    try { await actions.execute(command); }
    catch (error) { setError(error instanceof Error ? error.message : "操作失败。"); }
    finally { setPending(false); }
  };
  return <><button disabled={disabled || pending} onClick={() => void execute()}>{pending ? "正在处理…" : children}</button>{error && <span role="alert">{error}</span>}</>;
}

export function QuestionForm({ request }: { request: QuestionRequest }) {
  const actions = useActions();
  const prefix = `${actions?.conversationId}:question:${request.id}:`;
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(request.questions.map((question) => [question.id, actions?.drafts.get(prefix + question.id) || ""])));
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!actions || pending) return;
    setPending(true); setError("");
    try {
      await actions.execute({ type: "answer", requestId: request.id, delivery: request.delivery,
        answers: Object.fromEntries(request.questions.map((question) => [question.id, { answers: [values[question.id] || ""] }])) });
      for (const question of request.questions) actions.drafts.delete(prefix + question.id);
    } catch (error) { setError(error instanceof Error ? error.message : "回答失败，内容已保留。"); }
    finally { setPending(false); }
  };
  const change = (id: string, value: string) => { actions?.drafts.set(prefix + id, value); setValues((current) => ({ ...current, [id]: value })); };
  return <form className="question-card" onSubmit={(event) => void submit(event)}>
    {request.questions.map((question) => <label key={question.id}>
      <strong>{question.header}</strong><span>{question.question}</span>
      {question.options.length > 0 && <select aria-label={question.header + "选项"} value={question.options.some((option) => option.label === values[question.id]) ? values[question.id] : ""} onChange={(event) => change(question.id, event.target.value)}>
        <option value="" disabled>请选择</option>{question.options.map((option) => <option key={option.label} value={option.label}>{option.label}{option.description ? ` — ${option.description}` : ""}</option>)}
      </select>}
      {(!question.options.length || question.isOther) && <input aria-label={question.header} type={question.isSecret ? "password" : "text"} value={values[question.id] || ""} onChange={(event) => change(question.id, event.target.value)} required />}
    </label>)}
    {error && <p role="alert">{error}</p>}
    <button disabled={pending}>{pending ? "正在回答…" : "提交回答"}</button>
  </form>;
}

function QueueItem({ id, text, truncated, error: deliveryError, delivery, runId }: { id: string; text: string; truncated: boolean; error?: string; delivery?: string; runId: string | null }) {
  const actions = useActions();
  const [editing, setEditing] = useState(false), [value, setValue] = useState(text), [error, setError] = useState("");
  const [verified, setVerified] = useState(false);
  const save = async () => {
    try { await actions?.execute({ type: "queue.edit", itemId: id, text: value }); setEditing(false); }
    catch (error) { setError(error instanceof Error ? error.message : "保存失败。"); }
  };
  const edit = async () => {
    try { setValue(truncated && actions ? await actions.queuedText(id) : text); setEditing(true); }
    catch (error) { setError(error instanceof Error ? error.message : "读取失败。"); }
  };
  return <li>
    {editing ? <><textarea aria-label="编辑排队消息" value={value} onChange={(event) => setValue(event.target.value)} /><button onClick={() => void save()}>保存</button><button onClick={() => setEditing(false)}>取消</button></> : <><p>{text}{truncated ? "…" : ""}</p><button onClick={() => void edit()}>编辑</button></>}
    {deliveryError && <p role="status">{deliveryError}</p>}
    {delivery === "rejected" && <ActionButton command={{ type: "queue.retry", itemId: id }}>重试发送</ActionButton>}
    {delivery === "uncertain" && <label><input type="checkbox" checked={verified} onChange={(event) => setVerified(event.target.checked)} />我已核对该消息未被接收<ActionButton disabled={!verified} command={{ type: "queue.retry", itemId: id, verified: true }}>重新发送</ActionButton></label>}
    <ActionButton command={{ type: "queue.move", itemId: id, direction: "up" }}>上移</ActionButton>
    <ActionButton command={{ type: "queue.move", itemId: id, direction: "down" }}>下移</ActionButton>
    <ActionButton command={{ type: "queue.remove", itemId: id }}>移除</ActionButton>
    {runId && <ActionButton command={{ type: "queue.guide", itemId: id, runId }}>转为引导</ActionButton>}
    {error && <span role="alert">{error}</span>}
  </li>;
}

export function ControlsPanel({ fields }: { fields: AgentSetting[] }) {
  const actions = useActions();
  const state = useAppSelector((store) => actions ? store.controls[actions.conversationId] : undefined);
  const [objective, setObjective] = useState(""), [budget, setBudget] = useState("");
  const [queueOpen, setQueueOpen] = useState(false);
  if (!actions || !state) return null;
  return <div className="conversation-controls">
    <div className="preview-controls">
      {state.activeRunId && actions.capabilities.interrupt && <ActionButton command={{ type: "interrupt", runId: state.activeRunId }}>停止任务</ActionButton>}
      {actions.capabilities.compact && <ActionButton command={{ type: "compact" }} disabled={!!state.activeRunId}>压缩上下文</ActionButton>}
      <span>{state.status === "running" ? "执行中" : state.status === "idle" ? "空闲" : state.status}</span>
      {state.usage?.contextTokens != null && <small>上下文 {state.usage.contextTokens.toLocaleString()}{state.usage.contextWindow ? ` / ${state.usage.contextWindow.toLocaleString()}` : ""} tokens</small>}
    </div>
    {state.usage && state.usage.limits.length > 0 && <details><summary>额度用量</summary>{state.usage.limits.map((limit) => <p key={limit.id}>{limit.label} · {limit.windows.map((window) => `${window.minutes ?? "?"} 分钟窗口：${window.usedPercent ?? "?"}%${window.resetsAt ? `，${new Date(window.resetsAt * 1000).toLocaleString()} 重置` : ""}`).join("；")}</p>)}</details>}
    {state.questions.map((request) => <QuestionForm key={request.id} request={request} />)}
    {state.approvals.map((request) => <section className="question-card" key={request.id}>
      <strong>{request.title}</strong><pre>{request.description}</pre>
      {request.decisions.map((decision) => <ActionButton key={decision.value} command={{ type: "approve", requestId: request.id, decision: decision.value }}>{decision.label}</ActionButton>)}
    </section>)}
    <details onToggle={(event) => setQueueOpen(event.currentTarget.open)}><summary>队列（{state.queueCount}）</summary>{queueOpen && <ol>{state.queue.map((item) => <QueueItem key={item.id} {...item} runId={state.activeRunId} />)}</ol>}</details>
    {actions.capabilities.goals && <details><summary>目标{state.goal ? ` · ${state.goal.status}` : ""}</summary>
      {state.goal && <><p>{state.goal.objective}</p><ActionButton command={{ type: "goal", patch: { status: state.goal.status === "active" ? "paused" : "active" } }}>{state.goal.status === "active" ? "暂停目标" : "继续目标"}</ActionButton><ActionButton command={{ type: "goal", patch: null }}>清除目标</ActionButton></>}
      <label>目标内容<textarea value={objective} onChange={(event) => setObjective(event.target.value)} /></label>
      <label>Token 预算<input type="number" min="1" value={budget} onChange={(event) => setBudget(event.target.value)} /></label>
      <ActionButton disabled={!objective.trim()} command={{ type: "goal", patch: { objective, tokenBudget: budget ? Number(budget) : null } }}>保存目标</ActionButton>
    </details>}
    <details><summary>代理设置</summary>{fields.map((field) => <SettingControl key={field.key} field={field} current={state.settings[field.key] ?? ""} />)}</details>
  </div>;
}

function SettingControl({ field, current }: { field: AgentSetting; current: string | number | boolean }) {
  const actions = useActions();
  const [error, setError] = useState("");
  const save = async (value: string | number | boolean) => {
    try { await actions?.execute({ type: "settings", values: { [field.key]: value } }); setError(""); }
    catch (error) { setError(error instanceof Error ? error.message : "设置失败。"); }
  };
  if (field.kind === "toggle") return <label><input type="checkbox" checked={current === true} onChange={(event) => void save(event.target.checked)} />{field.label}{error && <span role="alert">{error}</span>}</label>;
  if (field.kind === "number") return <label>{field.label}<input type="number" min={field.min} max={field.max} value={String(current)} onChange={(event) => { if (event.currentTarget.checkValidity() && Number.isFinite(event.currentTarget.valueAsNumber)) void save(event.currentTarget.valueAsNumber); }} />{error && <span role="alert">{error}</span>}</label>;
  return <label>{field.label}<select value={String(current)} onChange={(event) => void save(event.target.value)}>
    {!field.choices.some((option) => option.value === current) && <option value={String(current)}>{String(current) || "默认"}</option>}
    {field.choices.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
  </select>{error && <span role="alert">{error}</span>}</label>;
}
