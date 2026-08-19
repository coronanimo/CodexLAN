import { shouldSubmitPromptFromKeyboard } from "./composer.js";

export function bindPlatformInteractions({ ui, cancelScrollCommand, getSubmitShortcut = () => "enter" }) {
  let compositionActive = false;
  ui.prompt.addEventListener("compositionstart", () => { compositionActive = true; });
  ui.prompt.addEventListener("compositionend", () => { compositionActive = false; });
  ui.prompt.addEventListener("keydown", (event) => {
    if (!shouldSubmitPromptFromKeyboard(event, { compositionActive, shortcut: getSubmitShortcut() })) return;
    event.preventDefault();
    ui.composer.requestSubmit();
  });
  ui.conversation.addEventListener("pointerdown", cancelScrollCommand, { passive: true });
  ui.conversation.addEventListener("wheel", cancelScrollCommand, { passive: true });

  return {
    closeSidebar() {
      ui.sidebar.classList.remove("open");
      ui.sidebarScrim.classList.remove("open");
      ui.openSidebar.setAttribute("aria-expanded", "false");
    },
  };
}
