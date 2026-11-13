import { useContext, useState } from "react";
import type { FileReference, VisualizationReference } from "@lan/presentation";
import { fileNameFromPath, textPreviewKind } from "@lan/content-files.mjs";
import { usePreview } from "./PreviewContext";
import { useFileAccess } from "./FileAccessContext";
import { ReadContext } from "../../transport/ReadContext";
import { downloadFile, fileUrl } from "../../transport/file-client";
import "./FileCards.css";

export function FileCards({ files = [], visualizations = [] }: { files?: FileReference[]; visualizations?: VisualizationReference[] }) {
  const preview = usePreview(), read = useContext(ReadContext), access = useFileAccess();
  const [error, setError] = useState("");
  const download = (file: FileReference) => { if (read) void downloadFile(fileUrl(read.selection, file.path, access)).catch((error: Error) => setError(error.message)); };
  return <>
    {!!visualizations.length && <div className="message-visualizations">{visualizations.map((visualization) => <button type="button" className="visualization-card" key={visualization.path} onClick={() => preview?.({ kind: "visualization", ...visualization })}>
      <span className="visualization-mark" aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M7 24V14m9 10V9m9 15V5M6 9l8-5 7 4 5-5M23 3h4v4" /></svg></span><span className="visualization-card-copy"><strong>{visualization.title}</strong><small>可缩放、可悬停查看数据</small></span><span className="visualization-card-action">打开 ↗</span>
    </button>)}</div>}
    {files.some((file) => file.image) && <div className="message-images">{files.filter((file) => file.image).map((file) => <ImageThumbnail key={file.path} file={file} />)}</div>}
    {files.some((file) => !file.image) && <div className="message-files">{files.filter((file) => !file.image).map((file) => {
      const name = file.name || fileNameFromPath(file.path), canPreview = file.image || !!textPreviewKind(name);
      return <div className={canPreview ? "markdown-file-card" : ""} key={file.path}>
        <button type="button" className="file-download file-preview-trigger" onClick={() => canPreview ? preview?.({ kind: "file", path: file.path, image: file.image }) : download(file)}>
          <span className="file-extension">{name.split(".").at(-1)?.toUpperCase().slice(0, 6) || "FILE"}</span>
          <span className="file-copy"><strong>{file.label || name}</strong><small title={file.path}>{name}</small></span>{(!canPreview || file.image) && <span className="file-action">{canPreview ? "预览" : "下载"}</span>}
        </button>
        {canPreview && <button type="button" className="file-download-direct" aria-label={`下载 ${name}`} title="下载原文件" onClick={() => download(file)}>↓</button>}
      </div>;
    })}</div>}
    {error && <p className="file-download-status error" role="alert">{error}</p>}
  </>;
}

function ImageThumbnail({ file }: { file: FileReference }) {
  const preview = usePreview(), read = useContext(ReadContext), access = useFileAccess();
  const [failed, setFailed] = useState(false);
  const name = file.label || file.name || fileNameFromPath(file.path);
  return <button type="button" className="message-image" aria-label={`预览 ${name}`} title={name} onClick={() => preview?.({ kind: "file", path: file.path, image: true })}>
    {read && !failed ? <img src={fileUrl(read.selection, file.path, access)} alt={name} loading="lazy" decoding="async" onError={() => setFailed(true)} /> : <span className="message-image-fallback">图片无法载入，点击重试预览</span>}
  </button>;
}
