// Isolated actual-service/browser acceptance. Uses the existing development
// Playwright installation, or PLAYWRIGHT_MODULE; never connects to real data.
import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "../dsh-codex/node_modules/playwright/index.mjs");
const taskStateOnly = process.argv.includes("--task-state");
const sidebarStateOnly = process.argv.includes("--sidebar-state");
const controlsOnly = process.argv.includes("--controls");
const sendRecoveryOnly = process.argv.includes("--send-recovery");
const messageLayoutOnly = process.argv.includes("--message-layout");
const accountLimitsOnly = process.argv.includes("--account-limits");
const messageAnswer = "已经在浏览器打开：[QArena](http://127.0.0.1:8790/)\n\n我已开始计算默认七条路径。你可以先点 **历史** 看日收益；计算完成后，选一个日期再点 **计算日内** 看当天的分钟曲线。\n\n- 保留现有配置，不覆盖原始记录。\n- 计算完成后可继续查看结果。";
const root = await mkdtemp(join(tmpdir(), "codexlan-conversation-ui-"));
await mkdir(join(root, "workspace"));
const listener = createServer();
listener.listen(0, "127.0.0.1");
await once(listener, "listening");
const port = listener.address().port;
await new Promise((resolve) => listener.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const service = fork(new URL("../server/index.mjs", import.meta.url), [], {
  env: { ...process.env, NODE_ENV: "test", CODEX_CONFIG: "0", CODEX_WEB_HOST: "127.0.0.1", CODEX_WEB_PORT: String(port),
    CODEX_WORKDIR: join(root, "workspace"), CODEX_WEB_DATA_DIR: join(root, "data"),
    CODEX_TEST_APP_SERVER: new URL("../test/fixtures/fake-app-server.mjs", import.meta.url).pathname.replace(/^\/(\w:)/, "$1"), CODEX_TEST_PLAN_UPDATE: "1",
    ...(taskStateOnly ? { CODEX_TEST_FOOTER_DIFF: "1", CODEX_TEST_PLAN_STEP: "核对执行结果与关键交互，确认计划在电脑和手机上持续可见，长步骤完整换行。".repeat(2) } : {}),
    ...(messageLayoutOnly ? { CODEX_TEST_ANSWER_TEXT: messageAnswer } : {}) },
  stdio: ["ignore", "pipe", "pipe", "ipc"], windowsHide: true,
});
let logs = "";
service.stdout.on("data", (data) => { logs += data; });
service.stderr.on("data", (data) => { logs += data; });
let browser;
try {
  for (let i = 0; i < 100; i++) {
    if (service.exitCode != null) throw Error(logs);
    try { if ((await fetch(origin + "/api/health")).ok) break; } catch {}
    await delay(100);
  }
  const setup = await fetch(origin + "/api/auth/setup", { method: "POST", headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({ username: "uitest", displayName: "会话验收", password: "isolated-ui-test-password" }) });
  assert.equal(setup.status, 201, logs);
  const cookie = setup.headers.get("set-cookie").split(";")[0];
  const setupBody = await setup.json();
  browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || "msedge" });
  const errors = [];
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const [name, value] = cookie.split("=");
  await context.addCookies([{ name, value, url: origin }]);
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.stack));
  if (accountLimitsOnly) {
    const result = await checkAccountLimits(page, context, setupBody.csrfToken);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ result: "passed", ...result, screenshots: root, errors }));
  } else if (sendRecoveryOnly) {
    const recovery = await checkSendRecovery(page);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ result: "passed", ...recovery, screenshots: root, errors }));
  } else {
  await page.goto(origin);
  if (sidebarStateOnly) {
    await checkSidebarLifecycle(page);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ result: "passed", screenshots: root, checks: ["SSE before creation response", "first-message running state", "manual rename", "project/recent/popover share one identity", "completion clears running state"], errors }));
  } else {
  await page.locator("#quick-new-thread").click();
  await page.locator("#prompt").fill("[timeline-order] [request-user-input] [request-user-input-async]");
  await page.locator("#send").click();
  await page.getByText("先说明，再执行：这段正文故意晚于工具到达。", { exact: true }).waitFor();
  await page.locator(".conversation-pending[open] .user-input-option").first().waitFor();
  if (messageLayoutOnly) {
    const results = await checkMessageLayout(page);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ result: "passed", ...results, screenshots: root, errors }));
  } else if (controlsOnly) {
    const results = await checkConversationControls(page, context, { name, value, cookie, csrfToken: setupBody.csrfToken });
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ result: "passed", ...results, screenshots: root, errors }));
  } else if (taskStateOnly) {
    const desktop = await checkTaskState(page, 40, "desktop");
    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await mobile.addCookies([{ name, value, url: origin }]);
    const phone = await mobile.newPage();
    phone.on("pageerror", (error) => errors.push(error.stack));
    await phone.goto(origin);
    await phone.locator(".turn-footer").waitFor();
    const handheld = await checkTaskState(phone, 46, "mobile");
    await checkNarrowFooter(phone, "running");
    await phone.setViewportSize({ width: 390, height: 844 });
    await phone.locator(".conversation-pending input[type=radio]").first().check();
    await phone.locator(".conversation-pending button[type=submit]").click();
    await phone.getByText("已收到换仓数量要求，继续执行。", { exact: true }).waitFor();
    await page.getByText("已收到换仓数量要求，继续执行。", { exact: true }).waitFor();
    const desktopDone = await checkTaskState(page, 40, "desktop-complete", true);
    const mobileDone = await checkTaskState(phone, 46, "mobile-complete", true);
    await page.reload();
    await page.locator(".turn-footer-plan li").first().waitFor();
    assert.equal(await page.locator(".turn-footer-details").isVisible(), false);
    assert.equal(await page.locator(".turn-footer-timing").isVisible(), true);
    assert.equal(await page.locator(".turn-footer-toggle").isVisible(), false);
    assert.equal(await page.locator(".turn-footer-plan li").count(), 2);
    await checkNarrowFooter(phone, "complete");
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ result: "passed", desktop, mobile: handheld, desktopDone, mobileDone, screenshots: root, errors }));
  } else {
  const order = () => page.locator(".execution-list").first().locator(":scope > [data-item-id]").evaluateAll((nodes) => nodes.map((node) => node.dataset.itemId));
  let before = await order();
  assert.equal(before.length, 5, await page.locator("#conversation").innerText());
  const labels = await page.locator(".execution-list").first().locator(":scope > [data-item-id]").allTextContents();
  assert.match(labels[1], /先说明/);
  assert.match(labels[2], /verify-timeline-order/);
  await page.getByText("verify-timeline-order", { exact: true }).click();
  await page.getByText("Timeline check passed", { exact: false }).waitFor();
  assert.equal(await page.locator(".execution-list .turn-plan").count(), 0);
  await page.locator("#mode-guide").click();
  await page.locator("#prompt").fill("补充验收条件。");
  await page.locator("#send").click();
  await page.locator(".message.guide").getByText("补充验收条件。", { exact: true }).waitFor();
  before = await order();
  assert.equal(before.length, 6);
  await page.locator(".conversation-pending input[type=radio]").first().check();
  await page.locator(".conversation-pending > summary").click();
  await page.locator(".pending-request-link").click();
  assert.equal(await page.locator(".conversation-pending input[type=radio]").first().isChecked(), true);
  await page.screenshot({ path: join(root, "desktop-pending.png") });
  await page.locator(".conversation-pending > summary").click();
  await page.locator(".conversation").evaluate((node) => { node.scrollTop = 0; });
  await page.screenshot({ path: join(root, "desktop.png") });
  await page.reload();
  await page.getByText("先说明，再执行：这段正文故意晚于工具到达。", { exact: true }).waitFor();
  assert.deepEqual(await order(), before);
  assert.equal(await page.locator(".message.guide").count(), 1);
  // A second device reads the same history/projection and uses mobile layout.
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await mobile.addCookies([{ name, value, url: origin }]);
  const phone = await mobile.newPage();
  phone.on("pageerror", (error) => errors.push(error.stack));
  await phone.goto(origin);
  await phone.getByText("先说明，再执行：这段正文故意晚于工具到达。", { exact: true }).waitFor();
  const phoneOrder = await phone.locator(".execution-list").first().locator(":scope > [data-item-id]").evaluateAll((nodes) => nodes.map((node) => node.dataset.itemId));
  assert.deepEqual(phoneOrder, before);
  const overflow = await phone.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  assert.equal(overflow, false);
  await phone.locator(".conversation-pending input[type=radio]").first().check();
  await phone.screenshot({ path: join(root, "mobile-pending.png") });
  await phone.locator(".conversation-pending > summary").click();
  await phone.getByRole("button", { name: "稍后回答", exact: true }).click();
  await phone.locator(".conversation").evaluate((node) => { node.scrollTop = 0; });
  await phone.screenshot({ path: join(root, "mobile.png") });
  await phone.locator(".conversation-pending > summary").click();
  // Miss completion on the PC; reconnect must recover the same entities.
  await context.setOffline(true);
  await phone.locator(".conversation-pending button[type=submit]").click();
  await phone.getByText("已收到换仓数量要求，继续执行。", { exact: true }).waitFor();
  assert.equal(await phone.locator(".conversation-pending").isVisible(), false);
  const after = await phone.locator(".execution-list").first().locator(":scope > [data-item-id]").evaluateAll((nodes) => nodes.map((node) => node.dataset.itemId));
  assert.deepEqual(after.slice(0, before.length), before);
  await context.setOffline(false);
  await page.getByText("已收到换仓数量要求，继续执行。", { exact: true }).waitFor();
  assert.deepEqual(await order(), after);
  await phone.reload();
  await phone.getByText("已收到换仓数量要求，继续执行。", { exact: true }).waitFor();
  assert.deepEqual(await phone.locator(".execution-list").first().locator(":scope > [data-item-id]").evaluateAll((nodes) => nodes.map((node) => node.dataset.itemId)), after);
  await page.locator("#prompt").fill("[request-approval]");
  await page.locator("#send").click();
  await page.locator(".conversation-pending .approval-card").waitFor();
  await page.getByRole("button", { name: "允许一次", exact: true }).click();
  await page.getByText("审批已处理。", { exact: true }).waitFor();
  assert.equal(await page.locator(".conversation-pending").isVisible(), false);
  // Exercise the real history cursor with a one-turn page, then prepend older
  // history through the visible loader without losing the latest turn.
  await page.route("**/api/threads/*?projectId=*", async (route) => {
    const url = new URL(route.request().url());
    if (/^\/api\/threads\/[^/]+$/.test(url.pathname) && !url.searchParams.has("history")) url.searchParams.set("limit", "1");
    await route.continue({ url: url.href });
  });
  await page.reload();
  await page.locator(".history-loader").click();
  await page.getByText("先说明，再执行：这段正文故意晚于工具到达。", { exact: true }).waitFor();
  assert.deepEqual(await order(), after);
  assert.equal(await page.locator(".execution-list").count(), 2);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result: "passed", desktop: join(root, "desktop.png"), mobile: join(root, "mobile.png"), checks: ["late text order", "refresh", "second device", "offline completion/reconnect", "mobile overflow", "request focus/selection", "async defer", "submit", "completion refresh", "approval", "history cursor", "tool expansion"], errors }));
  }
  }
  }
} catch (error) {
  console.error(logs);
  throw error;
} finally {
  await browser?.close();
  if (service.exitCode == null) {
    service.send({ type: "codexlan:shutdown" });
    await once(service, "exit");
  }
}

