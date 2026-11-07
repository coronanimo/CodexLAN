import { memo, useState } from "react";
import { useActions } from "../../app/ActionContext";
import { useAppSelector } from "../../app/hooks";
import { useAttachments } from "./useAttachments";

// Drafts survive thread switches; keystrokes stay local to this component.
// The app owns this small UI cache, independently of server conversation data.
export const Composer = memo(function Composer({ conversationId, drafts }: { conversationId: string; drafts: Map<string, string> }) {
  const [text, setText] = useState(() => drafts.get(conversationId) || "");
  const actions = useActions();
  const activeRunId = useAppSelector((state) => state.controls[conversationId]?.activeRunId);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const files = useAttachments(conversationId);
  const send = async (guide = false) => {
    if (!actions || pending || !text.trim() && !files.items.length) return;
    const submitted = text;
    const sentFiles = [...files.items];
    setPending(true); setError("");
    try {
      const uploaded = sentFiles.length ? await files.upload(sentFiles) : [];
      await actions.execute({ type: guide ? "guide" : "submit", text: submitted, ...(uploaded.length ? { attachments: uploaded.map((file) => file.id) } : {}), ...(guide && activeRunId ? { runId: activeRunId } : {}) });
      files.clearSent(sentFiles);
      if (drafts.get(conversationId) === submitted) drafts.delete(conversationId);
      setText((current) => current === submitted ? "" : current);
    } catch (error) { setError(error instanceof Error ? error.message : "发送失败，草稿已保留。"); }
    finally { setPending(false); }
  };
  return (
    <section className="composer-zone" aria-label="消息草稿">
      <label htmlFor="draft">草稿</label>
      <textarea
        id="draft"
        rows={3}
        value={text}
        placeholder="输入消息…"
        onPaste={(event) => {
          const images = [...event.clipboardData.items].filter((item) => item.kind === "file" && item.type.startsWith("image/"))
            .flatMap((item) => item.getAsFile() || []);
          if (!images.length || !actions?.capabilities.attachments) return;
          event.preventDefault(); files.add(images);
        }}
        onKeyDown={(event) => {
          if (actions && event.key === "Enter" && (event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) {
            event.preventDefault(); void send();
          }
        }}
        onChange={(event) => {
          const value = event.target.value;
          drafts.set(conversationId, value);
          setText(value);
        }}
      />
      {actions?.capabilities.attachments && <>
        <input ref={files.input} type="file" multiple hidden onChange={(event) => { files.add([...event.target.files || []]); event.target.value = ""; }} />
        <div className="attachment-list">{files.items.map((item) => <div key={item.id}>
          <span>{item.file.name} · {item.uploaded ? "已上传" : item.progress ? `${Math.round(item.progress * 100)}%` : `${Math.ceil(item.file.size / 1024)} KB`}</span>
          <button disabled={pending} onClick={() => files.remove(item.id)}>移除</button>{item.error && <span role="alert">{item.error}</span>}
        </div>)}</div>
      </>}
      {actions ? <div className="preview-controls">
        {actions.capabilities.attachments && <button disabled={pending} onClick={() => files.input.current?.click()}>添加附件</button>}
        <button disabled={pending || !text.trim() && !files.items.length} onClick={() => void send()}>{pending ? "正在提交…" : activeRunId ? "加入队列" : "发送"}</button>
        {activeRunId && actions.capabilities.steer && <button disabled={pending || !text.trim() && !files.items.length} onClick={() => void send(true)}>引导当前任务</button>}
        <small>Ctrl / ⌘ + Enter 发送</small>
      </div> : <small>此连接仅支持查看；草稿保留在当前页面。</small>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
});
