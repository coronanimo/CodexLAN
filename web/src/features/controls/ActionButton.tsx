import { useState } from "react";
import type { ReactNode } from "react";
import type { ConversationCommand } from "@lan/commands";
import { useActions } from "../../app/ActionContext";
export function ActionButton({ command, children, disabled = false, label, className = "quiet-button" }: { command: ConversationCommand; children: ReactNode; disabled?: boolean; label?: string; className?: string }) {
  const actions = useActions();
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  return <><button type="button" className={className} aria-label={label} title={label} disabled={!actions || disabled || pending} onClick={async () => {
    if (!actions || pending) return;
    setPending(true); setError("");
    try { await actions.execute(command); } catch (error) { setError(error instanceof Error ? error.message : "操作失败。"); } finally { setPending(false); }
  }}>{pending ? "…" : children}</button>{error && <span role="alert">{error}</span>}</>;
}
