import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const desktopCss = await readFile(new URL("../public/desktop.css", import.meta.url), "utf8");
const sharedCss = (await Promise.all([
  "styles.css",
  "workspace.css",
  "content.css",
  "execution.css",
  "composer.css",
  "dialogs.css",
].map((name) => readFile(new URL(`../public/${name}`, import.meta.url), "utf8")))).join("\n");
const sidebarCss = await readFile(new URL("../public/sidebar.css", import.meta.url), "utf8");
const mobileCss = await readFile(new URL("../public/mobile.css", import.meta.url), "utf8");
const mobileJs = await readFile(new URL("../public/mobile.js", import.meta.url), "utf8");

test("desktop composer keeps menus visible without losing viewport containment", () => {
  const composerRule = desktopCss.match(/\.composer-zone\s*\{([^}]*)\}/)?.[1] || "";
  assert.doesNotMatch(composerRule, /overflow(?:-[xy])?\s*:/);
  assert.match(desktopCss, /\.workbench\s*\{[^}]*height:\s*100dvh;/s);
  assert.match(sharedCss, /\.compact-select-menu\s*\{[^}]*bottom:\s*calc\(100% \+ 6px\)/s);
});

test("sidebar exposes independent organization and ordering controls", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  assert.match(html, /href="\/sidebar\.css"/);
  const brandMarkup = html.match(/<div class="sidebar-brand">([\s\S]*?)<\/div>/)?.[1] || "";
  assert.doesNotMatch(brandMarkup, /工作台/);
  assert.match(html, /id="sidebar-view-projects"[^>]*aria-pressed="true"/);
  assert.match(html, /id="sidebar-view-recent"[^>]*aria-pressed="false"/);
  assert.match(html, /id="sidebar-sort-trigger"[^>]*aria-controls="sidebar-sort-menu"/);
  assert.match(html, /id="sidebar-order-original"[^>]*role="menuitemradio"[^>]*aria-checked="true"/);
  assert.match(html, /id="sidebar-order-recent"[^>]*role="menuitemradio"[^>]*aria-checked="false"/);
  assert.doesNotMatch(html, /<select[^>]*id="sidebar-order/);
});

test("frontend CSS is split by responsibility and uses one light semantic palette", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  for (const name of ["styles", "workspace", "content", "execution", "composer", "dialogs", "sidebar"]) {
    assert.match(html, new RegExp(`href="/${name}\\.css"`));
  }
  assert.match(sharedCss, /--surface-canvas:\s*#f5f7fa/);
  assert.match(sharedCss, /--accent:\s*#3c82c4/);
  assert.match(sharedCss, /--accent-strong:\s*#24669f/);
  assert.match(sharedCss, /--accent-soft:\s*#e9f4fd/);
  assert.match(sharedCss, /--signal:\s*#2a9189/);
  assert.match(sidebarCss, /--sb-canvas:\s*#f5f7fa/);
  assert.match(sidebarCss, /--sb-panel:\s*#ffffff/);
  assert.doesNotMatch(sidebarCss, /--sb-(?:bg|teal):/);
  assert.doesNotMatch(sharedCss, /\.sidebar-account-chevron/);
});

test("sidebar keeps one scrollable navigation body above a fixed dock", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  assert.match(html, /class="sidebar-navigation-body">[\s\S]*id="projects-section"[\s\S]*class="sidebar-section chats-section"/);
  assert.match(html, /class="sidebar-dock">[\s\S]*class="sidebar-tools"[\s\S]*id="account-menu-wrap"/);
  assert.match(html, /id="open-account-menu"[\s\S]*id="account-limits" class="sidebar-account-limits"[\s\S]*id="account-menu"[\s\S]*id="server-status"/);
  assert.match(sidebarCss, /\.sidebar-navigation-body\s*\{[^}]*min-height:\s*0;[^}]*flex:\s*1 1 auto;[^}]*overflow-y:\s*auto;/s);
  assert.match(sidebarCss, /\.sidebar-dock\s*\{[^}]*flex:\s*0 0 auto;/s);
  assert.match(sidebarCss, /\.project-item strong, \.thread-item strong\s*\{[^}]*font-size:\s*11px;[^}]*font-weight:\s*520;/s);
});

test("account strip carries adaptive rate limits while workspace tools stay inside its menu", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const appJs = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  assert.match(html, /id="open-account-menu"[\s\S]*id="account-limits" class="sidebar-account-limits"[\s\S]*id="account-menu"/);
  assert.match(html, /id="account-menu"[\s\S]*id="account-limit-details"[\s\S]*id="account-limit-five-hour-reset"[\s\S]*id="account-limit-week-reset"/);
  assert.match(html, /id="account-menu"[\s\S]*id="refresh-workspace"[\s\S]*id="open-global-settings"[\s\S]*<span>设置<\/span>/);
  assert.doesNotMatch(html, /id="open-settings"|account-service-row|account-connection-status/);
  assert.doesNotMatch(html, /class="sidebar-tool-grid"/);
  assert.match(sidebarCss, /\.sidebar-account-limits\s*\{[^}]*display:\s*flex;[^}]*flex:\s*0 0 auto;/s);
  assert.doesNotMatch(sidebarCss, /\.sidebar-account-limits > span::before\s*\{[^}]*width:\s*var\(--usage\)/s);
  assert.doesNotMatch(html, /class="sidebar-account-chevron"/);
  assert.match(sidebarCss, /\.project-item\.active, \.thread-item\.active\s*\{[^}]*box-shadow:\s*inset 0 0 0 1px/s);
  assert.doesNotMatch(appJs, /classList\.toggle\("single", visible\.length === 1\)/);
  assert.match(appJs, /reset\.textContent = limit\.resetsAt \? `重置 \$\{new Date\(limit\.resetsAt \* 1000\)\.toLocaleString\(\)\}` : "重置时间未知"/);
  assert.match(appJs, /typeof params\.threadName === "string" \? params\.threadName : params\.name/);
  assert.match(appJs, /serverStatus\.setAttribute\("aria-label", text\)/);
});

