import { useState } from "react";
import type { QuestionRequest } from "@lan/commands";
import { useActions } from "../../app/ActionContext";
import { usePreferences } from "../../app/PreferencesContext";
import "./ControlsPanel.css";
import { MessageContent } from "../details/MessageContent";

export function QuestionForm({ request, answered = false, answerText = "", answerDetailId, answerTruncated }: { request: QuestionRequest; answered?: boolean; answerText?: string; answerDetailId?: string; answerTruncated?: boolean }) {
  const actions = useActions(), { preferences } = usePreferences();
  const prefix = `${actions?.conversationId}:question:${request.id}:`, deferredKey = `codex-workspace-deferred-async-questions:${preferences.userId}`, requestKey = `${actions?.conversationId}:${request.id}`;
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(request.questions.map((q) => [q.id, actions?.drafts.get(prefix + q.id) ?? (request.delivery === "async" ? q.options[0]?.label || "" : "")])));
  const [other, setOther] = useState<Record<string, string>>(() => Object.fromEntries(request.questions.map((q) => [q.id, actions?.drafts.get(prefix + q.id + ":other") || ""])));
  const [deferred, setDeferred] = useState(() => { try { return JSON.parse(localStorage.getItem(deferredKey) || "[]").includes(requestKey); } catch { return false; } });
  const [pending, setPending] = useState(false), [error, setError] = useState(""), [accepted, setAccepted] = useState(false);
  const [answerOpen, setAnswerOpen] = useState(false);
  const defer = (value: boolean) => {
    setDeferred(value);
    try { const ids = new Set<string>(JSON.parse(localStorage.getItem(deferredKey) || "[]")); if (value) ids.add(requestKey); else ids.delete(requestKey); localStorage.setItem(deferredKey, JSON.stringify([...ids])); } catch {}
  };
  const change = (id: string, value: string) => { actions?.drafts.set(prefix + id, value); setValues((current) => ({ ...current, [id]: value })); };
  const summary = request.questions.map((q) => q.question).join("；");
  if (answered || accepted) return <details className="async-answer-record" onToggle={(event) => setAnswerOpen(event.currentTarget.open)}><summary className="question-summary"><i className="disclosure-caret" /><span className="question-summary-state">已回答</span><span className="question-summary-text">{summary}</span></summary><div className="question-answer-body"><MessageContent rich={false} text={answerText || actions?.drafts.get(prefix + "accepted") || "回答已送达，正文尚未同步。"} detailId={answerDetailId} truncated={answerOpen && answerTruncated} /></div></details>;
  return <section className={request.delivery === "async" ? "async-question-card" : ""} aria-label="待回答的问题">
    {request.delivery === "async" && deferred && <button type="button" className="question-summary" aria-label="继续回答" onClick={() => defer(false)}><i className="disclosure-caret" /><span className="question-summary-state">待回答</span><span className="question-summary-text">{summary}</span></button>}
    <form hidden={deferred && request.delivery === "async"} className="user-input-card" onSubmit={async (event) => {
      event.preventDefault(); if (!actions || pending) return;
      const answers = Object.fromEntries(request.questions.map((q) => [q.id, { answers: [values[q.id] === "__other__" ? other[q.id] || "" : values[q.id] || ""] }]));
      if (Object.values(answers).some((answer) => !answer.answers[0]?.trim())) { setError("请回答所有问题。"); return; }
      setPending(true); setError("");
      try { await actions.execute({ type: "answer", requestId: request.id, delivery: request.delivery, answers }); actions.drafts.set(prefix + "accepted", request.questions.map((q) => `${q.question}\n我的回答：${answers[q.id]!.answers[0]}`).join("\n\n")); setAccepted(true); defer(false); }
      catch (error) { setError(error instanceof Error ? error.message : "回答失败，内容已保留。"); }
      finally { setPending(false); }
    }}>
      <div className="user-input-heading"><strong>{request.delivery === "async" ? "待回答" : "需要你确认"}</strong><span>{request.delivery === "async" ? "你可以稍后回答，代理会继续执行" : "回答后代理会继续当前任务"}</span></div>
      {request.questions.map((q) => <fieldset key={q.id} className="user-input-question" disabled={pending}><legend><span>{q.header}</span><strong>{q.question}</strong></legend>
        {q.options.length ? <>{q.options.map((option) => <label key={option.label} className="user-input-option"><input required type="radio" name={prefix + q.id} value={option.label} checked={values[q.id] === option.label} onChange={() => change(q.id, option.label)} /><span><strong>{option.label}</strong>{option.description && <small>{option.description}</small>}</span></label>)}
          {q.isOther && <label className="user-input-option"><input required type="radio" name={prefix + q.id} checked={values[q.id] === "__other__"} onChange={() => change(q.id, "__other__")} /><span><strong>其他</strong></span>{values[q.id] === "__other__" && <input autoFocus required className="user-input-other" aria-label={`${q.header}：其他回答`} type={q.isSecret ? "password" : "text"} value={other[q.id] || ""} onChange={(event) => { actions?.drafts.set(prefix + q.id + ":other", event.target.value); setOther({ ...other, [q.id]: event.target.value }); }} />}</label>}</>
          : <input required className="user-input-text" aria-label={q.question} type={q.isSecret ? "password" : "text"} value={values[q.id] || ""} onChange={(event) => change(q.id, event.target.value)} />}
      </fieldset>)}
      <div className="user-input-footer">{request.delivery === "async" && <button type="button" className="quiet-button" data-action="defer" disabled={pending} onClick={() => defer(true)}>稍后回答</button>}{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-button" disabled={!actions || pending}>{pending ? "正在回答…" : "提交回答"}</button></div>
    </form>
  </section>;
}
