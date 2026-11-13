import { useContext, useEffect, useRef, useState } from "react";
import { ReadContext } from "../../transport/ReadContext";
import { RichText } from "../content/RichText";
import { FileCards } from "../content/FileCards";
import type { FileReference, VisualizationReference } from "@lan/presentation";
import type { DetailPage } from "@lan/read-api";
import type { ReactNode } from "react";

export function MessageContent({ text, detailId, truncated, streaming, revision, rich, files, visualizations, renderText }: { text: string; detailId?: string; truncated?: boolean; streaming?: boolean; revision?: number; rich: boolean; files?: FileReference[]; visualizations?: VisualizationReference[]; renderText?(text: string): ReactNode }) {
  const source = useContext(ReadContext), key = JSON.stringify([source?.selection, detailId]);
  const [complete, setComplete] = useState<string | null>(() => source?.details?.get(key)?.fullText ?? null), [error, setError] = useState("");
  const [references, setReferences] = useState<Pick<DetailPage, "files" | "visualizations"> | undefined>(() => source?.details?.get(key)?.references);
  const lastRead = useRef(0);
  useEffect(() => {
    if (!truncated || !detailId || !source) { if (complete !== null) setComplete(null); return; }
    const cached = source.details?.get(key);
    if (!streaming && cached?.fullText !== undefined && cached.contentRevision === revision) return;
    const abort = new AbortController();
    const timer = setTimeout(() => {
      lastRead.current = Date.now();
      void (async () => {
        let cursor: string | null = null; const parts: string[] = [], seen = new Set<string>();
        let references: Pick<DetailPage, "files" | "visualizations"> | undefined;
        do {
          const page = await source.client.details(source.selection, detailId, cursor, abort.signal);
          if (abort.signal.aborted) return;
          parts.push(page.text); cursor = page.nextCursor;
          if (page.files || page.visualizations) references = { files: page.files, visualizations: page.visualizations };
          if (cursor) { if (seen.has(cursor)) throw new Error("输出位置重复，请重试。"); seen.add(cursor); }
        } while (cursor);
        const value = parts.join(""); setComplete(value); setReferences(references); setError("");
        if (!streaming && value.length <= 256_000 && source.details) {
          source.details.delete(key); source.details.set(key, { open: false, page: null, cursor: null, ...cached, fullText: value, contentRevision: revision, references });
          if (source.details.size > 32) source.details.delete(source.details.keys().next().value!);
        }
      })().catch((error: Error) => { if (!abort.signal.aborted) setError(error.message); });
    }, streaming ? Math.max(0, 500 - (Date.now() - lastRead.current)) : 0);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [source, detailId, truncated, streaming, revision]);
  const value = complete ?? text;
  return <>{renderText ? renderText(value) : rich ? <RichText text={value} streaming={streaming} /> : value}<FileCards files={complete !== null && references?.files ? references.files : files} visualizations={complete !== null && references?.visualizations ? references.visualizations : visualizations} />{error && <p role="alert">完整消息读取失败：{error}</p>}</>;
}
