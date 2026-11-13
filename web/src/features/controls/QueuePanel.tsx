import { useState } from "react";
import { useActions } from "../../app/ActionContext";
import { useAppSelector } from "../../app/hooks";
import type { ConversationControls } from "@lan/commands";
import { ActionButton } from "./ActionButton";
import { Modal } from "../../components/Modal";
import { MutationForm } from "../../components/MutationForm";
import "./ControlsPanel.css";

function QueueRow({ item, index, length, runId }: { item: ConversationControls["queue"][number]; index: number; length: number; runId: string | null }) {
  const actions = useActions();
  const [editing, setEditing] = useState(false), [value, setValue] = useState(""), [error, setError] = useState(""), [verified, setVerified] = useState(false);
  const busy = item.delivery === "submitting";
  return <li className="queue-item"><span className="queue-index">{index + 1}</span><span className="queue-text" title={item.text}>{item.text}{item.truncated && "…"}</span><div className="queue-actions">
    <ActionButton disabled={!runId || busy} label="转入当前信息流" command={{ type: "queue.guide", itemId: item.id, runId: runId || undefined }}>↗</ActionButton>
    <button type="button" disabled={!actions || busy} aria-label="编辑排队消息" title="编辑" onClick={async () => { try { setValue(await actions!.queuedText(item.id)); setEditing(true); } catch (error) { setError(error instanceof Error ? error.message : "读取失败。"); } }}>✎</button>
    <ActionButton disabled={!index || busy} label="上移" command={{ type: "queue.move", itemId: item.id, direction: "up" }}>↑</ActionButton>
    <ActionButton disabled={index === length - 1 || busy} label="下移" command={{ type: "queue.move", itemId: item.id, direction: "down" }}>↓</ActionButton>
    <ActionButton disabled={busy} label="移除" command={{ type: "queue.remove", itemId: item.id }}>×</ActionButton>
  </div>{(item.error || error) && <small className="queue-delivery" role="status">{error || item.error}</small>}
    {item.delivery === "rejected" && <ActionButton command={{ type: "queue.retry", itemId: item.id }}>重试发送</ActionButton>}
    {item.delivery === "uncertain" && <label className="queue-delivery"><input type="checkbox" checked={verified} onChange={(event) => setVerified(event.target.checked)} />我已核对该消息未被接收<ActionButton disabled={!verified} command={{ type: "queue.retry", itemId: item.id, verified: true }}>重新发送</ActionButton></label>}
    {editing && <Modal kicker="等待队列" title="编辑排队任务" onClose={() => setEditing(false)}><MutationForm label="保存修改" onCancel={() => setEditing(false)} submit={() => actions!.execute({ type: "queue.edit", itemId: item.id, text: value })} onSuccess={() => setEditing(false)}><label>任务内容<textarea autoFocus rows={6} maxLength={200000} aria-label="编辑排队消息" value={value} onChange={(event) => setValue(event.target.value)} required /></label></MutationForm></Modal>}
  </li>;
}
export function QueuePanel({ conversationId }: { conversationId: string }) {
  const state = useAppSelector((store) => store.controls[conversationId]);
  if (!state?.queue.length) return null;
  return <section className="queue-panel" aria-label="排队消息"><ol className="queue-list">{state.queue.map((item, index) => <QueueRow key={item.id} item={item} index={index} length={state.queue.length} runId={state.activeRunId} />)}</ol></section>;
}