async function checkAccountLimits(page, context, csrfToken) {
  let requests = 0, hold = false, release;
  const held = new Promise((resolve) => { release = resolve; });
  await page.route("**/api/account/rate-limits", async (route) => {
    requests++;
    if (!hold) return route.continue();
    await held;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ available: true,
      rateLimits: { limitId: "codex", primary: { usedPercent: 1, windowDurationMins: 300 }, secondary: { usedPercent: 2, windowDurationMins: 10080 } },
    }) });
  });
  await page.goto(origin);
  await page.locator("#quick-new-thread").click();
  await page.locator("#prompt").fill("[timeline-order] [request-user-input]");
  await page.locator("#send").click();
  await page.getByText("先说明，再执行：这段正文故意晚于工具到达。", { exact: true }).waitFor();
  const threadId = await page.locator("#thread-list .thread-item.active").getAttribute("data-thread-id");
  const turnId = await page.locator(".execution-group").getAttribute("data-turn-id");
  const projectId = await page.evaluate(async () => (await (await fetch("/api/projects")).json()).projects[0].id);
  hold = true;
  requests = 0;
  let live;
  const liveReady = new Promise((resolve) => { live = resolve; });
  const responseListener = (response) => { if (new URL(response.url()).pathname === "/api/events") live(); };
  page.on("response", responseListener);
  const refreshStarted = performance.now();
  await page.reload();
  await page.getByText("先说明，再执行：这段正文故意晚于工具到达。", { exact: true }).waitFor();
  const historyVisibleMs = Math.round(performance.now() - refreshStarted);
  assert.equal(requests, 1);
  await liveReady;
  page.off("response", responseListener);
  const steer = async (text) => {
    const result = await page.evaluate(async ({ threadId, turnId, projectId, csrfToken, text }) => {
      const response = await fetch(`/api/threads/${threadId}/steer`, { method: "POST", headers: { "Content-Type": "application/json", "X-Codex-CSRF-Token": csrfToken },
        body: JSON.stringify({ projectId, expectedTurnId: turnId, text }) });
      return response.status;
    }, { threadId, turnId, projectId, csrfToken, text });
    assert.equal(result, 202);
  };
  await steer("[quota-notify]");
  await page.locator("#account-limit-five-hour").filter({ hasText: "5H 37%" }).waitFor();
  assert.equal(await page.locator("#account-limit-week").textContent(), "周 68%");
  assert.equal(requests, 1);
  hold = false;
  const staleResponse = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/account/rate-limits");
  release();
  await staleResponse;
  await steer("[token-notify]");
  await page.waitForFunction(() => document.querySelector("#context-usage")?.textContent.includes("5%"));
  // More than the old 800ms debounce: neither kind of notification may
  // initiate another read or replace the notified percentages with 1/2%.
  await delay(950);
  assert.equal(requests, 1);
  assert.equal(await page.locator("#account-limit-five-hour").textContent(), "5H 37%");
  assert.equal(await page.locator("#account-limit-week").textContent(), "周 68%");
  await page.locator("#open-account-menu").click();
  await page.screenshot({ path: join(root, "account-limits-notified.png") });
  await context.setOffline(true);
  assert.equal(await page.evaluate(async () => { try { await fetch("/api/health"); return false; } catch { return true; } }), true);
  const recoveryRead = page.waitForRequest((request) => new URL(request.url()).pathname === "/api/account/rate-limits");
  await context.setOffline(false);
  await recoveryRead;
  await page.locator("#account-limit-five-hour").filter({ hasText: "5H 37%" }).waitFor();
  assert.equal(requests, 2);
  return { historyVisibleMs, historyVisibleWhileQuotaReadHeld: true, readsBeforeReconnect: 1, readsAfterReconnect: requests,
    tokenEventsWithoutReads: 10, notificationPercentages: [37, 68], lateReadCannotOverwrite: true };
}

