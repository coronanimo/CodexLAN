export function createWorkbenchLayout({ ui, state, renderRunStrip, renderRecentThreads }) {
  function toggleRunStrip() {
    closeRecentThreads();
    closeThreadMenu();
    state.runStripOpen = !state.runStripOpen;
    renderRunStrip();
  }

  function closeRunStrip() {
    if (!state.runStripOpen) return;
    state.runStripOpen = false;
    ui.runStrip.hidden = true;
    ui.runStatus.setAttribute("aria-expanded", "false");
  }

  function toggleThreadMenu() {
    if (ui.openThreadMenu.disabled) return;
    closeRunStrip();
    closeRecentThreads();
    const opening = ui.threadMenu.hidden;
    ui.threadMenu.hidden = !opening;
    ui.openThreadMenu.setAttribute("aria-expanded", String(opening));
  }

  function closeThreadMenu() {
    ui.threadMenu.hidden = true;
    ui.openThreadMenu.setAttribute("aria-expanded", "false");
  }

  function toggleRecentThreads() {
    if (ui.openRecentThreads.disabled) return;
    closeRunStrip();
    closeThreadMenu();
    closeAccountMenu();
    renderRecentThreads();
    const opening = ui.recentThreadMenu.hidden;
    ui.recentThreadMenu.hidden = !opening;
    ui.openRecentThreads.setAttribute("aria-expanded", String(opening));
  }

  function closeRecentThreads() {
    ui.recentThreadMenu.hidden = true;
    ui.openRecentThreads.setAttribute("aria-expanded", "false");
  }

  function toggleAccountMenu() {
    closeRunStrip();
    closeThreadMenu();
    closeRecentThreads();
    const opening = ui.accountMenu.hidden;
    ui.accountMenu.hidden = !opening;
    ui.openAccountMenu.setAttribute("aria-expanded", String(opening));
  }

  function closeAccountMenu() {
    ui.accountMenu.hidden = true;
    ui.openAccountMenu.setAttribute("aria-expanded", "false");
  }

  function closeTopbarOverlays() {
    closeRunStrip();
    closeThreadMenu();
    closeRecentThreads();
    closeAccountMenu();
  }

  function bind() {
    ui.openAccountMenu.addEventListener("click", toggleAccountMenu);
    ui.runStatus.addEventListener("click", toggleRunStrip);
    ui.openRecentThreads.addEventListener("click", toggleRecentThreads);
    ui.openThreadMenu.addEventListener("click", toggleThreadMenu);
    document.addEventListener("click", (event) => {
      if (!ui.runStatus.contains(event.target) && !ui.runStrip.contains(event.target)) closeRunStrip();
      if (!ui.threadMenuWrap.contains(event.target)) closeThreadMenu();
      if (!ui.recentThreadWrap.contains(event.target)) closeRecentThreads();
      if (!ui.accountMenuWrap.contains(event.target)) closeAccountMenu();
    });
  }

  return {
    bind,
    closeAccountMenu,
    closeRecentThreads,
    closeRunStrip,
    closeThreadMenu,
    closeTopbarOverlays,
  };
}
