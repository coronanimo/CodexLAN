import { useEffect, useState } from "react";
import { Modal } from "../../components/Modal";
import type { Preview } from "./PreviewContext";
import type { ConversationSelection } from "@lan/read-api";
import { copyText } from "../../platform/android";
import { fileUrl, imageUrl, previewContent, downloadFile } from "../../transport/file-client";
export function PreviewHost({ preview, selection, onClose }: { preview: Preview; selection: ConversationSelection; onClose(): void }) {
  const [html, setHtml] = useState(""), [text, setText] = useState(""), [error, setError] = useState("");
  const [image, setImage] = useState("");
  useEffect(() => {
    let active = true; const abort = new AbortController();
    const load = async () => {
      if (preview.kind === "diagram") {
        if (preview.source.length > 4000) throw new Error("图表超过预览上限，可以复制源码在图表工具中打开。");
        const { default: mermaid } = await import("mermaid");
        if (!active) return;
        mermaid.initialize({ startOnLoad: false, securityLevel: "strict", suppressErrorRendering: true, maxTextSize: 4000, maxEdges: 200 });
        const rendered = await mermaid.render(`diagram-${crypto.randomUUID()}`, preview.source);
        if (active) setHtml(rendered.svg);
      } else if (preview.image) {
        const url = await imageUrl(selection, preview.path, abort.signal); if (active) setImage(url);
      } else {
        const content = await previewContent(selection, preview.path, abort.signal);
        if (active) { if (content.html) setHtml(content.text); else setText(content.text); }
      }
    };
    void load().catch((error: Error) => { if (active && !abort.signal.aborted) setError(error.message); });
    return () => { active = false; abort.abort(); };
  }, [preview, selection]);
  const source = preview.kind === "diagram" ? preview.source : text;
  return <Modal title={preview.kind === "diagram" ? "流程图" : "文件预览"} onClose={onClose}>
    {error && <p role="alert">{error}</p>}
    {preview.kind === "file" && <button onClick={() => void downloadFile(fileUrl(selection, preview.path)).catch((error: Error) => setError(error.message))}>下载原文件</button>}
    {source && <button onClick={() => void copyText(source)}>复制内容</button>}
    {image && <img className="image-preview" src={image} alt="文件预览" onError={() => setError("图片无法预览，可以下载原文件。")} />}
    {html && <iframe className="document-preview" sandbox="" title="隔离预览" srcDoc={`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline';"><style>body{font:16px system-ui;overflow-wrap:anywhere}svg{max-width:100%;height:auto}</style>${html}`} />}
    {text && <pre className="file-preview">{text}</pre>}
  </Modal>;
}