async function checkMessageLayout(page) {
  await page.locator("#mode-guide").click();
  await page.locator("#prompt").fill("先保留现有配置，再计算默认七条路径。计算完成后告诉我在哪里查看结果。");
  await page.locator("#send").click();
  await page.locator(".message.guide").waitFor();
  await page.locator(".conversation-pending input[type=radio]").first().check();
  await page.locator(".conversation-pending button[type=submit]").click();
  const answer = page.locator(".message.assistant").last();
  await answer.getByRole("link", { name: "QArena" }).waitFor();
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const copy = answer.locator(".message-meta .copy-text-button");
  await copy.focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelector(".message.assistant .copy-text-button")?.textContent === "已复制");
  assert.equal((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, "\n"), messageAnswer);
  // Refresh takes the canonical history/render path; actions must stay in
  // the header rather than being appended back beneath the body.
  await page.reload();
  await page.locator(".message.assistant").last().getByRole("link", { name: "QArena" }).waitFor();
  const desktop = await inspect(page, "desktop");
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await mobile.addCookies(await page.context().cookies());
  const phone = await mobile.newPage();
  const errors = [];
  phone.on("pageerror", (error) => errors.push(error.stack));
  await phone.goto(origin);
  await phone.locator(".message.assistant").last().getByRole("link", { name: "QArena" }).waitFor();
  const handheld = await inspect(phone, "mobile");
  await phone.setViewportSize({ width: 320, height: 844 });
  const narrow = await inspect(phone, "mobile-320");
  assert.deepEqual(errors, []);
  return { desktop, mobile: handheld, narrow, keyboardCopy: true, rawMarkdownPreserved: true, refreshKeepsHeader: true };

  async function inspect(surface, name) {
    const message = surface.locator(".message.assistant").last();
    const layout = await message.evaluate((node) => {
      const meta = node.querySelector(".message-meta");
      const body = node.querySelector(".message-body");
      const role = node.querySelector(".message-role");
      const copy = node.querySelector(".copy-text-button");
      const m = meta.getBoundingClientRect(), b = body.getBoundingClientRect(), c = copy.getBoundingClientRect();
      const outer = node.getBoundingClientRect();
      const kind = node.closest(".execution-group").querySelector(".execution-kind").getBoundingClientRect();
      const actions = node.querySelector(".message-actions");
      return { copyInHeader: actions.parentElement === meta, bottomActions: node.querySelectorAll(":scope > .message-actions").length,
        copyWithinHeader: c.top >= m.top && c.bottom <= m.bottom, rightAligned: Math.abs(c.right - m.right) < 1,
        leftAligned: Math.abs(m.left - b.left) < 1, bodyBelowHeader: b.top >= m.bottom,
        insetLeft: m.left - outer.left, insetRight: outer.right - m.right,
        headerHeight: m.height, bodyColor: getComputedStyle(body).color,
        executionLabelOffset: Math.abs(m.left - kind.left),
        overflow: document.documentElement.scrollWidth > innerWidth,
        roleSize: getComputedStyle(role).fontSize, roleWeight: getComputedStyle(role).fontWeight,
        bodySize: getComputedStyle(body).fontSize, lineHeight: getComputedStyle(body).lineHeight,
        actionsFit: actions.getBoundingClientRect().left >= node.querySelector(".message-time").getBoundingClientRect().right };
    });
    assert.equal(layout.copyInHeader, true);
    assert.equal(layout.bottomActions, 0);
    for (const property of ["copyWithinHeader", "rightAligned", "leftAligned", "bodyBelowHeader", "actionsFit"]) assert.equal(layout[property], true, JSON.stringify(layout));
    assert.equal(layout.overflow, false);
    assert.equal(layout.roleSize, "12px");
    assert.equal(layout.roleWeight, "600");
    assert.equal(layout.bodySize, "13px");
    assert.equal(layout.insetLeft, 9);
    assert.equal(layout.insetRight, 9);
    assert.ok(layout.executionLabelOffset < 1, JSON.stringify(layout));
    assert.equal(layout.lineHeight, "21.45px");
    const guide = surface.locator(".message.guide");
    const guideLayout = await guide.evaluate((node) => {
      const outer = node.getBoundingClientRect();
      const meta = node.querySelector(".message-meta"), body = node.querySelector(".message-body");
      const m = meta.getBoundingClientRect(), b = body.getBoundingClientRect();
      const kind = node.closest(".execution-group").querySelector(".execution-kind").getBoundingClientRect();
      return { insetLeft: m.left - outer.left, insetRight: outer.right - m.right,
        headerHeight: m.height, bodySize: getComputedStyle(body).fontSize,
        lineHeight: getComputedStyle(body).lineHeight, bodyColor: getComputedStyle(body).color,
        roleSize: getComputedStyle(node.querySelector(".message-role")).fontSize,
        leftAligned: Math.abs(m.left - b.left) < 1, executionLabelOffset: Math.abs(b.left - kind.left) };
    });
    for (const field of ["insetLeft", "insetRight", "headerHeight", "bodySize", "lineHeight", "bodyColor", "roleSize"]) {
      assert.equal(guideLayout[field], layout[field], `shared message layout: ${field}`);
    }
    assert.equal(guideLayout.leftAligned, true);
    assert.ok(guideLayout.executionLabelOffset < 1);
    await message.screenshot({ path: join(root, `${name}-message.png`) });
    const bounds = await surface.locator(".message.assistant").last().evaluate((node) => {
      const message = node.getBoundingClientRect();
      const footer = node.closest(".execution-group").querySelector(".turn-footer").getBoundingClientRect();
      return { x: message.left, y: message.top, width: Math.max(message.right, footer.right) - message.left, height: footer.bottom - message.top };
    });
    await surface.screenshot({ path: join(root, `${name}-answer-summary.png`), clip: bounds });
    await guide.screenshot({ path: join(root, `${name}-guide.png`) });
    return { ...layout, guide: guideLayout };
  }
}

