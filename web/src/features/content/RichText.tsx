import { isValidElement, memo, useDeferredValue } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { renderBudget } from "./render-budget";
import { usePreview } from "./PreviewContext";
import "katex/dist/katex.min.css";
import "./RichText.css";
import { Diagram } from "./Diagram";
import { localFileTarget, textPreviewKind, fileNameFromPath } from "@lan/content-files.mjs";

const remarkPlugins: import("react-markdown").Options["remarkPlugins"] = [remarkGfm, remarkMath, [renderBudget, { preserveText: true }]];
const rehypePlugins: import("react-markdown").Options["rehypePlugins"] = [[rehypeKatex, { trust: false, strict: "ignore", maxExpand: 100, maxSize: 20 }]];
export const RichText = memo(function RichText({ text, streaming = false, document = false }: { text: string; streaming?: boolean; document?: boolean }) {
  const preview = usePreview();
  const deferred = useDeferredValue(streaming ? text : "");
  return <Markdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} urlTransform={(url) => url} components={{
    table({ children }) { return <div className={document ? "markdown-preview-table-wrap" : "markdown-table-wrap"}><table>{children}</table></div>; },
    pre({ children }) { const code = isValidElement<{ className?: string; children?: unknown }>(children) ? children : null; if (code?.props.className === "language-mermaid") return <Diagram source={String(code.props.children || "").replace(/\n$/, "")} />; const language = code?.props.className?.replace(/^language-/, ""); return <figure className="markdown-code-block">{language && <figcaption>{language}</figcaption>}<pre>{children}</pre></figure>; },
    a({ href = "", children }) {
      const external = /^(https?:|mailto:)/i.test(href);
      const path = localFileTarget(href);
      return external ? <a href={href} target="_blank" rel="noreferrer">{children}</a> : href.startsWith("#") ? <a href={href}>{children}</a>
        : path && textPreviewKind(fileNameFromPath(path)) ? <button className="content-link" onClick={() => preview?.({ kind: "file", path })}>{children}</button> : <span title={path || undefined}>{children}</span>;
    },
    img({ src, alt = "图片" }) { const path = typeof src === "string" ? localFileTarget(src) : null; return path ? <button className="content-link" onClick={() => preview?.({ kind: "file", path, image: true })}>查看图片 · {alt}</button> : <span className="markdown-image-reference">图片 · {alt}</span>; },
    code({ className, children }) {
      const source = String(children).replace(/\n$/, "");
      return <code className={className}>{source}</code>;
    },
  }}>{streaming ? deferred : text}</Markdown>;
});
