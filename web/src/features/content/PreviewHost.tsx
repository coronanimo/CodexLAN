import { useContext, useEffect, useMemo, useState } from "react";
import { Virtuoso } from "react-virtuoso";
import { Modal } from "../../components/Modal";
import type { Preview } from "./PreviewContext";
import type { ConversationSelection } from "@lan/read-api";
import { fileNameFromPath, textPreviewKind } from "@lan/content-files.mjs";
import { ReadContext } from "../../transport/ReadContext";
import { fileUrl, imageUrl, previewContent, downloadFile, visualizationUrl } from "../../transport/file-client";
import { useFileAccess } from "./FileAccessContext";
import { RichText } from "./RichText";
import { ResourceActions } from "../details/ResourceActions";
import "./PreviewHost.css";
import { uiId } from "../../platform/ui-id";
import { mermaidOptions } from "./mermaid-options";
export function PreviewHost({ preview, selection, onClose }: { preview: Preview; selection: ConversationSelection; onClose(): void }) {
  const [html, setHtml] = useState(""), [text, setText] = useState(""), [error, setError] = useState(""), [loaded, setLoaded] = useState(false), [image, setImage] = useState("");
  const [frameUrl, setFrameUrl] = useState("");
  const [localUrl, setLocalUrl] = useState("");
  const access = useFileAccess(), read = useContext(ReadContext);
  const attachment = preview.kind === "attachment" ? preview.file : null;
  const path = attachment ? attachment.name : "path" in preview ? preview.path : "", title = "title" in preview ? preview.title : path ? fileNameFromPath(path) : "Mermaid 图表";
  const imagePreview = attachment ? attachment.type.startsWith("image/") || !attachment.type && /\.(?:png|jpe?g|gif|webp|avif|bmp|ico)$/i.test(attachment.name) : preview.kind === "file" && preview.image;
  const fileKind = textPreviewKind(path) || (attachment?.type.startsWith("text/") ? "text" : null);
  const prefix = preview.kind === "visualization" ? "visualization" : preview.kind === "diagram" ? "mermaid-preview" : imagePreview ? "image-preview" : "markdown-preview";
  useEffect(() => {
    let active = true, objectUrl = ""; const abort = new AbortController();
    const load = async () => {
      if (preview.kind === "attachment") {
        objectUrl = URL.createObjectURL(preview.file); setLocalUrl(objectUrl);
        if (imagePreview) setImage(objectUrl);
        else if (fileKind) {
          if (preview.file.size > 200_000) throw new Error("预览最多 200 KB，请下载原文件。");
          const content = await preview.file.text();
          if (active) setText(content);
        } else throw new Error("该文件类型暂不支持预览，可以下载原文件。");
      } else if (preview.kind === "diagram") {
        if (preview.svg) { setHtml(preview.svg); return; }
        const { default: mermaid } = await import("mermaid");
        if (!active) return;
        mermaid.initialize(mermaidOptions);
        const rendered = await mermaid.render(`diagram-${uiId()}`, preview.source);
        if (active) setHtml(rendered.svg);
      } else if (preview.kind === "visualization") {
        // A separate document uses its own CSP. srcDoc would inherit the
        // workbench's script policy and disable the original interactions.
        setFrameUrl(visualizationUrl(selection, preview.path));
      } else if (preview.kind === "diff") {
        if (!read) throw new Error("会话读取已结束，请重新打开文件变更。");
        let cursor: string | null = null; const parts: string[] = [], seen = new Set<string>();
        do {
          const page = await read.client.details(selection, preview.detailId, cursor, abort.signal);
          if (!active) return;
          parts.push(page.text); cursor = page.nextCursor;
          if (cursor) { if (seen.has(cursor)) throw new Error("差异输出分页位置重复，请重试。"); seen.add(cursor); }
        } while (cursor);
        if (active) setText(parts.join(""));
      } else if (preview.image) {
        const url = await imageUrl(selection, preview.path, abort.signal, access); if (active) setImage(url);
      } else {
        const content = await previewContent(selection, preview.path, abort.signal, access);
        if (active) setText(content.text);
      }
    };
    void load().then(() => { if (active && preview.kind !== "visualization") setLoaded(true); }).catch((error: Error) => { if (active && !abort.signal.aborted) setError(error.message); });
    return () => { active = false; abort.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [preview, selection, access, read]);
  const lines = useMemo(() => preview.kind === "diff" ? text.replace(/\r\n?/g, "\n").split("\n") : [], [preview.kind, text]);
  const diffPaths = useMemo(() => lines.flatMap((line) => /^diff --git a\/(.+) b\/(.+)$/.exec(line)?.[2] || []), [lines]);
  const displayTitle = preview.kind === "diff" && diffPaths.length ? `${diffPaths.length} 个文件的修改` : title;
  const displayPath = preview.kind === "diff" ? diffPaths.join(" · ") : path;
  const kicker = preview.kind === "diff" ? "Diff 预览" : preview.kind === "diagram" ? "Mermaid" : preview.kind === "visualization" ? "交互图表" : imagePreview ? "图片预览" : fileKind === "markdown" ? "Markdown 预览" : fileKind === "json" ? "JSON 预览" : fileKind === "code" ? "代码预览" : "文本预览";
  const source = preview.kind === "diagram" ? preview.source : text;
  return <Modal bare title={displayTitle} className={`${prefix}-dialog preview-dialog ${preview.kind === "visualization" && preview.mode === "wide" ? "wide" : ""}`} onClose={onClose}
    header={(titleId, close) => <header className={`${prefix}-header`}>{preview.kind === "visualization" ? <div className="visualization-heading"><span aria-hidden="true">◈</span><div className="visualization-heading-copy"><h2 id={titleId}>{title}</h2><a className="visualization-url" href={visualizationUrl(selection, path)} target="_blank" rel="noreferrer">{location.origin + visualizationUrl(selection, path)}</a></div></div> : <div className={`${prefix}-heading`}><span>{kicker}</span><h2 id={titleId}>{displayTitle}</h2>{displayPath && <code title={displayPath}>{displayPath}</code>}</div>}<div className={`${prefix}-actions`}>
      {loaded && source && preview.kind !== "diagram" && <ResourceActions text={source} title={title} print={false} />}
      {preview.kind === "file" && <button className="quiet-button" onClick={() => void downloadFile(fileUrl(selection, path, access)).catch((error: Error) => setError(error.message))}>下载 ↓</button>}
      {preview.kind === "attachment" && localUrl && <a className="quiet-button" href={localUrl} download={preview.file.name}>下载 ↓</a>}
      <button className="icon-button" aria-label="关闭预览" onClick={close}>×</button>
    </div></header>}>
    <div className={prefix === "markdown-preview" ? "markdown-preview-scroll" : `${prefix}-stage`}>
      {error ? <p className="markdown-preview-status error" role="alert">{error}</p> : !loaded ? <p className="markdown-preview-status" role="status">正在载入…</p> : null}
      {image && <img src={image} alt={title} onError={() => setError("图片无法预览，可以下载原文件。")} />}
      {frameUrl && <iframe className="visualization-frame" sandbox="allow-scripts" title={title} src={frameUrl} onLoad={() => setLoaded(true)} />}
      {html && <iframe className="diagram-preview-document" sandbox="" title={title} srcDoc={`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline';"><style>body{margin:0;overflow:auto}svg{display:block;min-width:1200px;width:100%;height:auto}</style>${html}`} />}
      {loaded && (preview.kind === "file" || preview.kind === "attachment") && !imagePreview && (fileKind === "markdown" ? <article className="markdown-document"><RichText text={text} document /></article> : <div className={`source-document ${fileKind === "text" ? "wrap" : ""}`}><pre><code>{fileKind === "json" ? formatJson(text) : text}</code></pre></div>)}
      {loaded && preview.kind === "diff" && <div className="diff-document"><Virtuoso style={{ height: "100%" }} totalCount={lines.length} itemContent={(index) => { const line = lines[index]!, path = /^diff --git a\/(.+) b\/(.+)$/.exec(line)?.[2]; return path ? <div className="diff-path">{path}</div> : <div className={`diff-line ${/^@@/.test(line) ? "hunk" : /^(diff |index |---|\+\+\+)/.test(line) ? "header" : /^\+/.test(line) ? "added" : /^-/.test(line) ? "removed" : ""}`}>{line || " "}</div>; }} /></div>}
    </div>
  </Modal>;
}
function formatJson(text: string) { try { return JSON.stringify(JSON.parse(text), null, 2); } catch { return text; } }
