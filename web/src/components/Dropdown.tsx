import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import "./Dropdown.css";

export function Dropdown({ label, trigger, children, className = "", triggerClassName = "icon-button", panelClassName = "", align = "right", disabled = false }: {
  label: string; trigger: ReactNode; children: ReactNode; className?: string; triggerClassName?: string; panelClassName?: string; align?: "left" | "right"; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null), button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => { const close = () => setOpen(false); document.addEventListener("lan-dismiss-overlays", close); return () => document.removeEventListener("lan-dismiss-overlays", close); }, []);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); button.current?.focus(); } };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  return <div className={`dropdown ${className}`} ref={root}>
    <button ref={button} type="button" disabled={disabled} className={triggerClassName} aria-label={label} title={label} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)} onKeyDown={(event) => { if (["ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); setOpen(true); requestAnimationFrame(() => { const choices = panel.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"); (event.key === "ArrowUp" ? choices?.[choices.length - 1] : choices?.[0])?.focus(); }); } }}>{trigger}</button>
    {open && <div ref={panel} id={id} className={`topbar-menu ${panelClassName} align-${align}`} onKeyDown={(event) => { if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return; const choices = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")]; if (!choices.length) return; event.preventDefault(); const current = choices.indexOf(document.activeElement as HTMLButtonElement); choices[event.key === "Home" ? 0 : event.key === "End" ? choices.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + choices.length) % choices.length]?.focus(); }} onClick={(event) => {
      if ((event.target as HTMLElement).closest("button")) setOpen(false);
    }}>{children}</div>}
  </div>;
}
