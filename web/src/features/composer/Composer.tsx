import { memo, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useActions } from "../../app/ActionContext";
import { useAppSelector } from "../../app/hooks";
import { useAttachments } from "./useAttachments";
import { Icon } from "../../components/Icon";
import "./Composer.css";
import { usePreferences } from "../../app/PreferencesContext";
import { submitsMessage } from "./keyboard";
import { useConversationUI } from "../conversation/ui/ConversationUIContext";
import { AttachmentCard, clipboardImage } from "./AttachmentCard";

// Drafts survive thread switches; keystrokes stay local to this component.
// The app owns this small UI cache, independently of server conversation data.
export const Composer = memo(function Composer({ conversationId, drafts, toolbar }: { conversationId: string; drafts: Map<string, string>; toolbar?: ReactNode }) {
  const [text, setText] = useState(() => drafts.get(conversationId) || "");
  const actions = useActions();
  const ui = useConversationUI();
  const activeRunId = useAppSelector((state) => state.controls[conversationId]?.activeRunId);
  const usage = useAppSelector((state) => state.controls[conversationId]?.usage);
  const [mode, setMode] = useState<"queue" | "guide">("queue");
  const composition = useRef(false), input = useRef<HTMLTextAreaElement>(null);
  const { sendShortcut } = usePreferences();
  useEffect(() => { if (!activeRunId) setMode("queue"); }, [activeRunId]);
  useEffect(() => { if (actions?.focusRequest) input.current?.focus({ preventScroll: true }); }, [conversationId, actions?.focusRequest]);
  const [pending, setPending] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState("");
  const files = useAttachments(conversationId);
  const hasInput = !!text.trim() || !!files.items.length;
  const showStop = !!activeRunId && !hasInput;
  const send = async (guide = false) => {
    if (!actions || pending || !text.trim() && !files.items.length) return;
    const submitted = text;
    let outgoing = submitted;
    const sentFiles = [...files.items];
    setPending(true); setError("");
    ui.requestLatest();
    try {
      const goal = submitted.match(/^\s*\/goal(?:\s+([\s\S]*))?\s*$/i);
      if (goal && actions.capabilities.goals) {
        if (sentFiles.length) throw new Error("目标不能包含附件；请在目标文字中引用项目里的文件路径。");
        const argument = (goal[1] || "").trim();
        if (!argument) ui.setGoalOpen(true);
        else if (argument.toLowerCase() === "clear") await actions.execute({ type: "goal", patch: null });
        else if (["pause", "resume"].includes(argument.toLowerCase())) await actions.execute({ type: "goal", patch: { status: argument.toLowerCase() === "pause" ? "paused" : "active" } });
        else await actions.execute({ type: "goal", patch: { objective: argument, status: "active" } });
        if (drafts.get(conversationId) === submitted) drafts.delete(conversationId);
        setText((current) => current === submitted ? "" : current); actions.onSubmitted?.(); return;
      }
      const plan = submitted.match(/^\s*\/plan(?:\s+([\s\S]*))?\s*$/i);
      if (plan && !sentFiles.length && actions.capabilities.plans) {
        const field = actions.settings?.find((field) => field.role === "planning" && field.switchValues);
        if (!field?.switchValues) throw new Error("代理尚未提供规划模式设置。");
        outgoing = (plan[1] || "").trim();
        const current = actions.currentSettings?.()[field.key];
        await actions.execute({ type: "settings", values: { [field.key]: outgoing || current !== field.switchValues.enabled ? field.switchValues.enabled : field.switchValues.disabled } });
        if (!outgoing) { if (drafts.get(conversationId) === submitted) drafts.delete(conversationId); setText((current) => current === submitted ? "" : current); return; }
      }
      const uploaded = sentFiles.length ? await files.upload(sentFiles) : [];
      await actions.execute({ type: guide ? "guide" : "submit", text: outgoing, ...(uploaded.length ? { attachments: uploaded.map((file) => file.id) } : {}), ...(guide && activeRunId ? { runId: activeRunId } : {}) });
      files.clearSent(sentFiles);
      if (drafts.get(conversationId) === submitted) drafts.delete(conversationId);
      setText((current) => current === submitted ? "" : current);
      actions.onSubmitted?.();
    } catch (error) { setError(error instanceof Error ? error.message : "发送失败，草稿已保留。"); }
    finally { setPending(false); }
  };
  return (
    <div className="composer-editor" aria-label="消息草稿">
      {actions && <div className="composer-toolbar">
        {toolbar}
        {actions.capabilities.attachments && <button className="composer-tool-button compact-attachment-button" disabled={pending} aria-label="添加附件" title="添加附件" onClick={() => files.input.current?.click()}><Icon name="attach" /><span className="composer-tool-label">附件</span></button>}
        {actions.capabilities.steer && <div className="mode-switch" role="radiogroup" aria-label="发送方式">
          <button className={`composer-tool-button ${mode === "guide" ? "active" : ""}`} role="radio" aria-label="引导当前任务" title={activeRunId ? "向当前任务追加引导" : "当前没有运行中的任务"} aria-checked={mode === "guide"} disabled={!activeRunId} onClick={() => setMode("guide")}><Icon name="guide" /><span className="composer-tool-label">引导</span></button>
          <button className={`composer-tool-button ${mode === "queue" ? "active" : ""}`} role="radio" aria-label="排队发送" title="排队发送" aria-checked={mode === "queue"} onClick={() => setMode("queue")}><Icon name="queue" /><span className="composer-tool-label">排队</span></button>
        </div>}
      </div>}
      {usage?.contextTokens != null && <div className="context-usage"><span className="context-usage-track" aria-hidden="true"><i style={{ width: `${Math.min(100, usage.contextWindow ? usage.contextTokens / usage.contextWindow * 100 : 0)}%` }} /></span><span className="context-usage-label">窗口 {usage.contextTokens.toLocaleString()}{usage.contextWindow ? ` / ${usage.contextWindow.toLocaleString()}` : ""}</span></div>}
      {!!files.items.length && <div className="composer-attachments">{files.items.map((item) => <AttachmentCard key={item.id} item={item} pending={pending} onRemove={() => files.remove(item.id)} />)}</div>}
      <label className="visually-hidden" htmlFor="prompt">草稿</label>
      <form className="composer" onSubmit={(event) => { event.preventDefault(); void send(!!activeRunId && mode === "guide"); }}>
      <div className="composer-field"><div className="composer-measure" aria-hidden="true">{text + "\u200b"}</div>
      <textarea
        id="prompt"
        ref={input}
        className="composer-input"
        rows={1}
        maxLength={200000}
        value={text}
        placeholder={actions ? mode === "guide" && activeRunId ? "补充目标、限制或修正方向…" : `输入要交给 ${actions.providerName || "代理"} 的任务…` : "此会话为只读，可在这里保留草稿…"}
        onCompositionStart={() => { composition.current = true; }}
        onCompositionEnd={() => { composition.current = false; }}
        onPaste={(event) => {
          const images = [...event.clipboardData.items].filter((item) => item.kind === "file" && item.type.startsWith("image/"))
            .flatMap((item) => item.getAsFile() || []);
          if (!images.length || !actions?.capabilities.attachments) return;
          event.preventDefault(); const timestamp = Date.now(); files.add(images.map((file, index) => clipboardImage(file, timestamp, index)));
        }}
        onKeyDown={(event) => {
          if (actions && submitsMessage({ ...event, isComposing: event.nativeEvent.isComposing, keyCode: event.nativeEvent.keyCode }, sendShortcut, composition.current)) {
            event.preventDefault(); void send(!!activeRunId && mode === "guide");
          }
        }}
        onChange={(event) => {
          const value = event.target.value;
          drafts.set(conversationId, value);
          setText(value);
        }}
      />
      </div>
      <div className="composer-actions">
        {actions && showStop && actions.capabilities.interrupt && <button type="button" className="composer-stop-button" disabled={stopping} aria-label="停止当前任务" title="停止当前任务" onClick={async () => {
          setStopping(true); setError("");
          try { await actions.execute({ type: "interrupt", runId: activeRunId }); }
          catch (error) { setError(error instanceof Error ? error.message : "停止失败。"); }
          finally { setStopping(false); }
        }}><span aria-hidden="true">■</span></button>}
        {actions && !showStop && <button type="submit" className={`send-button ${mode === "guide" ? "guide" : ""}`} aria-label={pending ? "正在发送" : activeRunId ? mode === "guide" ? "发送引导" : "加入队列" : "发送"} title={sendShortcut === "enter" ? "Enter 发送" : "Ctrl / ⌘ + Enter 发送"} disabled={pending || !hasInput}><Icon name="send" /></button>}
      </div>
      </form>
      {actions?.capabilities.attachments && <>
        <input ref={files.input} type="file" multiple hidden onChange={(event) => { files.add([...event.target.files || []]); event.target.value = ""; }} />
      </>}
      {!actions && <small className="composer-readonly">只读会话 · 草稿保留在当前页面，可新建会话发送消息。</small>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
});