async function checkSidebarLifecycle(page) {
  let threadId;
  // Make the real service's creation notification arrive before its HTTP
  // acknowledgement, deterministically exercising the two ingress paths.
  await page.route("**/api/threads", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const response = await route.fetch();
    const body = await response.json();
    threadId = body.thread.id;
    await page.locator(`#thread-list .thread-item[data-thread-id="${threadId}"]`).waitFor();
    await route.fulfill({ response });
  });
  await page.locator("#quick-new-thread").click();
  await page.locator("#prompt").fill("[request-user-input]");
  await page.locator("#send").click();
  await page.locator(".conversation-pending[open] .user-input-option").first().waitFor();
  const sidebar = page.locator(`#thread-list .thread-item[data-thread-id="${threadId}"]`);
  const recent = page.locator(`#recent-thread-menu [data-thread-id="${threadId}"]`);
  const check = async (running, name = null) => {
    assert.equal(await sidebar.count(), 1);
    assert.equal(await recent.count(), 1);
    assert.equal(await page.locator("#thread-list .thread-item[data-thread-id^=local-]").count(), 0);
    assert.equal(await sidebar.evaluate(node => node.classList.contains("running")), running);
    assert.equal(await recent.evaluate(node => node.classList.contains("running")), running);
    if (name) {
      assert.equal(await sidebar.locator("strong").textContent(), name);
      assert.equal(await recent.locator("strong").textContent(), name);
    }
  };
  await check(true);
  await page.locator("#open-thread-menu").click();
  await page.locator("#rename-thread").click();
  await page.locator("#thread-name-input").fill("统一身份的实时对话");
  await page.locator('#thread-form button[value="default"]').click();
  await page.locator("#thread-dialog").waitFor({ state: "hidden" });
  await check(true, "统一身份的实时对话");
  await page.screenshot({ path: join(root, "sidebar-project-running.png") });
  await page.locator("#sidebar-view-recent").click();
  await check(true, "统一身份的实时对话");
  await page.screenshot({ path: join(root, "sidebar-recent-running.png") });
  await page.locator(".conversation-pending input[type=radio]").first().check();
  await page.locator(".conversation-pending button[type=submit]").click();
  await page.getByText("已收到换仓数量要求，继续执行。", { exact: true }).waitFor();
  await page.locator(`#thread-list .thread-item.running[data-thread-id="${threadId}"]`).waitFor({ state: "detached" });
  await check(false, "统一身份的实时对话");
  await page.locator("#sidebar-view-projects").click();
  await check(false, "统一身份的实时对话");
  await page.screenshot({ path: join(root, "sidebar-project-completed.png") });
}

