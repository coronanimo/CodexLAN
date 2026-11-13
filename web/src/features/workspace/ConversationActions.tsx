import { useRef, useState } from "react";
import { Modal } from "../../components/Modal";
import { MutationForm } from "../../components/MutationForm";
import { useActions } from "../../app/ActionContext";
import type { WorkspaceController } from "../../app/controllers/WorkspaceController";
import { copyText } from "../../platform/android";
import { Dropdown } from "../../components/Dropdown";
import { useAppSelector } from "../../app/hooks";
import { useConfirmation } from "../../components/useConfirmation";
import { ActionButton } from "../controls/ActionButton";

export function ConversationActions({ controller, title }: { controller: WorkspaceController; title: string }) {
  const actions = useActions();
  const controls = useAppSelector((state) => actions ? state.controls[actions.conversationId] : undefined);
  const confirmation = useConfirmation();
  const active = !!controls?.activeRunId || controls?.status === "running", goalActive = controls?.goal?.status === "active";
  const [renaming, setRenaming] = useState(false), [name, setName] = useState(title), [pending, setPending] = useState(false), [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
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
    if (!await confirmation.confirm({ kicker: "删除聊天记录", title, message: `这会永久删除该聊天及其 ${actions.providerName || "代理"} 历史记录，项目目录和项目文件不会被删除。`, confirmLabel: "永久删除" })) return;
    try { await actions.execute({ type: "delete" }); controller.remove(actions.conversationId); }
    catch (error) { setError(error instanceof Error ? error.message : "删除失败。"); }
  };
  const suggest = async () => {
    if (actions.localDraft) { setError("先发送一条消息，才能自动生成聊天名称。"); return; }
    setPending(true); setError("");
    try { const result = await actions.execute({ type: "suggestName" }); if (result.name) { setName(result.name); setError("名称已生成，确认后保存。"); input.current?.focus(); input.current?.select(); } }
    catch (error) { setError(error instanceof Error ? error.message : "生成标题失败。"); }
    finally { setPending(false); }
  };
  return <><Dropdown label="聊天操作" trigger={<span className="more-dots" aria-hidden="true" />}>
    <button className="quiet-button" onClick={() => { setName(title); setError(""); setRenaming(true); }}>修改聊天名称</button>
    {actions.capabilities.fork && <button className="quiet-button" disabled={pending || active || actions.localDraft} onClick={() => void fork()}>分叉聊天</button>}
    {actions.capabilities.compact && <ActionButton command={{ type: "compact" }} disabled={active || goalActive || actions.localDraft}>压缩上下文</ActionButton>}
    <button className="danger-button" disabled={active || goalActive || pending} onClick={() => void remove()}>删除聊天记录</button>
    <button className="quiet-button" onClick={() => void copyText(actions.conversationId)}>复制对话 ID</button><button className="quiet-button" onClick={() => void copyText(title)}>复制对话标题</button>
  </Dropdown>{error && !renaming && <p role="alert">{error}</p>}
    {renaming && <Modal kicker="聊天记录" title="修改聊天名称" onClose={() => setRenaming(false)}><MutationForm label="保存名称" onCancel={() => setRenaming(false)} message={error} disabled={pending} secondaryAction={<button className="quiet-button" type="button" disabled={pending} onClick={() => void suggest()}>{pending ? "正在生成…" : "自动生成"}</button>} submit={async () => {
      await actions.execute({ type: "rename", name }); controller.rename(actions.conversationId, name.trim());
    }} onSuccess={() => { setRenaming(false); setError(""); }}><label>聊天名称<input ref={input} autoFocus onFocus={(event) => event.currentTarget.select()} value={name} onChange={(event) => setName(event.target.value)} maxLength={100} required /></label>
    </MutationForm></Modal>}
    {confirmation.dialog}
  </>;
}
