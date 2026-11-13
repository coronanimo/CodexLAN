export function submitsMessage(event: { key: string; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; isComposing?: boolean; keyCode?: number }, shortcut: "enter" | "ctrl-enter", compositionActive: boolean, navigatorLike = navigator) {
  if (event.key !== "Enter" || event.shiftKey || compositionActive || event.isComposing || event.keyCode === 229) return false;
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(navigatorLike.userAgent) || (navigatorLike as Navigator & { userAgentData?: { mobile: boolean } }).userAgentData?.mobile) return false;
  return shortcut === "ctrl-enter" ? event.ctrlKey || event.metaKey : !event.ctrlKey && !event.metaKey;
}
