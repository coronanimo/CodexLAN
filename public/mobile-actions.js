const IMAGE_EXTENSIONS = new Set(["avif", "bmp", "gif", "jpeg", "jpg", "png", "svg", "webp"]);

export function isPreviewableImage(fileName) {
  const name = String(fileName || "").trim().toLowerCase();
  const extension = name.includes(".") ? name.split(".").pop() : "";
  return IMAGE_EXTENSIONS.has(extension);
}

export function printableMarkdownHtml(title, bodyHtml) {
  const safeTitle = escapeHtml(String(title || "CodexLAN 对话").trim() || "CodexLAN 对话");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=794,initial-scale=1"><title>${safeTitle}</title><style>
@page{margin:16mm 14mm}*{box-sizing:border-box}body{margin:0;color:#24364f;background:#fff;font:14px/1.72 sans-serif;overflow-wrap:anywhere}article{max-width:180mm;margin:0 auto}h1,h2,h3,h4,h5,h6{color:#142d4f;line-height:1.3;break-after:avoid}h1{font-size:24px;border-bottom:2px solid #dce7f4;padding-bottom:6px}h2{font-size:20px;border-bottom:1px solid #e3eaf2;padding-bottom:5px}h3{font-size:17px}pre,blockquote,table,img{break-inside:avoid}pre{overflow-wrap:anywhere;white-space:pre-wrap;border:1px solid #d3dfec;border-radius:6px;padding:10px;background:#f6f9fc;font:11px/1.55 monospace}code{font-family:monospace}blockquote{margin:1em 0;border-left:4px solid #8fb1e9;padding:.2em 1em;color:#52677f;background:#f6f9fd}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #d8e2ed;padding:6px;text-align:left;vertical-align:top}th{background:#edf3fb}img{max-width:100%;height:auto}a{color:#1557c0}.message-files,.message-actions{display:none!important}.diff-file{break-inside:avoid;border:1px solid #d5dfeb;margin:0 0 10px}.diff-path{padding:6px 8px;background:#edf3f8;font-weight:700}.diff-lines{font:10px/1.5 monospace}.diff-line{display:block;padding:0 8px;white-space:pre-wrap}.diff-line.added{color:#11633e;background:#e8f6ed}.diff-line.removed{color:#9f2d27;background:#fcebea}.diff-line.hunk{color:#245a9b;background:#eaf2fb}
</style></head><body><article>${String(bodyHtml || "")}</article></body></html>`;
}

export async function shareMarkdown({ title, text, documentHtml, bridge = globalThis.CodexAndroid, navigatorObject = globalThis.navigator } = {}) {
  const shareTitle = String(title || "CodexLAN 对话").trim() || "CodexLAN 对话";
  const shareText = String(text || "");
  if (typeof bridge?.shareDocument === "function") {
    const html = documentHtml || printableMarkdownHtml(shareTitle, `<pre>${escapeHtml(shareText)}</pre>`);
    bridge.shareDocument(shareTitle, shareText, html);
    return "android-choice";
  }
  if (typeof bridge?.shareMarkdownAsPdf === "function") {
    const html = documentHtml || printableMarkdownHtml(shareTitle, `<pre>${escapeHtml(shareText)}</pre>`);
    bridge.shareMarkdownAsPdf(shareTitle, html);
    return "android-pdf";
  }
  if (typeof bridge?.shareText === "function") {
    throw new Error("当前 App 版本不支持 PDF 分享，请安装新版 APK。");
  }
  if (typeof navigatorObject?.share === "function") {
    await navigatorObject.share({ title: shareTitle, text: shareText });
    return "web";
  }
  return null;
}

export function openDownloadExternally(url, bridge = globalThis.CodexAndroid) {
  if (typeof bridge?.openExternalDownload !== "function") return false;
  bridge.openExternalDownload(String(url || ""));
  return true;
}

export async function copyTextToClipboard(text, {
  bridge = globalThis.CodexAndroid,
  navigatorObject = globalThis.navigator,
  documentObject = globalThis.document,
} = {}) {
  const value = String(text ?? "");
  if (typeof bridge?.copyText === "function") {
    bridge.copyText(value);
    return "android";
  }

  let clipboardError;
  if (typeof navigatorObject?.clipboard?.writeText === "function") {
    try {
      await navigatorObject.clipboard.writeText(value);
      return "clipboard-api";
    } catch (error) {
      clipboardError = error;
    }
  }

  if (!documentObject?.body || typeof documentObject.createElement !== "function" || typeof documentObject.execCommand !== "function") {
    throw clipboardError || new Error("浏览器拒绝访问剪贴板");
  }

  const source = documentObject.createElement("textarea");
  source.className = "clipboard-source";
  source.value = value;
  source.readOnly = true;
  const previousFocus = documentObject.activeElement;
  documentObject.body.append(source);
  let copied = false;
  try {
    source.focus({ preventScroll: true });
    source.select();
    source.setSelectionRange(0, source.value.length);
    copied = documentObject.execCommand("copy");
  } finally {
    source.remove();
    previousFocus?.focus?.({ preventScroll: true });
  }
  if (!copied) throw clipboardError || new Error("浏览器拒绝访问剪贴板");
  return "legacy-copy";
}

export function fileChangesText(changes) {
  return (changes || []).map((change) => {
    const path = String(change?.path || "未命名文件");
    const diff = String(change?.diff || "");
    return `### ${path}\n\n\`\`\`diff\n${diff}\n\`\`\``;
  }).join("\n\n");
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}