async function checkConversationControls(page, context, { name, value, cookie, csrfToken }) {
  const card = page.locator('.async-question-card').first();
  const fields = card.locator("fieldset");
  const draft = fields.nth(1).locator("input");
  assert.equal(await card.locator(".user-input-other").isVisible(), false);
  await fields.first().locator('input[type="radio"]').first().focus();
  await page.keyboard.press("ArrowDown");
  assert.equal(await fields.first().locator('input[type="radio"]').nth(1).isChecked(), true);
  await page.keyboard.press("ArrowDown");
  assert.equal(await card.locator(".user-input-other").isVisible(), true);
  assert.equal(await card.locator(".user-input-other").evaluate(input => document.activeElement === input), true);
  await card.locator(".user-input-other").fill("先保留窗口");
  await draft.fill("验收草稿");
  await draft.focus();
  const original = await page.locator(".execution-list > [data-item-id]").evaluateAll((nodes) => nodes.map((node) => node.dataset.itemId));
  const threadId = await page.locator("#thread-list .thread-item.active").getAttribute("data-thread-id");
  const turnId = await page.locator(".execution-group").first().getAttribute("data-turn-id");
  const steer = await fetch(`${origin}/api/threads/${threadId}/steer`, { method: "POST", headers: { Cookie: cookie, Origin: origin, "Content-Type": "application/json", "X-Codex-CSRF-Token": csrfToken }, body: JSON.stringify({ projectId: (await (await fetch(origin + "/api/projects", { headers: { Cookie: cookie } })).json()).projects[0].id, expectedTurnId: turnId, text: "输入保持检查" }) });
  assert.equal(steer.status, 202);
  await page.getByText("输入保持检查", { exact: true }).waitFor();
  assert.equal(await draft.inputValue(), "验收草稿");
  assert.equal(await draft.evaluate((input) => document.activeElement === input), true);
  assert.deepEqual((await page.locator(".execution-list > [data-item-id]").evaluateAll((nodes) => nodes.map((node) => node.dataset.itemId))).slice(0, original.length), original);
  await context.setOffline(true);
  assert.equal(await page.evaluate(async () => { try { await fetch("/api/health"); return false; } catch { return true; } }), true);
  await context.setOffline(false);
  const followup = await fetch(`${origin}/api/threads/${threadId}/steer`, { method: "POST", headers: { Cookie: cookie, Origin: origin, "Content-Type": "application/json", "X-Codex-CSRF-Token": csrfToken }, body: JSON.stringify({ projectId: (await (await fetch(origin + "/api/projects", { headers: { Cookie: cookie } })).json()).projects[0].id, expectedTurnId: turnId, text: "重连后输入检查" }) });
  assert.equal(followup.status, 202);
  await page.getByText("重连后输入检查", { exact: true }).waitFor();
  assert.equal(await draft.inputValue(), "验收草稿");
  assert.equal(await draft.evaluate((input) => document.activeElement === input), true);
  const typography = await card.evaluate((node) => ({ question: getComputedStyle(node.querySelector("legend strong")).fontSize, option: getComputedStyle(node.querySelector(".user-input-option strong")).fontSize, note: getComputedStyle(node.querySelector(".user-input-heading span")).fontSize, shadow: getComputedStyle(node.querySelector("form")).boxShadow }));
  assert.deepEqual(typography, { question: "14px", option: "13px", note: "12px", shadow: "none" });
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await mobile.addCookies([{ name, value, url: origin }]);
  const phone = await mobile.newPage();
  const phoneErrors = [];
  phone.on("pageerror", (error) => phoneErrors.push(error.stack));
  await phone.goto(origin);
  await phone.locator('.async-question-card[data-state="pending"]').waitFor();
  await phone.locator(".conversation-pending > summary").click();
  await phone.locator(".async-question-card").screenshot({ path: join(root, "mobile-question-pending.png") });
  await phone.getByRole("button", { name: "稍后回答", exact: true }).click();
  await phone.reload();
  await phone.locator('.async-question-card[data-state="deferred"]').waitFor();
  assert.ok((await phone.locator(".async-question-card").boundingBox()).height <= 48);
  await phone.locator(".async-question-card").screenshot({ path: join(root, "mobile-question-deferred.png") });
  await page.locator(".conversation-pending > summary").click();
  await card.screenshot({ path: join(root, "desktop-question-pending.png") });
  await card.getByRole("button", { name: "稍后回答", exact: true }).click();
  assert.ok((await card.boundingBox()).height <= 40);
  await card.screenshot({ path: join(root, "desktop-question-deferred.png") });
  await card.getByRole("button", { name: "继续回答", exact: true }).press("Enter");
  assert.equal(await draft.inputValue(), "验收草稿");
  assert.equal(await card.locator(".user-input-other").inputValue(), "先保留窗口");
  // Transient failure must not resend automatically or erase the form.
  let attempts = 0;
  await page.route("**/async-user-input/*", async (route) => {
    attempts++;
    if (attempts === 1) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "验收用暂时失败" }) });
    await route.continue();
  });
  await card.locator('button[type="submit"]').click();
  await card.getByText("验收用暂时失败", { exact: true }).waitFor();
  assert.equal(attempts, 1);
  assert.equal(await draft.inputValue(), "验收草稿");
  assert.equal(await card.locator(".user-input-other").inputValue(), "先保留窗口");
  assert.equal(await card.locator('button[type="submit"]').isEnabled(), true);
  await card.locator('button[type="submit"]').press("Enter");
  const answered = page.locator('.async-question-card[data-state="answered"]').first();
  await answered.waitFor();
  assert.equal(attempts, 2);
  assert.equal(await answered.locator("input,form").count(), 0);
  assert.ok((await answered.boundingBox()).height <= 40);
  await page.waitForFunction(() => document.activeElement?.matches('.async-question-card[data-state="answered"] summary'));
  await page.keyboard.press("Enter");
  assert.match(await answered.locator(".question-answer-body").innerText(), /先保留窗口/);
  assert.match(await answered.locator(".question-answer-body").innerText(), /验收草稿/);
  await page.keyboard.press("Enter");
  await answered.screenshot({ path: join(root, "desktop-question-answered.png") });
  await page.reload();
  await page.locator('.async-question-card[data-state="answered"]').waitFor();
  assert.equal(await page.locator(".async-answer-record").getAttribute("open"), null);
  await phone.goto(origin);
  await phone.locator('.async-question-card[data-state="answered"]').waitFor();
  const phoneCard = phone.locator('.async-question-card[data-state="answered"]').first();
  assert.ok((await phoneCard.boundingBox()).height <= 48);
  await phoneCard.screenshot({ path: join(root, "mobile-question-answered.png") });
  const widths = [];
  for (const width of [320, 700]) {
    await phone.setViewportSize({ width, height: 844 });
    const geometry = await phone.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth,
      radio: document.querySelector('.conversation-pending input[type="radio"]').getBoundingClientRect().height,
      option: document.querySelector('.conversation-pending .user-input-option').getBoundingClientRect().height,
      button: document.querySelector('.conversation-pending button[type="submit"]').getBoundingClientRect().height }));
    assert.equal(geometry.overflow, false);
    assert.equal(geometry.radio, 16);
    assert.ok(geometry.option >= 44);
    assert.ok(geometry.button >= 44);
    widths.push({ width, ...geometry });
  }
  // Read-only component edge cases use the same actual DOM module, without
  // changing the service model or inventing extra backend fixtures.
  const variants = await page.evaluate(async () => {
    const { createTurnFooter, updateTurnFooter } = await import("/turn-footer.js");
    const view = createTurnFooter({ id: "edge", onDiff() {}, onCopy() {} });
    const base = { plan: null, timing: null, recovered: [], changes: [], running: false };
    const statuses = ["失败", "已停止"].map((label) => {
      updateTurnFooter(view, { ...base, label, tone: label === "失败" ? "failed" : "stopped" });
      return { label: view.headline.textContent, diffHidden: view.diff.hidden, copyHidden: view.copy.hidden, detailsDisabled: view.toggle.disabled, timingHidden: view.timing.hidden };
    });
    updateTurnFooter(view, { ...base, label: "已完成", tone: "complete", timing: { totalMs: 5000, commandMs: 2000, commandCount: 3, commandUnknownCount: 1, codexMs: null } });
    return { statuses, command: view.fields.command.value.textContent, codex: view.fields.codex.value.textContent };
  });
  assert.deepEqual(variants.statuses, ["失败", "已停止"].map((label) => ({ label, diffHidden: true, copyHidden: true, detailsDisabled: true, timingHidden: true })));
  assert.match(variants.command, /^≥/);
  assert.match(variants.codex, /未记录/);
  assert.deepEqual(phoneErrors, []);
  return { typography, widths, attempts, variants, draftSurvivesReconnect: true };
}

