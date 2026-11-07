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
  if (window.CodexAndroid) window.CodexAndroid.copyText(text);
  else await navigator.clipboard.writeText(text);
}
export async function shareText(title: string, text: string) {
  if (window.CodexAndroid) window.CodexAndroid.shareText(title, text);
  else if (navigator.share) await navigator.share({ title, text });
  else await copyText(text);
}
