import { memo } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { renderBudget } from "./render-budget";
import { usePreview } from "./PreviewContext";
import "katex/dist/katex.min.css";

const remarkPlugins = [remarkGfm, remarkMath, renderBudget];
const rehypePlugins: import("react-markdown").Options["rehypePlugins"] = [[rehypeKatex, { trust: false, strict: "ignore", maxExpand: 100, maxSize: 20 }]];
export const RichText = memo(function RichText({ text, streaming = false }: { text: string; streaming?: boolean }) {
  const preview = usePreview();
  if (streaming) return <pre className="streaming-message">{text}</pre>;
  return <Markdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} urlTransform={(url) => url} components={{
    a({ href = "", children }) {
      const external = /^(https?:|mailto:)/i.test(href);
      return external ? <a href={href} target="_blank" rel="noreferrer">{children}</a>
        : <button className="content-link" onClick={() => preview?.({ kind: "file", path: href })}>{children}</button>;
    },
    img({ src, alt = "图片" }) { return typeof src === "string" ? <button className="content-link" onClick={() => preview?.({ kind: "file", path: src, image: true })}>查看图片 · {alt}</button> : null; },
    code({ className, children }) {
      const source = String(children).replace(/\n$/, "");
      return className === "language-mermaid" ? <span><button onClick={() => preview?.({ kind: "diagram", source })}>查看流程图</button><code>{source}</code></span>
        : <code className={className}>{children}</code>;
    },
  }}>{text}</Markdown>;
});