async function checkTaskState(page, maximumHeight, platform, completed = false) {
  const panel = page.locator(".turn-footer").first();
  const bar = panel.locator(".turn-footer-bar");
  const toggle = panel.locator(".turn-footer-toggle");
  await bar.waitFor();
  if (await toggle.isVisible() && await toggle.getAttribute("aria-expanded") === "true") await toggle.click();
  const geometry = await panel.evaluate((node) => {
    const bar = node.querySelector(".turn-footer-bar");
    const title = node.querySelector(".turn-footer-headline");
    const diff = node.querySelector(".turn-footer-diff");
    return { height: node.getBoundingClientRect().height, barHeight: bar.getBoundingClientRect().height,
      titleSize: getComputedStyle(title).fontSize, titleWeight: getComputedStyle(title).fontWeight,
      diffSize: getComputedStyle(diff).fontSize, diffWeight: getComputedStyle(diff).fontWeight,
      oneLine: getComputedStyle(title).whiteSpace, truncated: title.scrollWidth > title.clientWidth,
      overflow: document.documentElement.scrollWidth > innerWidth };
  });
  assert.ok(geometry.barHeight <= maximumHeight, JSON.stringify(geometry));
  assert.equal(geometry.barHeight, platform.startsWith("mobile") ? 44 : 32);
  assert.equal(geometry.oneLine, "nowrap");
  assert.equal(geometry.titleSize, completed ? "10px" : "11px");
  assert.equal(geometry.titleWeight, "400");
  assert.equal(geometry.diffSize, "10px");
  assert.equal(geometry.diffWeight, "400");
  assert.equal(geometry.overflow, false);
  assert.equal(await panel.locator(".turn-footer-caret").count(), 0);
  assert.equal(await panel.locator(".turn-plan-body").isVisible(), true);
  assert.equal(await panel.locator(".turn-plan-body li").count(), 2);
  assert.equal(await panel.locator(".turn-footer-details").isVisible(), false);
  if (completed) assert.equal(await toggle.isVisible(), false);
  assert.equal(await panel.locator(".turn-footer-copy").isVisible(), completed);
  assert.equal(await panel.locator(".turn-plan-body p").count(), 0);
  assert.equal(await panel.locator(".turn-footer-plan h4 .turn-plan-title").textContent(), "Integration plan");
  if (platform.startsWith("mobile")) {
    for (const action of [toggle, panel.locator(".turn-footer-diff"), panel.locator(".turn-footer-copy")]) {
      if (!await action.isVisible()) continue;
      assert.ok((await action.boundingBox()).height >= 44);
      assert.ok((await action.boundingBox()).width >= 44);
    }
  }
  assert.equal(await page.locator(".turn-task-state,.execution-timing-summary,.turn-diff").count(), 0);
  assert.equal(await page.locator(".turn-footer").count(), 1);
  assert.equal(await panel.locator(".turn-footer-progress").textContent(), "1/2");
  assert.equal(await panel.locator(".turn-footer-files").textContent(), "1 个文件");
  assert.equal(await panel.locator(".turn-footer-added").textContent(), "+1");
  assert.equal(await panel.locator(".turn-footer-removed").textContent(), "−1");
  assert.equal(await panel.getAttribute("data-tone"), completed ? "complete" : "running");
  if (completed) assert.equal(await panel.locator(".turn-footer-headline").textContent(), "已完成");
  await panel.screenshot({ path: join(root, `${platform}-task.png`) });
  const hasDetails = await toggle.isVisible();
  if (hasDetails) {
    await toggle.press("Enter");
    await panel.locator(".turn-footer-details").waitFor({ state: "visible" });
  }
  assert.ok((await bar.boundingBox()).height <= maximumHeight);
  assert.equal(await panel.locator(".turn-plan-body li").count(), 2);
  assert.equal(await panel.locator(".turn-footer-timing").isVisible(), completed);
  if (!completed) {
    const alignment = await panel.evaluate((node) => {
      const row = node.closest(".execution-group").querySelector(".execution-entry");
      const kind = row.querySelector(".execution-kind"), title = row.querySelector("summary strong");
      const footerKind = node.querySelector(".turn-footer-kind"), footerTitle = node.querySelector(".turn-footer-headline");
      return { labelWeight: getComputedStyle(kind).fontWeight, footerWeight: getComputedStyle(footerKind).fontWeight,
        rowHeight: row.getBoundingClientRect().height, footerHeight: node.querySelector(".turn-footer-bar").getBoundingClientRect().height,
        labelSize: getComputedStyle(kind).fontSize, footerSize: getComputedStyle(footerKind).fontSize,
        titleWeight: getComputedStyle(title).fontWeight, footerTitleWeight: getComputedStyle(footerTitle).fontWeight,
        titleSize: getComputedStyle(title).fontSize, footerTitleSize: getComputedStyle(footerTitle).fontSize,
        labelOffset: Math.abs(kind.getBoundingClientRect().left - footerKind.getBoundingClientRect().left),
        titleOffset: Math.abs(title.getBoundingClientRect().left - footerTitle.getBoundingClientRect().left) };
    });
    assert.equal(alignment.labelWeight, alignment.footerWeight, JSON.stringify(alignment));
    assert.equal(alignment.labelWeight, "600");
    assert.equal(alignment.labelSize, "10px");
    assert.equal(alignment.rowHeight, alignment.footerHeight);
    assert.equal(alignment.labelSize, alignment.footerSize);
    assert.equal(alignment.titleWeight, alignment.footerTitleWeight);
    assert.equal(alignment.titleSize, alignment.footerTitleSize);
    assert.ok(alignment.labelOffset < 1 && alignment.titleOffset < 1, JSON.stringify(alignment));
  } else {
    const line = await panel.evaluate((node) => {
      const bar = node.querySelector(".turn-footer-bar").getBoundingClientRect();
      const timing = node.querySelector(".turn-footer-timing").getBoundingClientRect();
      const copy = node.querySelector(".turn-footer-copy").getBoundingClientRect();
      const headline = node.querySelector(".turn-footer-headline").getBoundingClientRect();
      const neutral = [...node.querySelectorAll(".turn-footer-headline, .turn-footer-elapsed, .turn-footer-files, .turn-footer-timing dt, .turn-footer-timing dd")].map((element) => getComputedStyle(element).color);
      return { sameRow: timing.top >= bar.top && timing.bottom <= bar.bottom, outsideTiming: node.querySelector(".turn-footer-details .turn-footer-timing") !== null,
        neutralColors: [...new Set(neutral)], addedColor: getComputedStyle(node.querySelector(".turn-footer-added")).color,
        removedColor: getComputedStyle(node.querySelector(".turn-footer-removed")).color,
        insetLeft: headline.left - bar.left, insetRight: bar.right - copy.right };
    });
    assert.equal(line.sameRow, true);
    assert.equal(line.outsideTiming, false);
    assert.equal(line.insetLeft, 4);
    assert.equal(line.insetRight, 4);
    assert.equal(line.neutralColors.length, 1, JSON.stringify(line));
    assert.notEqual(line.addedColor, line.neutralColors[0]);
    assert.notEqual(line.removedColor, line.neutralColors[0]);
    assert.notEqual(line.addedColor, line.removedColor);
  }
  if (completed) {
    assert.equal(await panel.locator(".turn-footer-timing dt").count(), 3);
    assert.match(await panel.locator(".turn-footer-timing").innerText(), /命令/);
    assert.match(await panel.locator(".turn-footer-timing").innerText(), /Codex ≈/);
  }
  await panel.screenshot({ path: join(root, `${platform}-task-expanded.png`) });
  if (!completed) {
    await page.locator(".conversation").screenshot({ path: join(root, `${platform}-execution-rows.png`) });
    await page.locator(".execution-entry").first().screenshot({ path: join(root, `${platform}-command-row.png`) });
  }
  if (hasDetails) await toggle.click();
  await panel.locator(".turn-footer-diff").click();
  await page.locator("#markdown-preview-dialog[open]").waitFor();
  assert.match(await page.locator("#markdown-preview-body").innerText(), /new value/);
  await page.locator("#close-markdown-preview").click();
  if (completed) {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await panel.locator(".turn-footer-copy").click();
    await page.waitForFunction(() => document.querySelector(".turn-footer-copy")?.textContent === "已复制");
    assert.match(await page.evaluate(() => navigator.clipboard.readText()), /verify-timeline-order/);
  }
  assert.ok((await bar.boundingBox()).height <= maximumHeight);
  return geometry;
}

