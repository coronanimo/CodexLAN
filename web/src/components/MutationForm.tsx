import { useState } from "react";
import type { FormEvent, ReactNode } from "react";

export function MutationForm<T>({ children, label = "保存", submit, onSuccess, onCancel, secondaryAction, message = "", disabled = false }: { children: ReactNode; label?: string; onCancel?(): void; secondaryAction?: ReactNode; message?: string; disabled?: boolean;
  submit(values: Record<string, string>, data: FormData): Promise<T>; onSuccess?(result: T): void }) {
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  const handle = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (pending) return;
    const data = new FormData(event.currentTarget); setPending(true); setError("");
    try { const result = await submit(Object.fromEntries([...data].map(([key, value]) => [key, String(value)])), data); onSuccess?.(result); }
    catch (error) { setError(error instanceof Error ? error.message : "操作失败。"); }
    finally { setPending(false); }
  };
  return <form onSubmit={(event) => void handle(event)}>{children}<p className="form-error" role={error ? "alert" : undefined}>{error || message}</p><div className="dialog-actions">{secondaryAction || <span />}<span />{onCancel ? <button type="button" className="quiet-button" disabled={pending} onClick={onCancel}>取消</button> : <span />}<button className="primary-button" disabled={pending || disabled}>{pending ? "正在保存…" : label}</button></div></form>;
}
