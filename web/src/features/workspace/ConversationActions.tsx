import { useState } from "react";
import { Modal } from "../../components/Modal";
import { MutationForm } from "../../components/MutationForm";
import { useActions } from "../../app/ActionContext";
import type { WorkspaceController } from "../../app/controllers/WorkspaceController";
import { copyText } from "../../platform/android";

export function ConversationActions({ controller, title }: { controller: WorkspaceController; title: string }) {
  const actions = useActions();
  const [renaming, setRenaming] = useState(false), [name, setName] = useState(title), [pending, setPending] = useState(false), [error, setError] = useState("");
  if (!actions) return null;
  const fork = async () => {
    if (!controller.client.fork || pending) return;
    const selection = actions.selection; setPending(true); setError("");
    try {
      const result = await controller.client.fork(selection, new AbortController().signal);
      if (controller.snapshot().selection === selection) controller.add(result);
    } catch (error) { setError(error instanceof Error ? error.message : "分叉失败。"); }
    finally { setPending(false); }
  };
  const remove = async () => {
    if (!window.confirm(`删除“${title}”及其会话记录？`)) return;
    try { await actions.execute({ type: "delete" }); controller.remove(actions.conversationId); }
    catch (error) { setError(error instanceof Error ? error.message : "删除失败。"); }
  };
  const suggest = async () => {
    setPending(true); setError("");
    try { const result = await actions.execute({ type: "suggestName" }); if (result.name) setName(result.name); }
    catch (error) { setError(error instanceof Error ? error.message : "生成标题失败。"); }
    finally { setPending(false); }
  };
  return <details><summary>会话操作</summary><div className="preview-controls">
    <button onClick={() => { setName(title); setRenaming(true); }}>重命名</button>
    {actions.capabilities.fork && <button disabled={pending} onClick={() => void fork()}>分叉会话</button>}
    <button onClick={() => void copyText(actions.conversationId)}>复制会话 ID</button><button onClick={() => void copyText(title)}>复制标题</button>
    <button onClick={() => void remove()}>删除会话</button>
  </div>{error && <p role="alert">{error}</p>}
    {renaming && <Modal title="重命名会话" onClose={() => setRenaming(false)}><MutationForm submit={async () => {
      await actions.execute({ type: "rename", name }); controller.rename(actions.conversationId, name.trim());
    }} onSuccess={() => setRenaming(false)}><label>名称<input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} required /></label>
      <button type="button" disabled={pending} onClick={() => void suggest()}>{pending ? "正在生成…" : "生成建议标题"}</button>
    </MutationForm></Modal>}
  </details>;
}