async function checkSendRecovery(page) {
  let blockStream = true;
  let streamFailures = 0;
  let sends = 0;
  await page.route("**/api/events**", (route) => {
    if (!blockStream) return route.continue();
    streamFailures++;
    return route.abort("failed");
  });
  page.on("request", (request) => {
    if (request.method() === "POST" && /\/queue$/.test(new URL(request.url()).pathname)) sends++;
  });
  await page.goto(origin);
  await page.locator("#quick-new-thread").click();
  await page.locator("#prompt").fill("[timeline-order] [request-user-input]");
  await page.locator("#send").click();
  await page.getByText("先说明，再执行：这段正文故意晚于工具到达。", { exact: true }).waitFor();
  assert.ok(streamFailures > 0);
  assert.equal(sends, 1);
  assert.equal(await page.locator("#prompt").inputValue(), "");
  assert.doesNotMatch(await page.locator("body").innerText(), /实时连接未建立，任务没有发送/);
  blockStream = false;
  await page.locator(".conversation-pending input[type=radio]").first().waitFor();
  await page.locator(".turn-footer-plan li").first().waitFor();
  await page.locator(".conversation-pending input[type=radio]").first().check();
  await page.locator(".conversation-pending button[type=submit]").click();
  await page.getByText("已收到换仓数量要求，继续执行。", { exact: true }).waitFor();
  assert.equal(sends, 1);
  let rejectSend = true;
  await page.route("**/api/threads/*/queue", (route) => rejectSend
    ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "服务器暂时无法接收任务" }) })
    : route.continue());
  await page.locator("#prompt").fill("发送失败后保留的文字");
  await page.locator("#send").click();
  await page.getByText("服务器暂时无法接收任务", { exact: true }).waitFor();
  assert.equal(await page.locator("#prompt").inputValue(), "发送失败后保留的文字");
  rejectSend = false;
  await page.locator("#send").click();
  await page.locator(".message.user").getByText("发送失败后保留的文字", { exact: true }).waitFor();
  assert.equal(sends, 3);
  assert.equal(await page.locator("#prompt").inputValue(), "");
  await page.screenshot({ path: join(root, "send-recovered.png") });
  return { streamFailures, sends, sentWithoutStream: true, recoveredWithoutResubmit: true, failedDraftRestored: true };
}

