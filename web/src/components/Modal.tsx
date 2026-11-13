import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import "./Modal.css";

export function Modal({ title, kicker, children, onClose, required = false, className = "", bare = false, header }: { title: string; kicker?: string; children: ReactNode; onClose(): void; required?: boolean; className?: string; bare?: boolean; header?: (titleId: string, close: () => void) => ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null), titleId = useId();
  useEffect(() => {
    dialog.current?.showModal();
    // React's autoFocus runs before showModal; restore the original form focus
    // after the dialog enters the top layer.
    dialog.current?.querySelector<HTMLElement>("form input:not([readonly]):not([type=hidden]):not(:disabled), form textarea, .search-input-wrap input")?.focus();
  }, []);
  const close = () => dialog.current?.close();
  return createPortal(<dialog ref={dialog} className={`${bare ? "" : "workbench-modal"} ${className || "thread-dialog"}`} aria-labelledby={titleId} data-required={required || undefined}
    onClick={(event) => { if (required || event.target !== event.currentTarget) return; const r = event.currentTarget.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) event.currentTarget.close(); }}
    onCancel={(event) => { if (required) event.preventDefault(); }} onClose={() => { if (!required) onClose(); }}>
    {header ? header(titleId, close) : <div className="dialog-heading"><div>{kicker && <span>{kicker}</span>}<h2 id={titleId}>{title}</h2></div>{!required && <button type="button" className="icon-button" aria-label="关闭" onClick={close}>×</button>}</div>}
    {children}
  </dialog>, document.body);
}
