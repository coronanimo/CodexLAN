declare global {
  interface Window {
    CodexAndroid?: {
      copyText(text: string): void; readyForSharedFiles(): void; hideKeyboard(): void;
      openConnectionSettings(): void; shareText(title: string, text: string): void;
      shareDocument(title: string, markdown: string, html: string): void;
      printMarkdown(title: string, html: string): void;
    };
    codexReceiveAndroidShare?: () => string;
    codexHandleAndroidBack?: () => string;
  }
}
export async function copyText(text: string) {
  if (window.CodexAndroid) { window.CodexAndroid.copyText(text); return; }
  try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return; } } catch {}
  const previous = document.activeElement as HTMLElement | null, source = document.createElement("textarea");
  source.className = "clipboard-source"; source.readOnly = true; source.value = text; document.body.append(source);
  try { source.focus({ preventScroll: true }); source.select(); source.setSelectionRange(0, source.value.length); if (!document.execCommand("copy")) throw new Error("浏览器拒绝访问剪贴板。"); }
  finally { source.remove(); previous?.focus({ preventScroll: true }); }
}
export async function shareText(title: string, text: string) {
  if (window.CodexAndroid) window.CodexAndroid.shareText(title, text);
  else if (navigator.share) await navigator.share({ title, text });
  else await copyText(text);
}
