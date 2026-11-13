import { useContext, useEffect, useState } from "react";
import { ReadContext } from "../../transport/ReadContext";
import { copyText, shareText } from "../../platform/android";
import { ConversationTitleContext } from "../../app/ConversationTitleContext";

export function ResourceActions({ detailId, text: suppliedText, message = false, title: suppliedTitle, print = true, copyOnly = false }: { detailId?: string; text?: string; message?: boolean; title?: string; print?: boolean; copyOnly?: boolean }) {
  const read = useContext(ReadContext), [pending, setPending] = useState(false), [error, setError] = useState(""), [copied, setCopied] = useState(false);
  const conversationTitle = useContext(ConversationTitleContext), title = suppliedTitle || conversationTitle;
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(timer);
  }, [copied]);
  const run = async (action: "copy" | "share" | "print") => {
    if (pending) return;
    setPending(true); setError("");
    try {
      let text = suppliedText || "";
      if (detailId && read) {
        let after: string | null = null; const parts: string[] = [], seen = new Set<string>();
        do {
          const page = await read.client.details(read.selection, detailId, after, new AbortController().signal, { raw: true });
          parts.push(page.text); after = page.nextCursor;
          if (after) { if (seen.has(after)) throw new Error("输出分页位置重复，请重试。"); seen.add(after); }
        } while (after);
        text = parts.join("");
      }
      if (action === "copy") { await copyText(text); setCopied(true); }
      else if (action === "share") {
        if (window.CodexAndroid) {
          const { markdownDocument } = await import("../content/document");
          window.CodexAndroid.shareDocument(title, text, markdownDocument(title, text));
        } else {
          await shareText(title, text);
          if (typeof navigator.share !== "function") setCopied(true);
        }
      } else {
        const { markdownDocument } = await import("../content/document");
        const html = markdownDocument(title, text);
        if (window.CodexAndroid) window.CodexAndroid.printMarkdown(title, html);
        else {
          const frame = document.createElement("iframe"); frame.hidden = true; frame.srcdoc = html;
          frame.onload = () => { frame.contentWindow?.focus(); frame.contentWindow?.print(); };
          document.body.append(frame); setTimeout(() => frame.remove(), 60_000);
        }
      }
    } catch (error) { setError(error instanceof Error ? error.message : "读取内容失败。"); }
    finally { setPending(false); }
  };
  const copyButton = <button type="button" className={message || copyOnly ? `copy-text-button icon-copy-button ${copyOnly ? "turn-footer-copy" : ""} ${copied ? "copied" : ""}` : `quiet-button preview-text-action ${copied ? "copied" : ""}`} aria-label={copied ? "已复制" : copyOnly ? "复制本轮全部内容的 Markdown 原文" : message ? "复制最终回答的 Markdown 原文" : "复制内容"} title={copied ? "已复制" : copyOnly ? "复制本轮全部内容" : message ? "复制原文" : "复制"} disabled={pending} onClick={() => void run("copy")}>{copied ? "已复制" : copyOnly ? "复制全部" : message ? "复制原文" : "复制"}</button>;
  const shareButton = !copyOnly && <button type="button" className={message ? "message-action-button mobile-message-action" : "quiet-button preview-text-action"} aria-label="分享到其他应用" title="分享到其他应用" disabled={pending} onClick={() => void run("share")}>分享</button>;
  const printButton = print && !copyOnly && <button type="button" className={message ? "message-action-button mobile-message-action" : "quiet-button"} aria-label="将回答转为 PDF" title="将回答转为 PDF" disabled={pending} onClick={() => void run("print")}>PDF</button>;
  return <div className={copyOnly ? "turn-footer-copy-actions" : message ? "message-actions" : "preview-controls"}>
    {message ? <>{printButton}{shareButton}{copyButton}</> : <>{copyButton}{shareButton}{printButton}</>}
    {error && <span role="alert">{error}</span>}
  </div>;
}
