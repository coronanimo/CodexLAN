import { useContext, useState } from "react";
import { ReadContext } from "../../transport/ReadContext";
import { copyText, shareText } from "../../platform/android";

export function ResourceActions({ detailId }: { detailId: string }) {
  const read = useContext(ReadContext), [pending, setPending] = useState(false), [error, setError] = useState("");
  if (!read) return null;
  const run = async (action: "copy" | "share" | "print") => {
    if (pending) return;
    setPending(true); setError("");
    try {
      let after: string | null = null, text = "";
      do {
        const page = await read.client.details(read.selection, detailId, after, new AbortController().signal);
        if (text.length + page.text.length > 256_000) throw new Error("内容较长，请使用下载完整 Markdown。");
        text += page.text; after = page.nextCursor;
      } while (after);
      if (action === "copy") await copyText(text);
      else if (action === "share") {
        if (window.CodexAndroid) {
          const { markdownDocument } = await import("../content/document");
          window.CodexAndroid.shareDocument("会话记录", text, markdownDocument("会话记录", text));
        } else await shareText("会话记录", text);
      }
      else {
        const { markdownDocument } = await import("../content/document");
        const html = markdownDocument("会话记录", text);
        if (window.CodexAndroid) window.CodexAndroid.printMarkdown("会话记录", html);
        else {
          const frame = document.createElement("iframe"); frame.hidden = true; frame.srcdoc = html;
          frame.onload = () => { frame.contentWindow?.focus(); frame.contentWindow?.print(); };
          document.body.append(frame); setTimeout(() => frame.remove(), 60_000);
        }
      }
    } catch (error) { setError(error instanceof Error ? error.message : "读取内容失败。"); }
    finally { setPending(false); }
  };
  return <div className="preview-controls"><button disabled={pending} onClick={() => void run("copy")}>复制</button><button disabled={pending} onClick={() => void run("share")}>分享</button><button disabled={pending} onClick={() => void run("print")}>打印 / PDF</button>{error && <span role="alert">{error}</span>}</div>;
}
