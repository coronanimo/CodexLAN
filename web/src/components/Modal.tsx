import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";

export function Modal({ title, children, onClose, required = false }: { title: string; children: ReactNode; onClose(): void; required?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null), titleId = useId();
  useEffect(() => { dialog.current?.showModal(); }, []);
  return createPortal(<dialog ref={dialog} className="workbench-modal" aria-labelledby={titleId} data-required={required || undefined}
    onCancel={(event) => { if (required) event.preventDefault(); }} onClose={() => { if (!required) onClose(); }}>
    <div className="modal-heading"><h2 id={titleId}>{title}</h2>{!required && <button aria-label="关闭" onClick={() => dialog.current?.close()}>关闭</button>}</div>
    {children}
  </dialog>, document.body);
}
