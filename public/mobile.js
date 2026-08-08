export function bindPlatformInteractions({ ui, cancelScrollCommand, closeTopbarOverlays }) {
  let viewportFrame = 0;

  function applyViewport() {
    viewportFrame = 0;
    const height = Number(window.visualViewport?.height || window.innerHeight);
    if (Number.isFinite(height) && height > 0) {
      document.documentElement.style.setProperty("--app-viewport-height", `${Math.round(height)}px`);
    }
  }

  function scheduleViewportUpdate() {
    if (viewportFrame) cancelAnimationFrame(viewportFrame);
    viewportFrame = requestAnimationFrame(applyViewport);
  }

  function closeSidebar() {
    ui.sidebar.classList.remove("open");
    ui.sidebarScrim.classList.remove("open");
    ui.openSidebar.setAttribute("aria-expanded", "false");
  }

  function openSidebar() {
    closeTopbarOverlays();
    ui.sidebar.classList.add("open");
    ui.sidebarScrim.classList.add("open");
    ui.openSidebar.setAttribute("aria-expanded", "true");
  }

  ui.openSidebar.addEventListener("click", openSidebar);
  ui.closeSidebar.addEventListener("click", closeSidebar);
  ui.sidebarScrim.addEventListener("click", closeSidebar);
  ui.conversation.addEventListener("pointerdown", cancelScrollCommand, { passive: true });
  ui.conversation.addEventListener("touchstart", cancelScrollCommand, { passive: true });
  window.addEventListener("resize", scheduleViewportUpdate, { passive: true });
  window.visualViewport?.addEventListener("resize", scheduleViewportUpdate, { passive: true });
  window.visualViewport?.addEventListener("scroll", scheduleViewportUpdate, { passive: true });
  scheduleViewportUpdate();

  return { closeSidebar };
}