test("settings keep one connection surface and only durable preferences", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const appJs = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  assert.match(html, /id="global-config-dialog"[\s\S]*id="server-status"[\s\S]*id="global-connection-address"[\s\S]*id="copy-connection-address"/);
  assert.match(html, /id="completion-notifications"[\s\S]*id="send-shortcut"[\s\S]*id="summary-select"/);
  assert.match(html, /id="change-connection-address"[^>]*hidden/);
  assert.doesNotMatch(html, /id="connection-dialog"|id="refresh-interval"|id="refresh-from-config"|id="model-select"|id="effort-select"|id="tier-select"/);
  assert.doesNotMatch(appJs, /configureAutoRefresh|scheduleAutoRefresh|refreshTimer/);
  const visibilityHandler = appJs.match(/document\.addEventListener\("visibilitychange",[\s\S]*?\n\}\);/)?.[0] || "";
  assert.doesNotMatch(visibilityHandler, /stopEventStream/);
  assert.match(visibilityHandler, /ensureEventStream\(\)/);
  assert.match(appJs, /Notification\.requestPermission\(\)/);
  assert.match(appJs, /notifyTurnCompletion\(projectId, threadId, params\.turn\)/);
  assert.match(appJs, /serverStatusLabel\.textContent = text/);
});

test("users can change only their own display name from the account menu", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const appJs = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  const accounts = await readFile(new URL("../server/accounts.mjs", import.meta.url), "utf8");
  assert.match(html, /id="change-display-name"[\s\S]*id="display-name-dialog"[\s\S]*id="profile-display-name"/);
  assert.match(appJs, /api\("\/api\/auth\/profile",\s*\{[\s\S]*method:\s*"PATCH"[\s\S]*displayName:/);
  assert.match(accounts, /patch\("\/api\/auth\/profile"[\s\S]*updateUser\(request\.identity\.user\.id, \{ displayName: body\.displayName \}\)/);
});

test("mobile sidebar follows both visual viewport height and top offset", () => {
  assert.match(mobileCss, /--app-viewport-top:\s*0px/);
  assert.match(mobileCss, /\.sidebar\s*\{[^}]*top:\s*var\(--app-viewport-top\)/s);
  assert.match(mobileCss, /\.sidebar-scrim\s*\{[^}]*height:\s*var\(--app-viewport-height\)/s);
  assert.match(mobileJs, /viewport\?\.offsetTop/);
  assert.match(mobileJs, /--app-viewport-top/);
});