async function checkNarrowFooter(page, state) {
  for (const width of [320, 700]) {
    await page.setViewportSize({ width, height: 844 });
    const bar = page.locator(".turn-footer-bar").first();
    const layout = await bar.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      const controls = [...node.querySelectorAll("button")].filter((button) => !button.hidden);
      const time = node.querySelector(".turn-footer-elapsed").getBoundingClientRect();
      const headline = node.querySelector(".turn-footer-headline");
      return { overflow: document.documentElement.scrollWidth > innerWidth,
        clipped: controls.some((button) => { const r = button.getBoundingClientRect(); return r.left < rect.left || r.right > rect.right; }),
        truncated: headline.scrollWidth > headline.clientWidth, timeRight: rect.right - time.right,
        kind: node.querySelector(".turn-footer-kind").textContent };
    });
    assert.equal(layout.overflow, false);
    assert.equal(layout.clipped, false);
    assert.equal(layout.truncated, false);
    if (state === "running") {
      assert.equal(layout.kind, "小结");
      assert.ok(Math.abs(layout.timeRight - 9) < 1, JSON.stringify(layout));
    }
    await page.locator(".turn-footer").first().screenshot({ path: join(root, `mobile-${width}-${state}.png`) });
    if (state === "complete") {
      const scroll = await bar.evaluate((node) => {
        const summary = node.querySelector(".turn-footer-status");
        summary.scrollLeft = summary.scrollWidth;
        const timing = node.querySelector('.turn-footer-timing-field[data-metric="codex"]').getBoundingClientRect();
        const viewport = summary.getBoundingClientRect();
        return { scrollable: summary.scrollWidth > summary.clientWidth, codexVisible: timing.left >= viewport.left && timing.right <= viewport.right - 11 };
      });
      assert.equal(scroll.codexVisible, true);
      if (width === 320) assert.equal(scroll.scrollable, true);
      await page.locator(".turn-footer").first().screenshot({ path: join(root, `mobile-${width}-summary-scrolled.png`) });
      await bar.locator(".turn-footer-status").evaluate((node) => { node.scrollLeft = 0; });
    }
  }
}
