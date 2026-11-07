import { useState } from "react";
import type { FormEvent, ReactNode } from "react";

export function MutationForm({ children, label = "保存", submit, onSuccess }: { children: ReactNode; label?: string;
  submit(values: Record<string, string>, data: FormData): Promise<unknown>; onSuccess?(): void }) {
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  const handle = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (pending) return;
    const data = new FormData(event.currentTarget); setPending(true); setError("");
    try { await submit(Object.fromEntries([...data].map(([key, value]) => [key, String(value)])), data); onSuccess?.(); }
    catch (error) { setError(error instanceof Error ? error.message : "操作失败。"); }
    finally { setPending(false); }
  };
  return <form onSubmit={(event) => void handle(event)}>{children}{error && <p role="alert">{error}</p>}<button disabled={pending}>{pending ? "正在保存…" : label}</button></form>;
}
