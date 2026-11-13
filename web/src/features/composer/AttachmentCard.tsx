import { useEffect, useState } from "react";
import type { Attachment } from "../../app/controllers/Attachments";
import { usePreview } from "../content/PreviewContext";

export function AttachmentCard({ item, pending, onRemove }: { item: Attachment; pending: boolean; onRemove(): void }) {
  const preview = usePreview();
  const [thumbnail, setThumbnail] = useState("");
  useEffect(() => {
    if (!item.file.type.startsWith("image/")) return;
    const url = URL.createObjectURL(item.file); setThumbnail(url);
    return () => URL.revokeObjectURL(url);
  }, [item.file]);
  return <div className="composer-attachment">
    <button type="button" className="composer-attachment-preview" aria-label={`预览 ${item.file.name}`} onClick={() => preview?.({ kind: "attachment", id: item.id, file: item.file })}>
    {thumbnail ? <img src={thumbnail} alt="" /> : <span className="composer-attachment-file">{item.file.name.split(".").at(-1)?.toUpperCase().slice(0, 5) || "FILE"}</span>}
    <span title={item.file.name}>{item.file.name}<small>{item.error || (item.uploaded ? "已上传" : item.progress ? `${Math.round(item.progress * 100)}%` : `${Math.ceil(item.file.size / 1024)} KB`)}</small></span>
    </button>
    <button type="button" className="icon-button" disabled={pending} aria-label={`移除 ${item.file.name}`} onClick={onRemove}>×</button>
  </div>;
}

export function clipboardImage(file: File, timestamp: number, index: number) {
  const extensions: Record<string, string> = { "image/avif": "avif", "image/gif": "gif", "image/heic": "heic", "image/heif": "heif", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
  const instant = new Date(timestamp), date = instant.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  return new File([file], `clipboard-${date}-${String(instant.getUTCMilliseconds()).padStart(3, "0")}${index ? `-${index + 1}` : ""}.${extensions[file.type] || "image"}`, { type: file.type, lastModified: timestamp });
}
