import { useEffect, useRef, useState } from "react";
import { usePreview } from "./PreviewContext";
import "./Diagram.css";
import { uiId } from "../../platform/ui-id";
import { mermaidOptions } from "./mermaid-options";

// Virtual rows mount only near the viewport. A diagram starts when its own
// surface is visible; the resulting document has no script capabilities.
export function Diagram({ source }: { source: string }) {
  const host = useRef<HTMLDivElement>(null), preview = usePreview();
  const [visible, setVisible] = useState(false), [svg, setSvg] = useState(""), [ratio, setRatio] = useState("2 / 1"), [error, setError] = useState("");
  useEffect(() => {
    if (!host.current || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) { setVisible(true); observer.disconnect(); } });
    observer.observe(host.current); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    let active = true;
    void (async () => {
      if (source.length > 4000) throw new Error("流程图较大，请复制源码查看。");
      const { default: mermaid } = await import("mermaid");
      if (!active) return;
      mermaid.initialize(mermaidOptions);
      const rendered = await mermaid.render("diagram-" + uiId(), source);
      if (!active) return;
      const dimensions = new DOMParser().parseFromString(rendered.svg, "image/svg+xml").documentElement.getAttribute("viewBox")?.split(/[ ,]+/).map(Number);
      if (dimensions?.length === 4 && dimensions[2]! > 0 && dimensions[3]! > 0) setRatio(`${dimensions[2]} / ${dimensions[3]}`);
      setSvg(rendered.svg);
    })().catch((error: Error) => { if (active) setError(error.message); });
    return () => { active = false; };
  }, [visible, source]);
  return <div ref={host} className="markdown-mermaid-block"><div className="markdown-mermaid-stage" role="button" tabIndex={0} aria-label="放大流程图" onClick={() => preview?.({ kind: "diagram", source, svg })} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); preview?.({ kind: "diagram", source, svg }); } }}>
    {svg ? <iframe tabIndex={-1} title="流程图" className="diagram-document" style={{ aspectRatio: ratio }} sandbox="" srcDoc={`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'"><style>body{margin:0}svg{display:block;width:100%;height:auto}</style>${svg}`} /> : <pre className={error ? "markdown-mermaid-error" : "markdown-mermaid-source"}>{error || source}</pre>}
  </div></div>;
}
