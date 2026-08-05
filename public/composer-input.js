export function shouldSubmitPromptFromKeyboard(event, { compositionActive = false, mobile = false } = {}) {
  if (event.key !== "Enter" || event.shiftKey) return false;
  if (mobile || compositionActive || event.isComposing || event.keyCode === 229) return false;
  return true;
}

export function isMobileComposer(navigatorLike = {}) {
  if (navigatorLike.userAgentData?.mobile === true) return true;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(String(navigatorLike.userAgent || ""));
}
