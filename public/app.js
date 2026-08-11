import { downloadableFiles, projectForLocalFile, textPreviewKind } from "./file-downloads.js";
import { renderMarkdownDocument } from "./markdown-preview.js";
import { formatJsonText, plainInlineMarkdown } from "./text-format.js";
import { conversationDateKey, elapsedTiming, formatConversationDate, formatDuration, formatElapsed, formatMessageDateTime, formatMessageTime, timestampMilliseconds } from "./elapsed-time.js";
import { commandDisplayText, commandOutputTail, executionItemText, fileChangeUpdateItem, isExecutionItem, mergeHistoricalExecutionItem, reconcileStaleExecutionTurn, restoreMissingExecutionItems, summarizeExecutionTiming, terminalExecutionStatus, turnProcessMarkdown } from "./execution-events.js";
import { accountLimitWindows, contextWindowUsage, hasCurrentThreadHistory, isActiveThreadRuntime, isActiveThreadStatus, mergeRefreshedThreads, mergeTurnItems, newThreadSettings, recentThreadEntries, threadDisplayName } from "./workspace.js";
import { appendAnsiOutput, renderAnsiOutput } from "./ansi-output.js";
import { diffLineStats, renderFileChanges, unifiedDiffChanges } from "./diff-output.js";
import { clipboardImageFiles, clipboardImageName, isMobileComposer, messageWithAttachments, resizeComposerInput } from "./composer.js";
import { createTurnPlanView, planShortcut, updateTurnPlanView } from "./plan.js";
import { goalPresentation, goalShortcut, isActiveGoal } from "./goal.js";
import { createWorkbenchLayout } from "./layout.js";

const $ = (selector) => document.querySelector(selector);
const MAX_RENDERED_COMMAND_OUTPUT = 16_000;

if (window.CodexAndroid) document.documentElement.classList.add("android-shell");

const ui = {
  app: $("#app"),
  authShell: $("#auth-shell"),
  authKicker: $("#auth-kicker"),
  authTitle: $("#auth-title"),
  authDescription: $("#auth-description"),
  loginForm: $("#login-form"),
  loginUsername: $("#login-username"),
  loginPassword: $("#login-password"),
  loginError: $("#login-error"),
  setupForm: $("#setup-form"),
  setupUsername: $("#setup-username"),
  setupDisplayName: $("#setup-display-name"),
  setupPassword: $("#setup-password"),
  setupPasswordConfirm: $("#setup-password-confirm"),
  setupError: $("#setup-error"),
  sidebar: $("#sidebar"),
  sidebarScrim: $("#sidebar-scrim"),
  openSidebar: $("#open-sidebar"),
  closeSidebar: $("#close-sidebar"),
  projectList: $("#project-list"),
  threadList: $("#thread-list"),
  desktopProjectName: $("#desktop-project-name"),
  addProject: $("#add-project"),
  manageProjectsSide: $("#manage-projects-side"),
  refreshWorkspace: $("#refresh-workspace"),
  mobileRefresh: $("#mobile-refresh"),
  openGlobalSettings: $("#open-global-settings"),
  newThread: $("#new-thread"),
  quickNewThread: $("#quick-new-thread"),
  runStrip: $("#run-strip"),
  runStatus: $("#run-status"),
  runStatusLabel: $("#run-status-label"),
  threadName: $("#thread-name"),
  recentThreadWrap: $("#recent-thread-wrap"),
  openRecentThreads: $("#open-recent-threads"),
  recentThreadMenu: $("#recent-thread-menu"),
  openThreadMenu: $("#open-thread-menu"),
  threadMenuWrap: $("#thread-menu-wrap"),
  threadMenu: $("#thread-menu"),
  renameThread: $("#rename-thread"),
  compactThread: $("#compact-thread"),
  deleteThread: $("#delete-thread"),
  conversation: $("#conversation"),
  conversationStage: $(".conversation-stage"),
  jumpLatest: $("#jump-latest"),
  queuePanel: $("#queue-panel"),
  model: $("#model-select"),
  effort: $("#effort-select"),
  tier: $("#tier-select"),
  summary: $("#summary-select"),
  tierField: $("#tier-field"),
  tierDescription: $("#tier-description"),
  composerModel: $("#composer-model-select"),
  composerEffort: $("#composer-effort-select"),
  composerTier: $("#composer-tier-select"),
  planMode: $("#plan-mode"),
  goalMode: $("#goal-mode"),
  guide: $("#mode-guide"),
  queue: $("#mode-queue"),
  composer: $("#composer"),
  prompt: $("#prompt"),
  uploadFiles: $("#upload-files"),
  uploadFileInput: $("#upload-file-input"),
  send: $("#send"),
  stop: $("#stop"),
  contextUsage: $("#context-usage"),
  contextUsageFill: $("#context-usage-fill"),
  contextUsageLabel: $("#context-usage-label"),
  composerAttachments: $("#composer-attachments"),
  activity: $("#activity"),
  serverStatus: $("#server-status"),
  openSettings: $("#open-settings"),
  connectionDialog: $("#connection-dialog"),
  connectionAddress: $("#connection-address"),
  projectManagerDialog: $("#project-manager-dialog"),
  projectManagerList: $("#project-manager-list"),
  newProjectFromManager: $("#new-project-from-manager"),
  globalConfigDialog: $("#global-config-dialog"),
  accountMenuWrap: $("#account-menu-wrap"),
  openAccountMenu: $("#open-account-menu"),
  accountMenu: $("#account-menu"),
  accountAvatar: $("#account-avatar"),
  accountDisplayName: $("#account-display-name"),
  accountUsername: $("#account-username"),
  accountLimits: $("#account-limits"),
  accountLimitFiveHour: $("#account-limit-five-hour"),
  accountLimitWeek: $("#account-limit-week"),
  manageUsers: $("#manage-users"),
  changePassword: $("#change-password"),
  logout: $("#logout"),
  passwordDialog: $("#password-dialog"),
  passwordForm: $("#password-form"),
  closePasswordDialog: $("#close-password-dialog"),
  passwordIntro: $("#password-intro"),
  currentPassword: $("#current-password"),
  newPassword: $("#new-password"),
  newPasswordConfirm: $("#new-password-confirm"),
  passwordError: $("#password-error"),
  userManagerDialog: $("#user-manager-dialog"),
  userList: $("#user-list"),
  addUser: $("#add-user"),
  userDialog: $("#user-dialog"),
  userForm: $("#user-form"),
  userDialogTitle: $("#user-dialog-title"),
  newUserFields: $("#new-user-fields"),
  userUsername: $("#user-username"),
  userDisplayName: $("#user-display-name"),
  userPassword: $("#user-password"),
  userPasswordConfirm: $("#user-password-confirm"),
  userFormError: $("#user-form-error"),
  refreshInterval: $("#refresh-interval"),
  refreshFromConfig: $("#refresh-from-config"),
  globalConnectionAddress: $("#global-connection-address"),
  configThreadName: $("#config-thread-name"),
  projectDialog: $("#project-dialog"),
  projectForm: $("#project-form"),
  projectKicker: $("#project-dialog-kicker"),
  projectDialogTitle: $("#project-dialog-title"),
  projectName: $("#project-name-input"),
  projectPath: $("#project-path-input"),
  projectError: $("#project-form-error"),
  deleteProject: $("#delete-project"),
  projectRenameDialog: $("#project-rename-dialog"),
  projectRenameForm: $("#project-rename-form"),
  projectRenameInput: $("#project-rename-input"),
  projectRenameError: $("#project-rename-error"),
  threadDialog: $("#thread-dialog"),
  threadForm: $("#thread-form"),
  threadNameInput: $("#thread-name-input"),
  threadFormError: $("#thread-form-error"),
  goalDialog: $("#goal-dialog"),
  goalForm: $("#goal-form"),
  goalSummary: $("#goal-summary"),
  goalStatusLabel: $("#goal-status-label"),
  goalUsage: $("#goal-usage"),
  goalObjective: $("#goal-objective"),
  goalTokenBudget: $("#goal-token-budget"),
  goalFormError: $("#goal-form-error"),
  goalClear: $("#goal-clear"),
  goalToggle: $("#goal-toggle"),
  goalSave: $("#goal-save"),
  queueEditDialog: $("#queue-edit-dialog"),
  queueEditForm: $("#queue-edit-form"),
  queueEditInput: $("#queue-edit-input"),
  queueEditError: $("#queue-edit-error"),
  confirmDialog: $("#confirm-dialog"),
  confirmForm: $("#confirm-form"),
  confirmKicker: $("#confirm-kicker"),
  confirmTitle: $("#confirm-title"),
  confirmMessage: $("#confirm-message"),
  confirmSubmit: $("#confirm-submit"),
  markdownPreviewDialog: $("#markdown-preview-dialog"),
  filePreviewKicker: $("#file-preview-kicker"),
  markdownPreviewName: $("#markdown-preview-name"),
  markdownPreviewPath: $("#markdown-preview-path"),
  markdownPreviewStatus: $("#markdown-preview-status"),
  markdownPreviewBody: $("#markdown-preview-body"),
  markdownPreviewDownload: $("#markdown-preview-download"),
  closeMarkdownPreview: $("#close-markdown-preview"),
  messageTemplate: $("#message-template"),
  queueItemTemplate: $("#queue-item-template"),
};

const state = {
  user: null,
  csrfToken: null,
  users: [],
  projects: [],
  models: [],
  collaborationModes: [],
  accountRateLimits: null,
  threadTokenUsage: new Map(),
  threads: new Map(),
  selectedProjectId: null,
  selectedThreadId: null,
  threadSelectionId: 0,
  threadSelectionController: null,
  threadSelectionTargetId: null,
  loadingHistory: false,
  queueSnapshots: new Map(),
  queueGuiding: new Set(),
  compactingThreads: new Set(),
  goalDialogThreadId: null,
  goalMutating: false,
  userInputRequests: new Map(),
  editingQueueItemId: null,
  mode: "queue",
  runStripOpen: false,
  refreshTimer: null,
  workspaceRefreshPromise: null,
  materializingThread: false,
  submittingMessage: false,
  submittingThreadIds: new Set(),
  uploadingFiles: false,
  composerAttachments: [],
  stoppingTurn: false,
  followLatest: true,
  scrollCommandUntil: 0,
  renderingConversation: false,
  eventStream: null,
  messageElements: new Map(),
  executionGroups: new Map(),
  executionIdleTimers: new Map(),
  turnMetrics: new Map(),
  activityTimer: null,
  elapsedTimer: null,
  booted: false,
  resumeTimer: null,
  localThreadSequence: 0,
  editingUserId: null,
  accountLimitsTimer: null,
  serverReachable: false,
  assetVersion: null,
  codexReady: false,
  codexStatusTimer: null,
  workspaceRoot: null,
};

const layout = createWorkbenchLayout({ ui, state, renderRunStrip, renderRecentThreads });
const {
  closeAccountMenu,
  closeRecentThreads,
  closeRunStrip,
  closeThreadMenu,
  closeTopbarOverlays,
} = layout;
const platformEntry = await import(isMobileComposer(navigator) ? "./mobile.js" : "./desktop.js");
const platform = platformEntry.bindPlatformInteractions({ ui, cancelScrollCommand, closeTopbarOverlays });
const { closeSidebar } = platform;
const compactSelects = bindCompactSelects();

boot().catch((error) => {
  if (!state.user) {
    showAuth(false, error.message);
    return;
  }
  state.serverReachable = false;
  setServerStatus(false, "CodexLAN 服务暂时不可用");
  showError(error);
});

async function boot() {
  const response = await fetch("/api/auth/session");
  const body = await response.json().catch(() => ({}));
  if (!response.ok) return showAuth(Boolean(body.setupRequired), body.error || "请登录后继续。");
  await enterWorkspace(body);
}

async function enterWorkspace(session) {
  state.user = session.user;
  state.csrfToken = session.csrfToken;
  state.selectedProjectId = localStorage.getItem(userStorageKey("project")) || null;
  ui.authShell.hidden = true;
  ui.app.hidden = false;
  renderAccount();
  ui.connectionAddress.textContent = location.origin;
  ui.globalConnectionAddress.textContent = location.origin;
  ui.refreshInterval.value = localStorage.getItem(userStorageKey("refresh-seconds")) || "0";
  await refreshWorkspace({ quiet: true });
  configureAutoRefresh();
  state.booted = true;
}

function showAuth(setupRequired, message = "") {
  ui.app.hidden = true;
  ui.authShell.hidden = false;
  ui.loginForm.hidden = setupRequired;
  ui.setupForm.hidden = !setupRequired;
  ui.loginError.textContent = setupRequired ? "" : message;
  ui.setupError.textContent = setupRequired ? message : "";
  ui.authKicker.textContent = setupRequired ? "首次初始化" : "个人工作区";
  ui.authTitle.textContent = setupRequired ? "创建管理员账号" : "登录 CodexLAN";
  ui.authDescription.textContent = setupRequired
    ? "创建这个服务的管理员账号。首次设置只能在服务器电脑上完成。"
    : "进入只属于你的项目与聊天。";
  setTimeout(() => (setupRequired ? ui.setupUsername : ui.loginUsername).focus(), 0);
}

async function loadProjects() {
  const result = await api("/api/projects");
  state.projects = result.projects;
  if (!state.projects.some((project) => project.id === state.selectedProjectId)) {
    state.selectedProjectId = state.projects[0]?.id || null;
  }
  renderProjects();
}

async function loadModels() {
  try {
    const result = await api("/api/models");
    state.models = result.models || [];
  } catch (error) {
    state.models = [];
    showActivity(`模型列表暂不可用：${error.message}`, true);
  }
}

async function loadCollaborationModes() {
  try {
    const result = await api("/api/collaboration-modes");
    state.collaborationModes = result.modes || [];
  } catch (error) {
    state.collaborationModes = [];
    showActivity(`规划模式暂不可用：${error.message}`, true);
  }
}

async function loadAccountRateLimits() {
  try {
    const result = await api("/api/account/rate-limits");
    state.accountRateLimits = result.available === false ? null : result;
  } catch {
    state.accountRateLimits = null;
  }
  renderAccountLimits();
}

function scheduleAccountRateLimitsRefresh() {
  clearTimeout(state.accountLimitsTimer);
  state.accountLimitsTimer = setTimeout(() => {
    state.accountLimitsTimer = null;
    loadAccountRateLimits();
  }, 800);
}

function renderAccountLimits() {
  const limits = accountLimitWindows(state.accountRateLimits);
  const visible = [
    [ui.accountLimitFiveHour, "5H", limits.fiveHour],
    [ui.accountLimitWeek, "周", limits.weekly],
  ].filter(([, , limit]) => limit);
  ui.accountLimits.hidden = visible.length === 0;
  ui.accountLimitFiveHour.hidden = !limits.fiveHour;
  ui.accountLimitWeek.hidden = !limits.weekly;
  for (const [element, label, limit] of visible) {
    const percent = Math.round(limit.usedPercent);
    element.textContent = `${label} ${percent}%`;
    element.style.setProperty("--usage", `${percent}%`);
    const reset = limit.resetsAt ? new Date(limit.resetsAt * 1000).toLocaleString() : "未知";
    element.title = `${label === "5H" ? "5 小时" : "每周"}限额已使用 ${percent}%，重置时间：${reset}`;
  }
}

function rememberThreadTokenUsage(threadId, tokenUsage) {
  const usage = contextWindowUsage(tokenUsage);
  if (!threadId || !usage) return;
  const compact = { last: { totalTokens: usage.usedTokens }, modelContextWindow: usage.contextWindow };
  state.threadTokenUsage.delete(threadId);
  state.threadTokenUsage.set(threadId, compact);
  while (state.threadTokenUsage.size > 200) state.threadTokenUsage.delete(state.threadTokenUsage.keys().next().value);
  if (state.selectedThreadId === threadId) renderContextUsage();
}

function renderContextUsage() {
  const usage = contextWindowUsage(state.threadTokenUsage.get(state.selectedThreadId));
  ui.contextUsage.hidden = !usage;
  if (!usage) return;
  const percent = Math.round(usage.usedPercent);
  ui.contextUsageFill.style.width = `${usage.usedPercent}%`;
  ui.contextUsageLabel.textContent = `窗口 ${percent}%`;
  ui.contextUsage.title = `当前上下文 ${usage.usedTokens.toLocaleString()} / ${usage.contextWindow.toLocaleString()} 令牌`;
  ui.contextUsage.classList.toggle("warn", percent >= 75 && percent < 90);
  ui.contextUsage.classList.toggle("critical", percent >= 90);
}

async function refreshAllThreads() {
  await Promise.all(state.projects.map((project) => refreshProjectThreads(project.id)));
  ensureEventStream();
  renderRunStrip();
}

async function refreshProjectThreads(projectId) {
  const project = state.projects.find((entry) => entry.id === projectId);
  if (project?.available === false) {
    state.threads.set(projectId, []);
    if (projectId === state.selectedProjectId) renderThreads();
    return [];
  }
  const baselineThreads = [...(state.threads.get(projectId) || [])];
  const result = await api(`/api/projects/${encodeURIComponent(projectId)}/threads`);
  const currentThreads = state.threads.get(projectId) || [];
  const merged = mergeRefreshedThreads(baselineThreads, currentThreads, result.threads || []);
  const threads = merged.threads.map((thread) => {
    const normalized = thread;
    const snapshot = state.queueSnapshots.get(thread.id);
    if (!snapshot || snapshot.revision === null || snapshot.revision === undefined || !Number.isInteger(normalized.queueRevision)) return normalized;
    if (normalized.queueRevision >= snapshot.revision) return normalized;
    return { ...normalized, queueCount: snapshot.queue.length, queueRevision: snapshot.revision };
  });
  for (const threadId of merged.removedThreadIds) forgetClientThread(threadId);
  state.threads.set(projectId, threads);
  if (projectId === state.selectedProjectId) renderThreads();
  renderRunStrip();
  return threads;
}

async function selectProject(projectId, { keepSidebarOpen = false, preserveFollowLatest = false, threadId = null } = {}) {
  const project = state.projects.find((entry) => entry.id === projectId);
  if (!project) return;
  const currentThreadId = state.selectedThreadId;
  const changedProject = state.selectedProjectId !== project.id;
  if (changedProject) cancelThreadSelection();
  state.selectedProjectId = project.id;
  if (changedProject) {
    state.selectedThreadId = null;
    clearComposerAttachments();
  }
  if (!keepSidebarOpen) closeSidebar();
  localStorage.setItem(userStorageKey("project"), project.id);
  renderProjects();
  renderThreads();
  renderSettings();
  if (project.available === false) {
    clearThread();
    showActivity("项目目录当前不可用；恢复目录后刷新工作台。", true);
    return;
  }
  const threads = state.threads.get(project.id) || [];
  const requestedThreadId = threadId || (!changedProject ? currentThreadId : null);
  const nextThread = threads.find((thread) => thread.id === requestedThreadId)
    || recentThreadEntries([project], state.threads, 1)[0]?.thread;
  if (nextThread) await selectThread(nextThread.id, { closeNavigation: !keepSidebarOpen, preserveFollowLatest });
  else await createThread({ focusPrompt: false });
}

function cancelThreadSelection() {
  state.threadSelectionController?.abort();
  state.threadSelectionController = null;
  state.threadSelectionId += 1;
  state.threadSelectionTargetId = null;
  ui.conversationStage.classList.remove("thread-switching");
  ui.conversationStage.removeAttribute("aria-busy");
  ui.queuePanel.inert = false;
}

function showThreadSelection(threadId) {
  state.threadSelectionTargetId = threadId;
  ui.conversationStage.classList.add("thread-switching");
  ui.conversationStage.setAttribute("aria-busy", "true");
  ui.queuePanel.inert = true;
  renderThreads();
  updateComposer();
}

async function selectThread(threadId, { closeNavigation = true, preserveFollowLatest = false, mergeHistory = false } = {}) {
  const project = currentProject();
  if (!project || !threadId) return;
  const listedThread = findThread(project.id, threadId);
  if (!preserveFollowLatest) state.followLatest = true;
  if (closeNavigation) closeSidebar();
  if (isLocalThreadId(threadId) && listedThread) {
    cancelThreadSelection();
    state.selectedThreadId = listedThread.id;
    renderThreads();
    renderCurrentThread();
    ui.prompt.focus();
    return;
  }
  const hasCachedHistory = hasCurrentThreadHistory(listedThread);
  if (threadId === state.selectedThreadId && hasCachedHistory && !mergeHistory) {
    ui.prompt.focus();
    return;
  }
  cancelThreadSelection();
  const controller = new AbortController();
  const selectionId = ++state.threadSelectionId;
  state.threadSelectionController = controller;
  if (listedThread) {
    updateThreadInState(project.id, { ...listedThread, accessedAt: new Date().toISOString() });
    if (hasCachedHistory && !mergeHistory) {
      state.selectedThreadId = threadId;
      ensureEventStream();
      renderThreads();
      renderCurrentThread();
    } else if (state.selectedThreadId !== threadId) {
      showThreadSelection(threadId);
    }
  }
  if (hasCachedHistory && !mergeHistory) {
    try {
      const refreshRuntime = isActiveThreadRuntime(listedThread?.runtime)
        ? refreshProjectThreads(project.id)
        : Promise.resolve(null);
      const [result] = await Promise.all([
        api(`/api/threads/${encodeURIComponent(threadId)}?projectId=${encodeURIComponent(project.id)}&history=none`, { signal: controller.signal }),
        refreshRuntime,
      ]);
      if (selectionId === state.threadSelectionId && result.accessedAt) {
        updateThreadInState(project.id, { ...findThread(project.id, threadId), accessedAt: result.accessedAt });
      }
      if (selectionId === state.threadSelectionId && state.selectedThreadId === threadId && isActiveThreadRuntime(listedThread?.runtime)) {
        renderCurrentThread();
      }
    } catch (error) {
      if (error?.name !== "AbortError") throw error;
    } finally {
      if (state.threadSelectionController === controller) state.threadSelectionController = null;
    }
    if (selectionId === state.threadSelectionId) ui.prompt.focus();
    return;
  }
  let result;
  try {
    result = await api(`/api/threads/${encodeURIComponent(threadId)}?projectId=${encodeURIComponent(project.id)}`, { signal: controller.signal });
  } catch (error) {
    if (selectionId === state.threadSelectionId) {
      state.threadSelectionTargetId = null;
      ui.conversationStage.classList.remove("thread-switching");
      ui.conversationStage.removeAttribute("aria-busy");
      ui.queuePanel.inert = false;
      renderThreads();
      updateComposer();
    }
    if (error?.name === "AbortError") return;
    throw error;
  } finally {
    if (state.threadSelectionController === controller) state.threadSelectionController = null;
  }
  if (selectionId !== state.threadSelectionId) return;
  ingestTurnMetrics(result.metrics);
  if (result.tokenUsage) rememberThreadTokenUsage(threadId, result.tokenUsage);
  const selected = currentThread();
  const previous = selected?.id === threadId ? selected : null;
  const turns = mergeHistory && previous
    ? mergeTurnPages(previous.turns || [], result.thread.turns || [])
    : result.thread.turns || [];
  const history = mergeHistory && previous?.history
    ? { ...result.history, hasMore: previous.history.hasMore, before: previous.history.before }
    : result.history;
  updateThreadInState(project.id, {
    ...result.thread,
    turns,
    history,
    syncedUpdatedAt: result.thread.updatedAt ?? listedThread?.updatedAt,
    historyLive: false,
    runtime: result.runtime || result.thread.runtime,
  });
  state.selectedThreadId = threadId;
  state.threadSelectionTargetId = null;
  ui.conversationStage.classList.remove("thread-switching");
  ui.conversationStage.removeAttribute("aria-busy");
  ui.queuePanel.inert = false;
  applyQueueSnapshot(threadId, result.queue, result.queueRevision);
  ensureEventStream();
  renderThreads();
  renderCurrentThread();
}

function clearThread() {
  state.selectedThreadId = null;
  ui.threadName.textContent = "尚未打开聊天";
  ui.openRecentThreads.disabled = true;
  closeRecentThreads();
  ui.openThreadMenu.disabled = true;
  ui.renameThread.disabled = true;
  ui.compactThread.disabled = true;
  ui.deleteThread.disabled = true;
  ui.stop.disabled = true;
  renderConversation([]);
  renderQueue();
  updateComposer();
  renderSettings();
  renderGoalButton();
  ui.jumpLatest.hidden = true;
  renderContextUsage();
}

function currentProject() {
  return state.projects.find((project) => project.id === state.selectedProjectId) || null;
}

function currentThread() {
  return findThread(state.selectedProjectId, state.selectedThreadId);
}

function currentQueue() {
  const threadId = state.selectedThreadId;
  return threadId ? state.queueSnapshots.get(threadId)?.queue || [] : [];
}

function currentRuntime() {
  return currentThread()?.runtime || { activeTurnId: null, status: "idle" };
}

function setElapsedDisplay(element, prefix, timing = {}) {
  const { startedAt, completedAt, durationMs, final } = elapsedTiming(timing);
  element.dataset.elapsedPrefix = prefix;
  setOptionalDataset(element, "elapsedStartedAt", startedAt);
  setOptionalDataset(element, "elapsedCompletedAt", completedAt);
  setOptionalDataset(element, "elapsedDurationMs", durationMs);
  setOptionalDataset(element, "elapsedFinal", final ? "true" : null);
  refreshElapsedDisplay(element);
}

function setOptionalDataset(element, key, value) {
  if (value === null || value === undefined) delete element.dataset[key];
  else element.dataset[key] = String(value);
}

function refreshElapsedDisplay(element) {
  const prefix = element.dataset.elapsedPrefix || "";
  const duration = Number(element.dataset.elapsedDurationMs);
  const startedAt = Number(element.dataset.elapsedStartedAt);
  const completedAt = Number(element.dataset.elapsedCompletedAt);
  let elapsed = Number.isFinite(duration) ? duration : null;
  if (elapsed === null && Number.isFinite(startedAt)) elapsed = Math.max(0, (Number.isFinite(completedAt) ? completedAt : Date.now()) - startedAt);
  if (elapsed === null && !prefix) {
    element.textContent = "";
    element.hidden = true;
    return;
  }
  element.hidden = false;
  const formatted = element.dataset.elapsedFinal === "true" ? formatDuration(elapsed) : formatElapsed(elapsed);
  element.textContent = elapsed === null ? prefix : prefix ? `${prefix} · ${formatted}` : formatted;
}

function refreshElapsedDisplays() {
  document.querySelectorAll("[data-elapsed-prefix]").forEach(refreshElapsedDisplay);
}

function syncElapsedTimer() {
  const visibleExecutionRunning = [...state.executionGroups.values()]
    .some((group) => [...group.items.values()].some((entry) => executionPresentation(entry.item).tone === "running"));
  const active = isActiveThreadRuntime(currentRuntime())
    || visibleExecutionRunning
    || state.projects.some((project) => (state.threads.get(project.id) || []).some((thread) => isActiveThreadRuntime(thread.runtime)));
  if (active && !state.elapsedTimer) state.elapsedTimer = setInterval(refreshElapsedDisplays, 1000);
  if (!active && state.elapsedTimer) {
    clearInterval(state.elapsedTimer);
    state.elapsedTimer = null;
  }
  refreshElapsedDisplays();
}

function mergeTurnMetric(turnId, metric = {}) {
  if (!turnId) return null;
  const current = state.turnMetrics.get(turnId) || { items: {} };
  const values = Object.fromEntries(Object.entries(metric).filter(([key, value]) => key !== "items" && value !== null && value !== undefined));
  const items = { ...(current.items || {}) };
  for (const [itemId, itemMetric] of Object.entries(metric.items || {})) {
    items[itemId] = { ...(items[itemId] || {}), ...itemMetric };
  }
  const merged = {
    ...current,
    ...values,
    items,
  };
  state.turnMetrics.delete(turnId);
  state.turnMetrics.set(turnId, merged);
  while (state.turnMetrics.size > 160) state.turnMetrics.delete(state.turnMetrics.keys().next().value);
  return merged;
}

function mergeItemMetric(turnId, itemId, metric = {}) {
  if (!turnId || !itemId) return null;
  const turn = state.turnMetrics.get(turnId) || { items: {} };
  const values = Object.fromEntries(Object.entries(metric).filter(([, value]) => value !== null && value !== undefined));
  const item = { ...(turn.items?.[itemId] || {}), ...values };
  mergeTurnMetric(turnId, { items: { [itemId]: item } });
  return item;
}

function ingestTurnMetrics(metrics) {
  if (!metrics || typeof metrics !== "object") return;
  for (const [turnId, metric] of Object.entries(metrics)) mergeTurnMetric(turnId, metric);
}

function turnWithMetrics(turn) {
  const metric = state.turnMetrics.get(turn.id);
  if (!metric) return turn;
  const timed = { ...turn };
  for (const key of ["startedAt", "completedAt", "durationMs"]) {
    if (metric[key] !== null && metric[key] !== undefined) timed[key] = metric[key];
  }
  const items = restoreMissingExecutionItems(turn.items || [], metric.items);
  timed.items = items.map((item) => {
    const itemMetric = metric.items?.[item.id];
    return itemMetric ? mergeHistoricalExecutionItem(item, itemMetric, turn.status) : item;
  });
  return timed;
}

function renderProjects() {
  ui.projectList.replaceChildren();
  for (const project of state.projects) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "project-item";
    if (project.id === state.selectedProjectId) button.classList.add("active");
    if (project.available === false) button.classList.add("unavailable");
    const name = document.createElement("strong");
    name.textContent = project.name;
    const path = document.createElement("small");
    path.textContent = project.available === false ? `目录不可用 · ${project.path}` : project.path;
    button.append(name, path);
    button.addEventListener("click", () => selectProject(project.id, { keepSidebarOpen: true }).catch(showError));
    ui.projectList.append(button);
  }
  const projectName = currentProject()?.name || "尚未选择";
  ui.desktopProjectName.textContent = projectName;
  const canCreateThread = Boolean(currentProject() && currentProject().available !== false);
  ui.newThread.disabled = !canCreateThread;
  ui.quickNewThread.disabled = !canCreateThread;
  renderRecentThreads();
}

function renderThreads() {
  ui.threadList.replaceChildren();
  const project = currentProject();
  if (!project) return;
  if (project.available === false) {
    const unavailable = document.createElement("p");
    unavailable.className = "sidebar-empty error";
    unavailable.textContent = "项目目录当前不可用";
    ui.threadList.append(unavailable);
    return;
  }
  const threads = state.threads.get(project.id) || [];
  if (!threads.length) {
    const empty = document.createElement("p");
    empty.className = "sidebar-empty";
    empty.textContent = "这个项目还没有聊天";
    ui.threadList.append(empty);
    renderRecentThreads();
    return;
  }
  for (const thread of threads) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "thread-item";
    if (thread.id === state.selectedThreadId) button.classList.add("active");
    if (thread.id === state.threadSelectionTargetId) button.classList.add("loading");
    if (isActiveThreadRuntime(thread.runtime)) button.classList.add("running");
    else if (isActiveGoal(thread.goal)) button.classList.add("goal-active");
    const title = document.createElement("strong");
    title.textContent = threadDisplayName(thread);
    const details = document.createElement("small");
    const queueCount = thread.queueCount || 0;
    if (thread.id === state.threadSelectionTargetId) details.textContent = "打开中…";
    else if (isActiveThreadRuntime(thread.runtime)) setElapsedDisplay(details, "执行中", thread.runtime);
    else if (isActiveGoal(thread.goal)) details.textContent = "目标续跑中";
    else details.textContent = queueCount ? `队列 ${queueCount}` : "空闲";
    button.append(title, details);
    button.addEventListener("click", () => selectThread(thread.id).catch(showError));
    ui.threadList.append(button);
  }
  renderRecentThreads();
}

function renderRecentThreads() {
  const entries = recentThreadEntries(state.projects, state.threads, 30);
  ui.openRecentThreads.disabled = !currentThread() || entries.length === 0;
  const signature = JSON.stringify(entries.map(({ project, thread }) => [
    project.id,
    project.name,
    thread.id,
    threadDisplayName(thread),
    thread.accessedAt,
    isActiveThreadRuntime(thread.runtime),
    thread.goal?.status || null,
    thread.id === state.selectedThreadId,
    thread.id === state.threadSelectionTargetId,
  ]));
  if (ui.recentThreadMenu.dataset.signature === signature) return;
  const scrollTop = ui.recentThreadMenu.scrollTop;
  ui.recentThreadMenu.dataset.signature = signature;
  ui.recentThreadMenu.replaceChildren();
  for (const { project, thread } of entries) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "recent-thread-item";
    if (thread.id === state.selectedThreadId) button.classList.add("active");
    if (thread.id === state.threadSelectionTargetId) button.classList.add("loading");
    if (isActiveThreadRuntime(thread.runtime)) button.classList.add("running");
    else if (isActiveGoal(thread.goal)) button.classList.add("goal-active");
    const title = document.createElement("strong");
    title.textContent = threadDisplayName(thread);
    const projectName = document.createElement("small");
    projectName.textContent = thread.id === state.threadSelectionTargetId ? `${project.name} · 打开中…` : project.name;
    button.append(title, projectName);
    button.addEventListener("click", async () => {
      closeRecentThreads();
      if (project.id === state.selectedProjectId && thread.id === state.selectedThreadId) return;
      await selectProject(project.id, { threadId: thread.id });
    });
    ui.recentThreadMenu.append(button);
  }
  ui.recentThreadMenu.scrollTop = scrollTop;
}

function renderRunStrip() {
  ui.runStrip.replaceChildren();
  const running = [];
  for (const project of state.projects) {
    for (const thread of state.threads.get(project.id) || []) {
      if (isActiveThreadRuntime(thread.runtime) || isActiveGoal(thread.goal) || thread.queueCount) running.push({ project, thread });
    }
  }
  if (!running.length) {
    state.runStripOpen = false;
    ui.runStatus.hidden = true;
    ui.runStrip.hidden = true;
    ui.runStatus.setAttribute("aria-expanded", "false");
    syncElapsedTimer();
    return;
  }
  const activeCount = running.filter(({ thread }) => isActiveThreadRuntime(thread.runtime)).length;
  const goalCount = running.filter(({ thread }) => !isActiveThreadRuntime(thread.runtime) && isActiveGoal(thread.goal)).length;
  const queuedCount = running.reduce((total, { thread }) => total + (thread.queueCount || 0), 0);
  ui.runStatus.hidden = false;
  ui.runStatus.classList.toggle("queue-only", activeCount === 0);
  const statusText = activeCount
    ? `${activeCount} 个聊天正在运行`
    : goalCount ? `${goalCount} 个目标持续执行中` : `${queuedCount} 个任务正在排队`;
  ui.runStatusLabel.textContent = statusText;
  ui.runStatus.setAttribute("aria-label", statusText);
  ui.runStatus.title = statusText;
  ui.runStatus.setAttribute("aria-expanded", String(state.runStripOpen));
  ui.runStrip.hidden = !state.runStripOpen;
  for (const { project, thread } of running) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "run-card";
    if (thread.id === state.selectedThreadId) button.classList.add("active");
    const dot = document.createElement("span");
    dot.className = `run-card-dot${isActiveThreadRuntime(thread.runtime) ? "" : isActiveGoal(thread.goal) ? " goal" : " queue"}`;
    const words = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = `${project.name} · ${threadDisplayName(thread)}`;
    const detail = document.createElement("small");
    if (isActiveThreadRuntime(thread.runtime)) setElapsedDisplay(detail, "正在执行", thread.runtime);
    else if (isActiveGoal(thread.goal)) detail.textContent = thread.queueCount ? `目标持续执行 · 队列 ${thread.queueCount}` : "目标持续执行中";
    else detail.textContent = `等待队列 ${thread.queueCount}`;
    words.append(title, detail);
    button.append(dot, words);
    button.addEventListener("click", async () => {
      closeRunStrip();
      await selectProject(project.id, { threadId: thread.id });
    });
    ui.runStrip.append(button);
  }
  syncElapsedTimer();
}

function renderSettings() {
  const thread = currentThread();
  const settings = thread?.settings || {};
  const selectedModel = selectedModelForThread(thread);
  fillOptions(ui.model, state.models, (model) => model.displayName || model.id, selectedModel?.id, "当前模型不可用");
  fillOptions(ui.composerModel, state.models, compactModelLabel, selectedModel?.id, "没有可用模型");
  const efforts = selectedModel?.supportedReasoningEfforts || [];
  const selectedEffort = settings.effort || selectedModel?.defaultReasoningEffort || efforts[0]?.reasoningEffort;
  fillOptions(ui.effort, efforts, (effort) => reasoningLabel(effort.reasoningEffort), selectedEffort, "默认");
  fillCompactEffortOptions(ui.composerEffort, efforts, selectedEffort);
  const tiers = selectedModel?.serviceTiers || [];
  const selectedTier = settings.serviceTier || "";
  fillTierOptions(ui.tier, tiers, selectedTier);
  fillCompactTierOptions(ui.composerTier, tiers, selectedTier);
  ui.summary.value = ["auto", "concise", "detailed", "none"].includes(settings.summary) ? settings.summary : "detailed";
  const planAvailable = state.collaborationModes.some((entry) => entry.mode === "plan");
  const planActive = settings.collaborationMode === "plan";
  ui.planMode.hidden = !planAvailable;
  ui.planMode.classList.toggle("active", planActive);
  ui.planMode.setAttribute("aria-pressed", String(planActive));
  ui.planMode.setAttribute("aria-label", planActive ? "退出规划模式" : "进入规划模式");
  ui.planMode.title = planActive ? "退出规划模式" : "进入规划模式；也可输入 /plan";
  ui.tierField.hidden = !selectedModel;
  const disabled = !thread || !state.models.length;
  ui.model.disabled = disabled;
  ui.composerModel.disabled = disabled;
  ui.effort.disabled = disabled || !efforts.length;
  ui.composerEffort.disabled = disabled || !efforts.length;
  ui.tier.disabled = disabled || !tiers.length;
  ui.composerTier.disabled = disabled || !tiers.length;
  compactSelects.refresh();
  ui.summary.disabled = !thread;
  ui.planMode.disabled = !thread || isActiveThreadRuntime(currentRuntime());
  ui.configThreadName.textContent = thread ? `当前聊天：${threadDisplayName(thread)}` : "请先选择聊天。";
  const selectedTierEntry = tiers.find((tier) => tier.id === selectedTier);
  ui.tierDescription.textContent = selectedTierEntry
    ? `当前速度档位：${serviceTierLabel(selectedTierEntry)}。`
    : tiers.length
      ? "标准（默认）：未请求加速服务档位。"
      : "该模型不提供可选速度档位。";
}

function selectedModelForThread(thread) {
  const modelId = thread?.settings?.model;
  return state.models.find((model) => model.id === modelId)
    || state.models.find((model) => model.isDefault)
    || state.models[0];
}

function fillOptions(select, entries, label, selectedId, emptyLabel) {
  select.replaceChildren();
  if (!entries.length) {
    const option = new Option(emptyLabel, "");
    select.append(option);
    return;
  }
  for (const entry of entries) {
    const value = entry.id || entry.reasoningEffort;
    const option = new Option(label(entry), value, false, value === selectedId);
    select.append(option);
  }
}

function fillTierOptions(select, tiers, selectedId) {
  select.replaceChildren();
  select.append(new Option("标准（默认）", "", false, !selectedId));
  for (const tier of tiers) {
    const option = new Option(serviceTierLabel(tier), tier.id, false, tier.id === selectedId);
    select.append(option);
  }
}

function fillCompactTierOptions(select, tiers, selectedId) {
  select.replaceChildren();
  select.append(new Option("标准", "", false, !selectedId));
  for (const tier of tiers) select.append(new Option(serviceTierLabel(tier), tier.id, false, tier.id === selectedId));
}

function fillCompactEffortOptions(select, efforts, selectedId) {
  select.replaceChildren();
  if (!efforts.length) {
    select.append(new Option("推理", ""));
    return;
  }
  for (const effort of efforts) {
    const value = effort.reasoningEffort;
    select.append(new Option(reasoningLabel(value), value, false, value === selectedId));
  }
}

function reasoningLabel(effort) {
  return ({ low: "低", medium: "中", high: "高", xhigh: "极高", max: "最高", ultra: "极限" })[effort] || "默认";
}

function compactModelLabel(model) {
  const label = String(model?.displayName || model?.id || "模型");
  return label.replace(/^gpt[-\s]*/i, "");
}

function serviceTierLabel(tier) {
  const value = String(tier?.id || tier?.name || "").toLowerCase();
  return ({ standard: "标准", fast: "快速", priority: "优先", flex: "弹性" })[value] || "服务档";
}

function bindCompactSelects() {
  const controls = [...document.querySelectorAll("[data-compact-select]")].map((root) => {
    const select = root.querySelector("select");
    const trigger = root.querySelector(".compact-select-trigger");
    const menu = root.querySelector(".compact-select-menu");
    const label = root.getAttribute("aria-label") || "选项";
    trigger.setAttribute("aria-label", label);
    const close = () => {
      menu.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
    };
    const refresh = () => {
      const selected = select.selectedOptions[0];
      trigger.querySelector("span").textContent = selected?.textContent || label;
      trigger.disabled = select.disabled;
      menu.replaceChildren();
      for (const option of select.options) {
        const item = document.createElement("button");
        item.type = "button";
        item.role = "option";
        item.textContent = option.textContent;
        item.disabled = option.disabled;
        item.setAttribute("aria-selected", String(option.selected));
        item.addEventListener("click", () => {
          select.value = option.value;
          select.dispatchEvent(new Event("change", { bubbles: true }));
          refresh();
          close();
        });
        menu.append(item);
      }
    };
    trigger.addEventListener("click", () => {
      const opening = menu.hidden;
      controls.forEach((control) => control.close());
      if (!opening || trigger.disabled) return;
      menu.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
    });
    trigger.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      close();
      trigger.focus();
    });
    select.addEventListener("change", refresh);
    new MutationObserver(refresh).observe(select, { childList: true, subtree: true });
    refresh();
    return { root, close, refresh };
  });
  document.addEventListener("click", (event) => {
    if (!controls.some((control) => control.root.contains(event.target))) controls.forEach((control) => control.close());
  });
  return { refresh: () => controls.forEach((control) => control.refresh()) };
}

function renderCurrentThread({ messages = true } = {}) {
  const thread = currentThread();
  if (!thread) return clearThread();
  ui.threadName.textContent = threadDisplayName(thread);
  ui.openRecentThreads.disabled = false;
  renderRecentThreads();
  renderThreadActions();
  ui.stop.disabled = !currentRuntime().activeTurnId;
  if (messages) renderConversation(thread.turns || []);
  renderQueue();
  updateComposer();
  renderSettings();
  renderGoalButton();
  renderContextUsage();
  syncElapsedTimer();
}

function renderThreadActions() {
  const thread = currentThread();
  const local = thread && isLocalThreadId(thread.id);
  const active = isActiveThreadRuntime(currentRuntime());
  const goalActive = isActiveGoal(thread?.goal);
  const compacting = thread && state.compactingThreads.has(thread.id);
  const submitting = state.submittingMessage || (thread && state.submittingThreadIds.has(thread.id));
  const switching = Boolean(state.threadSelectionTargetId);
  ui.openThreadMenu.disabled = !thread || switching || submitting;
  ui.renameThread.disabled = !thread || switching || submitting;
  ui.compactThread.disabled = !thread || local || active || goalActive || compacting || submitting || !state.codexReady || switching;
  ui.compactThread.textContent = compacting ? "正在压缩上下文…" : "压缩上下文";
  ui.deleteThread.disabled = !thread || active || goalActive || compacting || submitting || switching;
}

function renderGoalButton() {
  const thread = currentThread();
  const presentation = goalPresentation(thread?.goal);
  ui.goalMode.dataset.tone = presentation.tone;
  ui.goalMode.classList.toggle("active", presentation.status === "active");
  ui.goalMode.setAttribute("aria-pressed", String(presentation.status === "active"));
  ui.goalMode.setAttribute("aria-label", presentation.exists ? presentation.label : "管理目标");
  ui.goalMode.title = presentation.exists
    ? `${presentation.label}：${presentation.objective}`
    : "创建或管理目标；也可输入 /goal";
}

function renderConversation(turns) {
  const shouldFollow = state.followLatest;
  const previousScrollTop = ui.conversation.scrollTop;
  const liveMetricsByTurn = captureRenderedExecutionItems();
  state.renderingConversation = true;
  ui.conversation.replaceChildren();
  state.messageElements.clear();
  state.executionGroups.clear();
  if (currentThread()?.history?.hasMore) {
    const loadOlder = document.createElement("button");
    loadOlder.className = "history-loader";
    loadOlder.type = "button";
    loadOlder.disabled = state.loadingHistory;
    loadOlder.textContent = state.loadingHistory ? "正在加载…" : "加载更早记录";
    loadOlder.addEventListener("click", () => loadOlderTurns().catch(showError));
    ui.conversation.append(loadOlder);
  }
  for (const rawTurn of turns) {
    let turn = reconcileStaleExecutionTurn(turnWithMetrics(rawTurn), currentRuntime());
    const liveMetrics = liveMetricsByTurn.get(turn.id);
    if (liveMetrics) turn = { ...turn, items: restoreMissingExecutionItems(turn.items || [], liveMetrics) };
    appendConversationDate(turn.id, turnTimestamp(turn));
    const items = turn.items || [];
    let userMessageSeen = false;
    for (const item of items) {
      if (isExecutionItem(item)) {
        upsertExecutionItem(turn.id, item, { turnStatus: turn.status, timing: turn });
      } else {
        const guide = item.type === "userMessage" && userMessageSeen;
        renderHistoryItem(item, { turnId: turn.id, guide });
        if (item.type === "userMessage") userMessageSeen = true;
      }
    }
    renderTurnPlan(turn.id, state.turnMetrics.get(turn.id)?.plan, turn.status);
  }
  for (const request of state.userInputRequests.values()) {
    if (request.threadId === state.selectedThreadId) renderUserInputRequest(request);
  }
  if (!ui.conversation.childElementCount) renderEmptyConversation();
  const activeTurnId = currentRuntime().activeTurnId;
  if (activeTurnId) scheduleTurnActivity(activeTurnId, 300);
  state.renderingConversation = false;
  if (shouldFollow) scrollToLatest(false);
  else requestAnimationFrame(() => {
    ui.conversation.scrollTop = Math.min(previousScrollTop, Math.max(0, ui.conversation.scrollHeight - ui.conversation.clientHeight));
    updateJumpLatest();
  });
}

function renderUserInputRequest(request) {
  if (!request?.requestId || request.threadId !== state.selectedThreadId) return;
  removeUserInputCard(request.requestId);
  ui.conversation.querySelector(".empty-state")?.remove();
  const form = document.createElement("form");
  form.className = "user-input-card";
  form.dataset.requestId = request.requestId;
  const heading = document.createElement("div");
  heading.className = "user-input-heading";
  const title = document.createElement("strong");
  title.textContent = "需要你的回答";
  const note = document.createElement("span");
  note.textContent = "回答后 Codex 会继续当前任务";
  heading.append(title, note);
  const controls = [];
  form.append(heading);
  for (const [index, question] of request.questions.entries()) {
    const field = document.createElement("fieldset");
    field.className = "user-input-question";
    const legend = document.createElement("legend");
    const header = document.createElement("span");
    header.textContent = question.header;
    const prompt = document.createElement("strong");
    prompt.textContent = question.question;
    legend.append(header, prompt);
    field.append(legend);
    const name = `user-input-${request.requestId}-${index}`;
    if (question.options.length) {
      for (const option of question.options) field.append(userInputOption(name, option.label, option.description));
      let otherText = null;
      if (question.isOther) {
        const other = userInputOption(name, "", "", true);
        other.querySelector("strong").textContent = "其他";
        otherText = document.createElement("input");
        otherText.className = "user-input-other";
        otherText.type = question.isSecret ? "password" : "text";
        otherText.placeholder = "输入你的回答";
        otherText.autocomplete = "off";
        otherText.disabled = true;
        other.append(otherText);
        field.append(other);
      }
      const radios = [...field.querySelectorAll('input[type="radio"]')];
      for (const radio of radios) {
        radio.required = true;
        radio.addEventListener("change", () => {
          if (!otherText) return;
          const selectedOther = radio.checked && radio.dataset.other === "true";
          if (selectedOther) {
            otherText.disabled = false;
            otherText.required = true;
            otherText.focus();
          } else if (radio.checked) {
            otherText.required = false;
            otherText.disabled = true;
          }
        });
      }
      controls.push({ question, field, otherText });
    } else {
      const input = document.createElement("input");
      input.className = "user-input-text";
      input.type = question.isSecret ? "password" : "text";
      input.autocomplete = "off";
      input.required = true;
      field.append(input);
      controls.push({ question, input });
    }
    form.append(field);
  }
  const footer = document.createElement("div");
  footer.className = "user-input-footer";
  const error = document.createElement("p");
  error.className = "form-error";
  const submit = document.createElement("button");
  submit.className = "primary-button";
  submit.type = "submit";
  submit.textContent = "提交回答";
  footer.append(error, submit);
  form.append(footer);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitUserInputRequest(request, form, controls, error, submit);
  });
  ui.conversation.append(form);
  placeTurnContent(request.turnId, { root: form });
  followNewContent();
}

function userInputOption(name, label, description, other = false) {
  const option = document.createElement("label");
  option.className = "user-input-option";
  const input = document.createElement("input");
  input.type = "radio";
  input.name = name;
  input.value = label;
  if (other) input.dataset.other = "true";
  const copy = document.createElement("span");
  const title = document.createElement("strong");
  title.textContent = label;
  const detail = document.createElement("small");
  detail.textContent = description;
  copy.append(title, detail);
  option.append(input, copy);
  return option;
}

async function submitUserInputRequest(request, form, controls, error, submit) {
  const project = currentProject();
  if (!project || request.threadId !== state.selectedThreadId) return;
  const answers = {};
  for (const control of controls) {
    let answer;
    if (control.input) {
      answer = control.input.value.trim();
    } else {
      const selected = control.field.querySelector('input[type="radio"]:checked');
      answer = selected?.dataset.other === "true" ? control.otherText?.value.trim() : selected?.value.trim();
    }
    if (!answer) {
      error.textContent = `请回答“${control.question.header}”。`;
      return;
    }
    answers[control.question.id] = { answers: [answer] };
  }
  error.textContent = "";
  submit.textContent = "正在提交…";
  for (const element of form.elements) element.disabled = true;
  try {
    await api(`/api/threads/${encodeURIComponent(request.threadId)}/user-input/${encodeURIComponent(request.requestId)}`, {
      method: "POST",
      body: { projectId: project.id, answers },
    });
    state.userInputRequests.delete(request.requestId);
    form.remove();
    scheduleTurnActivity(request.turnId, 0);
  } catch (submitError) {
    for (const element of form.elements) element.disabled = false;
    submit.textContent = "提交回答";
    error.textContent = submitError.message;
  }
}

function removeUserInputCard(requestId) {
  for (const card of ui.conversation.querySelectorAll(".user-input-card")) {
    if (card.dataset.requestId === requestId) card.remove();
  }
}

function removeUserInputRequest(requestId) {
  state.userInputRequests.delete(String(requestId));
  removeUserInputCard(String(requestId));
}

function syncUserInputRequests(threadId, requests) {
  for (const [requestId, request] of state.userInputRequests) {
    if (request.threadId === threadId) state.userInputRequests.delete(requestId);
  }
  for (const request of requests || []) state.userInputRequests.set(String(request.requestId), request);
  if (state.selectedThreadId !== threadId) return;
  for (const card of ui.conversation.querySelectorAll(".user-input-card")) card.remove();
  for (const request of state.userInputRequests.values()) {
    if (request.threadId === threadId) renderUserInputRequest(request);
  }
}

function captureRenderedExecutionItems() {
  const captured = new Map();
  for (const [turnId, group] of state.executionGroups) {
    const items = {};
    for (const entry of group.items.values()) {
      const item = entry.item;
      if (!item?.id) continue;
      items[item.id] = {
        type: item.type,
        status: item.status,
        startedAt: item.startedAt,
        completedAt: item.completedAt,
        durationMs: item.durationMs,
        snapshot: { ...item },
      };
    }
    if (Object.keys(items).length) captured.set(turnId, items);
  }
  return captured;
}

function mergeTurnPages(existing, incoming) {
  const replacements = new Map(incoming.map((turn) => [turn.id, turn]));
  const merged = existing.map((turn) => replacements.get(turn.id) || turn);
  const known = new Set(merged.map((turn) => turn.id));
  for (const turn of incoming) {
    if (!known.has(turn.id)) merged.push(turn);
  }
  return merged;
}

async function loadOlderTurns() {
  const project = currentProject();
  const thread = currentThread();
  const before = thread?.history?.before;
  if (!project || !thread || !before || state.loadingHistory) return;
  state.loadingHistory = true;
  renderConversation(thread.turns || []);
  const previousHeight = ui.conversation.scrollHeight;
  const previousTop = ui.conversation.scrollTop;
  try {
    const result = await api(`/api/threads/${encodeURIComponent(thread.id)}?projectId=${encodeURIComponent(project.id)}&before=${encodeURIComponent(before)}`);
    if (state.selectedThreadId !== thread.id) return;
    ingestTurnMetrics(result.metrics);
    const selected = currentThread();
    const turns = [...(result.thread.turns || []), ...(selected.turns || [])];
    updateThreadInState(project.id, {
      ...selected,
      turns,
      history: result.history,
      runtime: result.runtime || selected.runtime,
    });
    state.followLatest = false;
    state.loadingHistory = false;
    renderConversation(turns);
    requestAnimationFrame(() => {
      ui.conversation.scrollTop = previousTop + Math.max(0, ui.conversation.scrollHeight - previousHeight);
      updateJumpLatest();
    });
  } finally {
    if (state.loadingHistory) {
      state.loadingHistory = false;
      if (state.selectedThreadId === thread.id) renderConversation(currentThread()?.turns || []);
    }
  }
}

function renderHistoryItem(item, { turnId = null, guide = false } = {}) {
  if (item.type === "userMessage") {
    const message = addMessage(item.id, guide ? "引导" : "你", userMessageText(item), guide ? "guide" : "user", messageTimestamp(item, turnId));
    if (turnId) message.root.dataset.turnId = turnId;
    if (item.clientPending) message.root.dataset.clientPending = "true";
    else message.root.removeAttribute("data-client-pending");
    placeTurnContent(turnId, message, { beforeExecution: !guide });
    return message;
  } else if (item.type === "agentMessage" || item.type === "plan") {
    const message = item.type === "agentMessage" && item.phase === "commentary"
      ? addProgressMessage(item.id, item.text || "")
      : addMessage(item.id, "Codex", item.text || "", "assistant", messageTimestamp(item, turnId));
    placeTurnContent(turnId, message);
    return message;
  }
  return null;
}

function placeTurnContent(turnId, message, { beforeExecution = false } = {}) {
  const group = turnId ? state.executionGroups.get(turnId) : null;
  if (!message?.root) return;
  if (!group?.list) {
    const activity = turnId ? state.messageElements.get(turnActivityId(turnId)) : null;
    if (beforeExecution && activity?.root !== message.root && activity?.root?.parentNode === ui.conversation) {
      activity.root.before(message.root);
    }
    return;
  }
  group.activeCommandBatch = null;
  if (beforeExecution) {
    const entries = [...group.items.values()];
    const firstExecution = entries.map((entry) => entry.root).find((root) => root.parentNode === group.list);
    if (firstExecution) firstExecution.before(message.root);
    else group.list.append(message.root);
    return;
  }
  group.list.append(message.root);
}

function userMessageText(item) {
  return (item.content || []).filter((part) => part.type === "text").map((part) => part.text).join("\n");
}

function turnTimestamp(turn) {
  return timestampMilliseconds(turn?.startedAt)
    || (turn?.items || []).map((item) => messageTimestamp(item, turn?.id)).find(Boolean)
    || timestampMilliseconds(turn?.completedAt);
}

function messageTimestamp(item, turnId) {
  const turnMetric = state.turnMetrics.get(turnId) || {};
  const itemMetric = turnMetric.items?.[item?.id] || {};
  const storedTurn = currentThread()?.turns?.find((turn) => turn.id === turnId) || {};
  const storedItem = storedTurn.items?.find((entry) => entry.id === item?.id) || {};
  const message = { ...storedItem, ...item, ...itemMetric };
  const turn = { ...storedTurn, ...turnMetric };
  if (message.type === "userMessage") {
    return timestampMilliseconds(message.createdAt)
      || timestampMilliseconds(message.startedAt)
      || timestampMilliseconds(message.completedAt)
      || timestampMilliseconds(turn.startedAt);
  }
  return timestampMilliseconds(message.completedAt)
    || timestampMilliseconds(message.createdAt)
    || timestampMilliseconds(message.startedAt)
    || timestampMilliseconds(turn.completedAt)
    || timestampMilliseconds(turn.startedAt);
}

function appendConversationDate(turnId, timestamp) {
  const key = conversationDateKey(timestamp);
  if (!key || ui.conversation.querySelector(`.conversation-date[data-date-key="${key}"]`)) return;
  const separator = document.createElement("div");
  separator.className = "conversation-date";
  separator.dataset.dateKey = key;
  if (turnId) separator.dataset.turnId = turnId;
  separator.setAttribute("role", "separator");
  const time = document.createElement("time");
  time.dateTime = key;
  time.textContent = formatConversationDate(timestamp);
  time.title = formatMessageDateTime(timestamp);
  separator.setAttribute("aria-label", time.title);
  separator.append(time);
  ui.conversation.append(separator);
}

function upsertExecutionItem(turnId, item, { turnStatus = "inProgress", timing, outputDelta = null } = {}) {
  if (!turnId || !item?.id) return;
  const group = ensureExecutionGroup(turnId, turnStatus, timing);
  let entry = group.items.get(item.id);
  const existingEntry = Boolean(entry);
  if (!entry) {
    const root = document.createElement("details");
    root.className = "execution-entry";
    const summary = document.createElement("summary");
    const kind = document.createElement("span");
    kind.className = "execution-kind";
    const title = document.createElement("strong");
    const status = document.createElement("span");
    status.className = "execution-item-status";
    summary.append(kind, title, status);
    const body = document.createElement("pre");
    root.append(summary, body);
    let commandBatch = null;
    if (item.type === "commandExecution") {
      commandBatch = ensureCommandBatch(group);
      commandBatch.list.append(root);
    } else {
      group.activeCommandBatch = null;
      group.list.append(root);
    }
    entry = { root, kind, title, status, body, item: {}, autoOpened: false, commandBatch, pendingBody: null };
    if (commandBatch) commandBatch.items.add(entry);
    summary.addEventListener("click", (event) => {
      if (entry.item.type !== "fileChange") return;
      event.preventDefault();
      openFileChangePreview(entry.item);
    });
    root.addEventListener("toggle", () => {
      if (root.open) renderDeferredExecutionBody(entry);
    });
    group.items.set(item.id, entry);
  }
  const previousItem = entry.item;
  entry.item = { ...previousItem, ...item };
  for (const key of ["startedAt", "completedAt", "durationMs"]) {
    if ((entry.item[key] === null || entry.item[key] === undefined) && previousItem[key] !== null && previousItem[key] !== undefined) {
      entry.item[key] = previousItem[key];
    }
  }
  const incrementalOutput = existingEntry && entry.item.type === "commandExecution" && typeof outputDelta === "string";
  let presentation = executionPresentation(entry.item, { includeBody: !incrementalOutput });
  if (entry.item.startedAt != null || entry.item.completedAt != null || entry.item.durationMs != null) {
    mergeItemMetric(turnId, item.id, {
      type: entry.item.type,
      status: entry.item.status,
      startedAt: entry.item.startedAt,
      completedAt: entry.item.completedAt,
      durationMs: entry.item.durationMs,
    });
  }
  entry.kind.textContent = presentation.kind;
  renderExecutionTitle(entry.title, presentation.title, entry.item);
  setElapsedDisplay(entry.status, "", entry.item);
  entry.status.title = presentation.status;
  entry.status.setAttribute("aria-label", `${presentation.status}用时`);
  const renderBodyNow = entry.root.open || (entry.item.type === "reasoning" && presentation.tone === "running");
  if (!renderBodyNow) {
    entry.pendingBody = incrementalOutput
      ? limitExecutionDetail(executionItemText(entry.item), MAX_RENDERED_COMMAND_OUTPUT, true)
      : presentation.body || "";
    entry.body.replaceChildren();
    entry.ansiStream = null;
  } else if (incrementalOutput) {
    if (!entry.ansiStream) {
      entry.ansiStream = renderAnsiOutput(entry.body, limitExecutionDetail(executionItemText(entry.item), MAX_RENDERED_COMMAND_OUTPUT, true));
      entry.pendingBody = null;
    } else {
      const separator = previousItem.aggregatedOutput ? "" : "\n\n";
      entry.ansiStream = appendAnsiOutput(entry.body, `${separator}${outputDelta}`, entry.ansiStream, MAX_RENDERED_COMMAND_OUTPUT);
    }
    entry.body.classList.toggle("live-output-truncated", entry.ansiStream.truncated);
  } else {
    entry.ansiStream = renderAnsiOutput(entry.body, presentation.body || "");
    entry.pendingBody = null;
    entry.body.classList.remove("live-output-truncated");
  }
  const isFileChange = entry.item.type === "fileChange";
  const hasBody = incrementalOutput ? entry.ansiStream.renderedLength > 0 : Boolean(presentation.body);
  entry.body.hidden = isFileChange || !hasBody;
  entry.root.classList.toggle("empty", !isFileChange && !hasBody);
  entry.root.classList.toggle("diff-preview-entry", isFileChange);
  entry.root.classList.toggle("failed", presentation.tone === "failed");
  entry.root.classList.toggle("running", presentation.tone === "running");
  entry.root.classList.toggle("stopped", presentation.tone === "stopped");
  entry.root.classList.toggle("complete", presentation.tone === "complete");
  if (entry.commandBatch) updateCommandBatch(entry.commandBatch);
  if (entry.item.type === "reasoning" && presentation.body && presentation.tone === "running") {
    for (const other of group.items.values()) {
      if (other !== entry && other.autoOpened) {
        other.root.open = false;
        other.autoOpened = false;
      }
    }
    entry.root.open = true;
    entry.autoOpened = true;
  } else if (entry.autoOpened && presentation.tone !== "running") {
    entry.root.open = false;
    entry.autoOpened = false;
  }
  updateExecutionGroup(group, turnStatus);
  if (!state.renderingConversation) syncElapsedTimer();
  followNewContent();
}

function renderDeferredExecutionBody(entry) {
  if (entry.pendingBody === null) return;
  entry.ansiStream = renderAnsiOutput(entry.body, entry.pendingBody);
  entry.pendingBody = null;
  entry.body.classList.remove("live-output-truncated");
}

function ensureCommandBatch(group) {
  if (group.activeCommandBatch) return group.activeCommandBatch;
  const root = document.createElement("details");
  root.className = "command-batch";
  const summary = document.createElement("summary");
  const kind = document.createElement("strong");
  kind.className = "command-batch-kind";
  kind.textContent = "命令";
  const title = document.createElement("span");
  title.className = "command-batch-title";
  const status = document.createElement("span");
  status.className = "command-batch-status";
  const caret = document.createElement("span");
  caret.className = "command-batch-caret";
  summary.append(kind, title, caret, status);
  const list = document.createElement("div");
  list.className = "command-batch-list";
  root.append(summary, list);
  group.list.append(root);
  const batch = { root, title, status, list, items: new Set() };
  group.commandBatches.add(batch);
  group.activeCommandBatch = batch;
  return batch;
}

function updateCommandBatch(batch) {
  const entries = [...batch.items];
  if (!entries.length) return;
  const presentations = entries.map((entry) => executionPresentation(entry.item, { includeBody: false }));
  const runningIndex = presentations.findLastIndex((presentation) => presentation.tone === "running");
  const currentIndex = runningIndex >= 0 ? runningIndex : entries.length - 1;
  const running = runningIndex >= 0;
  batch.title.textContent = entries.length === 1
    ? presentations[0].title
    : running
      ? `连续命令（${entries.length} 个） · ${presentations[currentIndex].title}`
      : `连续命令（${entries.length} 个）`;
  const batchStartedAt = entries.map((entry) => timestampMilliseconds(entry.item.startedAt)).filter(Boolean).sort((a, b) => a - b)[0] || null;
  const startedAt = running ? timestampMilliseconds(entries[currentIndex].item.startedAt) || batchStartedAt : batchStartedAt;
  const completedAt = running ? null : entries
    .map((entry) => timestampMilliseconds(entry.item.completedAt)
      || (timestampMilliseconds(entry.item.startedAt) && Number.isFinite(Number(entry.item.durationMs))
        ? timestampMilliseconds(entry.item.startedAt) + Math.max(0, Number(entry.item.durationMs))
        : null))
    .filter(Boolean)
    .sort((a, b) => b - a)[0] || null;
  setElapsedDisplay(batch.status, running ? "执行中" : "", {
    startedAt,
    completedAt,
    status: running ? "running" : "completed",
  });
  batch.root.classList.toggle("running", running);
  batch.root.classList.toggle("complete", !running);
}

function ensureExecutionGroup(turnId, turnStatus, timing) {
  if (!turnId) return null;
  let group = state.executionGroups.get(turnId);
  if (group) {
    mergeExecutionTiming(group, timing);
    updateExecutionGroup(group, turnStatus);
    return group;
  }
  ui.conversation.querySelector(".empty-state")?.remove();
  const root = document.createElement("details");
  root.className = "execution-group";
  root.open = true;
  const summary = document.createElement("summary");
  const marker = document.createElement("span");
  marker.className = "execution-marker";
  const label = document.createElement("strong");
  label.textContent = "执行记录";
  const count = document.createElement("span");
  count.className = "execution-count";
  const status = document.createElement("span");
  status.className = "execution-group-status";
  const caret = document.createElement("span");
  caret.className = "execution-caret";
  summary.append(marker, label, count, status, caret);
  const list = document.createElement("div");
  list.className = "execution-list";
  const timingSummary = document.createElement("section");
  timingSummary.className = "execution-timing-summary";
  timingSummary.hidden = true;
  const total = document.createElement("span");
  total.className = "execution-timing-total";
  const totalLabel = document.createElement("span");
  totalLabel.textContent = "总耗时";
  const totalValue = document.createElement("strong");
  total.append(totalLabel, totalValue);
  const timingFields = {};
  for (const [key, label, title] of [
    ["command", "命令", "已记录的终端命令耗时"],
    ["codex", "Codex ≈", "总耗时扣除已记录命令耗时后的估算值"],
  ]) {
    const field = document.createElement("span");
    field.className = `execution-timing-field ${key}`;
    field.title = title;
    const name = document.createElement("span");
    name.textContent = label;
    const value = document.createElement("strong");
    const detail = document.createElement("small");
    field.append(name, value, detail);
    timingSummary.append(field);
    timingFields[key] = { root: field, name, value, detail };
  }
  const copyProcess = document.createElement("button");
  copyProcess.className = "copy-text-button icon-copy-button execution-copy-button";
  copyProcess.type = "button";
  copyProcess.textContent = "复制过程";
  copyProcess.title = "复制过程";
  copyProcess.setAttribute("aria-label", "复制执行过程的 Markdown 原文");
  copyProcess.addEventListener("click", () => copyWithFeedback(copyProcess, processMarkdownForGroup(group)));
  timingSummary.append(copyProcess);
  timingSummary.prepend(total);
  root.append(summary, list, timingSummary);
  ui.conversation.append(root);
  group = { turnId, root, count, status, list, items: new Map(), commandBatches: new Set(), activeCommandBatch: null, plan: null, turnStatus, timingSummary, totalValue, timingFields, copyProcess };
  mergeExecutionTiming(group, timing);
  state.executionGroups.set(turnId, group);
  updateExecutionGroup(group, turnStatus);
  return group;
}

function renderTurnPlan(turnId, plan, turnStatus = "inProgress") {
  if (!turnId || !plan) return;
  const group = ensureExecutionGroup(turnId, turnStatus);
  group.activeCommandBatch = null;
  if (!group.plan) {
    group.plan = createTurnPlanView(plan);
    group.list.append(group.plan.root);
  } else {
    updateTurnPlanView(group.plan, plan);
  }
  followNewContent();
}

function mergeExecutionTiming(group, timing) {
  const runtime = currentRuntime();
  const sources = [runtime.activeTurnId === group.turnId ? runtime : null, timing].filter(Boolean);
  for (const source of sources) {
    const startedAt = timestampMilliseconds(source.startedAt);
    const completedAt = timestampMilliseconds(source.completedAt);
    const durationMs = source.durationMs === null || source.durationMs === undefined ? null : Number(source.durationMs);
    if (startedAt) group.startedAt = startedAt;
    if (completedAt) group.completedAt = completedAt;
    if (durationMs !== null && Number.isFinite(durationMs) && durationMs >= 0) group.durationMs = Math.round(durationMs);
  }
  mergeTurnMetric(group.turnId, {
    startedAt: group.startedAt,
    completedAt: group.completedAt,
    durationMs: group.durationMs,
  });
}

function updateExecutionGroup(group, turnStatus) {
  group.turnStatus = turnStatus || group.turnStatus;
  const count = group.items.size;
  group.count.textContent = `· ${count} 项`;
  const runtime = currentRuntime();
  const runtimeMatchesTurn = isActiveThreadRuntime(runtime) && runtime.activeTurnId === group.turnId;
  const running = runtimeMatchesTurn || isActiveThreadStatus(group.turnStatus);
  const failed = ["failed", "error"].includes(group.turnStatus);
  const stopped = ["interrupted", "cancelled"].includes(group.turnStatus);
  const label = running ? "进行中" : failed ? "失败" : stopped ? "已停止" : "结束";
  setElapsedDisplay(group.status, "", group);
  group.status.title = label;
  group.status.setAttribute("aria-label", `${label}用时`);
  group.root.classList.toggle("running", running);
  group.root.classList.toggle("failed", failed);
  group.root.classList.toggle("stopped", stopped);
  group.root.classList.toggle("complete", !running && !failed && !stopped);
  updateExecutionTimingSummary(group, running);
}

function updateExecutionTimingSummary(group, running) {
  if (running) {
    group.timingSummary.hidden = true;
    return;
  }
  const summary = summarizeExecutionTiming(group, [...group.items.values()].map((entry) => entry.item));
  if (!summary) {
    group.totalValue.parentElement.hidden = true;
    group.timingFields.command.root.hidden = true;
    group.timingFields.codex.root.hidden = true;
    group.timingSummary.hidden = false;
    return;
  }
  group.totalValue.parentElement.hidden = false;
  group.timingFields.command.root.hidden = false;
  group.timingFields.codex.root.hidden = false;
  group.totalValue.textContent = formatDuration(summary.totalMs);
  group.timingFields.command.value.textContent = summary.commandUnknownCount
    ? summary.commandMs > 0 ? `≥ ${formatDuration(summary.commandMs)}` : "未记录"
    : formatDuration(summary.commandMs);
  group.timingFields.command.detail.textContent = `${summary.commandCount} 项`;
  group.timingFields.codex.value.textContent = summary.codexMs === null ? "未记录" : formatDuration(summary.codexMs);
  group.timingFields.codex.detail.textContent = summary.codexMs === null ? "命令数据不全" : "推算";
  group.timingFields.codex.name.textContent = summary.codexMs === null ? "Codex" : "Codex ≈";
  group.timingSummary.hidden = false;
}

function completeExecutionGroup(turnId, turnStatus, timing) {
  const group = state.executionGroups.get(turnId);
  if (!group) return;
  mergeExecutionTiming(group, timing);
  mergeTurnMetric(turnId, {
    startedAt: group.startedAt,
    completedAt: group.completedAt,
    durationMs: group.durationMs,
  });
  const itemStatus = turnStatus === "failed" ? "failed" : ["interrupted", "cancelled"].includes(turnStatus) ? "interrupted" : "completed";
  for (const entry of group.items.values()) {
    const completedAt = timestampMilliseconds(entry.item.completedAt)
      || (entry.item.durationMs === null || entry.item.durationMs === undefined ? group.completedAt : null);
    entry.item = {
      ...entry.item,
      status: itemStatus,
      ...(completedAt ? { completedAt } : {}),
    };
    mergeItemMetric(turnId, entry.item.id, {
      type: entry.item.type,
      status: entry.item.status,
      startedAt: entry.item.startedAt,
      completedAt: entry.item.completedAt,
      durationMs: entry.item.durationMs,
    });
    const presentation = executionPresentation(entry.item);
    setElapsedDisplay(entry.status, "", entry.item);
    entry.status.title = presentation.status;
    entry.status.setAttribute("aria-label", `${presentation.status}用时`);
    entry.root.classList.remove("running");
    entry.root.classList.toggle("failed", presentation.tone === "failed");
    entry.root.classList.toggle("stopped", presentation.tone === "stopped");
    entry.root.classList.toggle("complete", presentation.tone === "complete");
    if (entry.autoOpened) {
      entry.root.open = false;
      entry.autoOpened = false;
    }
    if (entry.commandBatch) updateCommandBatch(entry.commandBatch);
  }
  updateExecutionGroup(group, turnStatus || "completed");
  syncElapsedTimer();
  followNewContent();
}

function removeExecutionItem(turnId, itemId) {
  const group = state.executionGroups.get(turnId);
  const entry = group?.items.get(itemId);
  if (!group || !entry) return;
  entry.root.remove();
  group.items.delete(itemId);
  if (entry.commandBatch) {
    entry.commandBatch.items.delete(entry);
    if (!entry.commandBatch.items.size) {
      entry.commandBatch.root.remove();
      group.commandBatches.delete(entry.commandBatch);
      if (group.activeCommandBatch === entry.commandBatch) group.activeCommandBatch = null;
    } else {
      updateCommandBatch(entry.commandBatch);
    }
  }
  if (group.items.size || group.list.childElementCount) {
    updateExecutionGroup(group, "inProgress");
  } else {
    group.root.remove();
    state.executionGroups.delete(turnId);
  }
  followNewContent();
}

function currentExecutionItem(turnId, itemId) {
  return state.executionGroups.get(turnId)?.items.get(itemId)?.item || null;
}

function turnActivityId(turnId) {
  return `${turnId}:activity`;
}

function clearTurnActivity(turnId) {
  const timer = state.executionIdleTimers.get(turnId);
  if (timer) clearTimeout(timer);
  state.executionIdleTimers.delete(turnId);
  removeRenderedMessage(turnActivityId(turnId));
}

function showTurnActivity(turnId) {
  const group = state.executionGroups.get(turnId);
  const hasRunningItem = [...(group?.items.values() || [])].some((entry) => (
    executionStatus(entry.item).tone === "running"
  ));
  if (currentRuntime().activeTurnId !== turnId || hasRunningItem || state.messageElements.has(turnActivityId(turnId))) return;
  const message = addProgressMessage(turnActivityId(turnId), "Codex 处理中");
  message.root.classList.add("running", "waiting");
  setElapsedDisplay(message.body, "Codex 处理中", currentRuntime());
  placeTurnContent(turnId, message);
}

function scheduleTurnActivity(turnId, delay = 180) {
  if (!turnId) return;
  clearTurnActivity(turnId);
  const timer = setTimeout(() => {
    state.executionIdleTimers.delete(turnId);
    showTurnActivity(turnId);
  }, delay);
  state.executionIdleTimers.set(turnId, timer);
}

function executionPresentation(item, { includeBody = true } = {}) {
  const status = executionStatus(item);
  const body = !includeBody || item.type === "fileChange" ? "" : limitExecutionDetail(executionItemText(item), MAX_RENDERED_COMMAND_OUTPUT, item.type === "commandExecution");
  if (item.type === "agentMessage") return { kind: "进度", title: compactText(item.text || "Codex 正在处理"), status: status.label, tone: status.tone, body };
  if (item.type === "reasoning") {
    const summary = uniqueTextParts(item.summary || []);
    return { kind: "思考", title: compactText(plainInlineMarkdown(summary[summary.length - 1]) || "整理思路"), status: status.label, tone: status.tone, body };
  }
  if (item.type === "commandExecution") return { kind: "命令", title: compactText(commandDisplayText(item.command) || "执行终端命令"), status: status.label, tone: status.tone, body };
  if (item.type === "fileChange") return { kind: "文件", title: fileChangeTitle(item, status.tone), status: status.label, tone: status.tone, body };
  if (item.type === "mcpToolCall") return { kind: "工具", title: compactText([item.server, item.tool].filter(Boolean).join(" / ") || "调用工具"), status: status.label, tone: status.tone, body };
  if (item.type === "dynamicToolCall" && /request_?user_?input/i.test(item.tool || "")) {
    return { kind: "提问", title: status.tone === "running" ? "等待你的回答" : "已收到回答", status: status.label, tone: status.tone, body: "" };
  }
  if (item.type === "dynamicToolCall") return { kind: "工具", title: compactText([item.namespace, item.tool].filter(Boolean).join(" / ") || "调用工具"), status: status.label, tone: status.tone, body };
  if (item.type === "collabAgentToolCall") return { kind: "协作", title: compactText(item.tool || "代理协作"), status: status.label, tone: status.tone, body };
  if (item.type === "subAgentActivity") return { kind: "子任务", title: compactText(item.agentPath || item.kind || "代理活动"), status: status.label, tone: status.tone, body };
  if (item.type === "webSearch") return { kind: "搜索", title: compactText(item.query || "搜索网页"), status: status.label, tone: status.tone, body };
  if (item.type === "imageView") return { kind: "图片", title: compactText(item.path || "查看图片"), status: status.label, tone: status.tone, body };
  if (item.type === "imageGeneration") return { kind: "图片", title: "生成图片", status: status.label, tone: status.tone, body };
  if (item.type === "contextCompaction") return { kind: "上下文", title: "整理聊天上下文", status: status.label, tone: status.tone, body };
  if (item.type === "sleep") return { kind: "等待", title: `等待 ${Math.round((item.durationMs || 0) / 1000)} 秒`, status: status.label, tone: status.tone, body };
  return { kind: "记录", title: compactText(item.type || "执行项目"), status: status.label, tone: status.tone, body };
}

function fileChangeTitle(item, tone) {
  const count = item.changes?.length || 0;
  if (!count) return tone === "running" ? "正在准备文件修改" : "未产生文件修改";
  if (tone === "running") return `正在修改 ${count} 个文件`;
  if (tone === "failed") return `修改 ${count} 个文件时失败`;
  return `已修改 ${count} 个文件`;
}

function renderExecutionTitle(element, text, item) {
  element.replaceChildren();
  const label = document.createElement("span");
  label.className = "execution-title-label";
  label.textContent = text;
  element.append(label);
  if (item.type !== "fileChange" || !item.changes?.length) return;
  const stats = diffLineStats(item.changes);
  for (const [kind, value, sign, name] of [
    ["added", stats.added, "+", "新增"],
    ["removed", stats.removed, "−", "删除"],
  ]) {
    if (!value) continue;
    const badge = document.createElement("span");
    badge.className = `diff-stat ${kind}`;
    badge.textContent = `${sign}${value}`;
    badge.title = `${name} ${value} 行`;
    badge.setAttribute("aria-label", `${name} ${value} 行`);
    element.append(badge);
  }
}

function executionStatus(item) {
  const value = String(item.status || "").toLowerCase();
  if (isActiveThreadStatus(value)) return { label: "进行中", tone: "running" };
  if (["interrupted", "cancelled"].includes(value)) return { label: "已停止", tone: "stopped" };
  if (["failed", "error", "declined"].includes(value) || item.error || Number(item.exitCode) > 0) return { label: "失败", tone: "failed" };
  if (item.exitCode === 0) return { label: "结束", tone: "complete" };
  return { label: "结束", tone: "complete" };
}

function uniqueTextParts(parts) {
  const seen = new Set();
  return parts.map((part) => String(part || "").trim()).filter((part) => {
    if (!part || seen.has(part)) return false;
    seen.add(part);
    return true;
  });
}

function compactText(value, limit = 92) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

function limitExecutionDetail(value, limit = 16000, keepEnd = false) {
  const text = String(value || "").trim();
  if (text.length <= limit) return text;
  return keepEnd
    ? `…前面的内容已截断显示\n\n${text.slice(-limit)}`
    : `${text.slice(0, limit)}\n\n…后面的内容已截断显示`;
}

function processMarkdownForGroup(group) {
  if (!group?.turnId) return "";
  const storedTurn = (currentThread()?.turns || []).find((turn) => turn.id === group.turnId);
  const liveItems = new Map([...group.items.values()].map((entry) => [entry.item.id, entry.item]));
  const items = [];
  for (const item of storedTurn?.items || []) {
    const live = item.id ? liveItems.get(item.id) : null;
    items.push(live ? { ...item, ...live } : item);
    if (item.id) liveItems.delete(item.id);
  }
  items.push(...liveItems.values());
  return turnProcessMarkdown({
    plan: state.turnMetrics.get(group.turnId)?.plan,
    items,
  });
}

async function copyWithFeedback(button, value) {
  const text = String(value || "");
  if (!text) {
    showActivity("没有可复制的内容。", true);
    return;
  }
  const original = button.textContent;
  const originalTitle = button.title;
  const originalLabel = button.getAttribute("aria-label");
  clearTimeout(button.copyFeedbackTimer);
  try {
    await writeClipboardText(text);
    button.textContent = "已复制";
    button.title = "已复制";
    button.setAttribute("aria-label", "已复制");
    button.classList.add("copied");
    button.copyFeedbackTimer = setTimeout(() => {
      button.textContent = original;
      button.title = originalTitle;
      if (originalLabel) button.setAttribute("aria-label", originalLabel);
      else button.removeAttribute("aria-label");
      button.classList.remove("copied");
    }, 1400);
  } catch (error) {
    button.textContent = original;
    button.title = originalTitle;
    if (originalLabel) button.setAttribute("aria-label", originalLabel);
    else button.removeAttribute("aria-label");
    button.classList.remove("copied");
    showActivity(`复制失败：${error.message}`, true);
  }
}

async function writeClipboardText(text) {
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const source = document.createElement("textarea");
  source.className = "clipboard-source";
  source.value = text;
  source.readOnly = true;
  document.body.append(source);
  let copied = false;
  try {
    source.focus({ preventScroll: true });
    source.select();
    source.setSelectionRange(0, source.value.length);
    copied = document.execCommand("copy");
  } finally {
    source.remove();
  }
  if (!copied) throw new Error("浏览器拒绝访问剪贴板");
}

function renderEmptyConversation() {
  const empty = document.createElement("div");
  empty.className = "empty-state";
  const mark = document.createElement("span");
  mark.className = "empty-orbit";
  mark.textContent = "✦";
  const title = document.createElement("b");
  title.textContent = "开始这个项目的聊天";
  const text = document.createElement("p");
  text.textContent = "在下方选择模型，然后输入第一条任务。";
  empty.append(mark, title, text);
  ui.conversation.append(empty);
}

function addMessage(id, label, text, kind, timestamp = null) {
  if (state.messageElements.has(id)) {
    const entry = state.messageElements.get(id);
    if (text !== undefined) renderMessageContent(entry, text);
    setMessageTimestamp(entry, timestamp);
    return entry;
  }
  ui.conversation.querySelector(".empty-state")?.remove();
  const root = ui.messageTemplate.content.firstElementChild.cloneNode(true);
  root.classList.add(kind);
  const meta = root.querySelector(".message-meta");
  const body = root.querySelector(".message-body");
  const name = document.createElement("span");
  name.textContent = label;
  const time = document.createElement("time");
  time.className = "message-time";
  time.hidden = true;
  meta.replaceChildren(name, time);
  ui.conversation.append(root);
  const entry = { root, body, kind, time, files: null, rawText: "", actions: null, copyButton: null };
  if (kind === "assistant") {
    const actions = document.createElement("div");
    actions.className = "message-actions";
    const copyButton = document.createElement("button");
    copyButton.className = "copy-text-button icon-copy-button";
    copyButton.type = "button";
    copyButton.textContent = "复制原文";
    copyButton.title = "复制原文";
    copyButton.setAttribute("aria-label", "复制最终回答的 Markdown 原文");
    copyButton.addEventListener("click", () => copyWithFeedback(copyButton, entry.rawText));
    actions.append(copyButton);
    root.append(actions);
    entry.actions = actions;
    entry.copyButton = copyButton;
  }
  setMessageTimestamp(entry, timestamp);
  renderMessageContent(entry, text);
  state.messageElements.set(id, entry);
  return entry;
}

function setMessageTimestamp(entry, timestamp) {
  const milliseconds = timestampMilliseconds(timestamp);
  if (!entry?.time || !milliseconds) return;
  entry.time.dateTime = new Date(milliseconds).toISOString();
  entry.time.textContent = formatMessageTime(milliseconds);
  entry.time.title = formatMessageDateTime(milliseconds);
  entry.time.hidden = false;
}

function addProgressMessage(id, text) {
  const existing = state.messageElements.get(id);
  if (existing) {
    existing.text = String(text || "");
    existing.body.textContent = existing.text;
    return existing;
  }
  ui.conversation.querySelector(".empty-state")?.remove();
  const root = document.createElement("div");
  root.className = "progress-message";
  const marker = document.createElement("span");
  marker.className = "progress-message-marker";
  marker.setAttribute("aria-hidden", "true");
  const body = document.createElement("p");
  const entry = { root, body, kind: "progress", text: String(text || "") };
  body.textContent = entry.text;
  root.append(marker, body);
  ui.conversation.append(root);
  state.messageElements.set(id, entry);
  followNewContent();
  return entry;
}

function removeRenderedMessage(id) {
  const entry = state.messageElements.get(id);
  entry?.root.remove();
  state.messageElements.delete(id);
}

function renderLiveUserMessage(item, turnId = null, guide = null) {
  const text = userMessageText(item);
  const matching = [...state.messageElements].find(([, entry]) => (
    entry.root.matches?.(".message.user, .message.guide")
      && entry.root.dataset.turnId === turnId
      && entry.rawText === text
      && (item.clientPending
        ? entry.root.dataset.clientPending !== "true"
        : entry.root.dataset.clientPending === "true")
  ));
  if (matching) {
    const [matchingId, entry] = matching;
    setMessageTimestamp(entry, messageTimestamp(item, turnId));
    const thread = currentThread();
    const turn = thread?.turns?.find((candidate) => candidate.id === turnId);
    if (matchingId === item.id) {
      const stored = turn?.items?.find((candidate) => candidate.id === item.id);
      if (stored) delete stored.clientPending;
      entry.root.removeAttribute("data-client-pending");
      renderMessageContent(entry, text);
      return entry;
    }
    if (turn) turn.items = turn.items.filter((candidate) => candidate.id !== (item.clientPending ? item.id : matchingId));
    if (item.clientPending) return entry;
    removeRenderedMessage(matchingId);
  }
  const isGuide = guide ?? Boolean(turnId && [...ui.conversation.querySelectorAll(".message.user, .message.guide")]
    .some((message) => message.dataset.turnId === turnId));
  return renderHistoryItem(item, { turnId, guide: isGuide });
}

function acceptGuideMessage(threadId, turnId, item) {
  const projectId = findProjectForThread(threadId);
  if (!projectId || !turnId || !item?.id) return;
  const stored = rememberThreadItem(projectId, threadId, turnId, {
    ...item,
    createdAt: timestampMilliseconds(item.createdAt) || Date.now(),
  });
  if (stored && state.selectedThreadId === threadId) renderLiveUserMessage(stored, turnId, true);
}

function renderMessageContent(entry, value) {
  const text = String(value || "");
  entry.rawText = text;
  if (entry.actions) entry.actions.hidden = !text;
  if (entry.kind !== "assistant") {
    entry.body.textContent = text;
    entry.body.hidden = false;
    entry.files?.remove();
    entry.files = null;
    followNewContent();
    return;
  }
  const presentation = downloadableFiles(text);
  const formatted = formatJsonText(presentation.text);
  if (formatted.isJson) entry.body.textContent = formatted.text;
  else renderMarkdownDocument(entry.body, formatted.text);
  entry.body.hidden = !formatted.text;
  entry.root.classList.toggle("json-output", formatted.isJson);
  entry.root.classList.toggle("markdown-output", Boolean(formatted.text) && !formatted.isJson);
  entry.files?.remove();
  entry.files = null;
  if (!presentation.files.length || !currentProject()) {
    if (entry.actions) entry.root.append(entry.actions);
    followNewContent();
    return;
  }
  const list = document.createElement("div");
  list.className = "message-files";
  list.setAttribute("aria-label", "可下载文件");
  for (const file of presentation.files) list.append(downloadCard(file));
  entry.root.append(list);
  entry.files = list;
  if (entry.actions) entry.root.append(entry.actions);
  followNewContent();
}

function downloadCard(file) {
  const url = localFileUrl(file.path, file.name);
  const previewKind = textPreviewKind(file.name);
  if (previewKind) return previewFileCard(file, url, previewKind);
  const link = document.createElement("a");
  link.className = "file-download";
  link.href = url;
  link.setAttribute("aria-label", `下载 ${file.name}`);
  link.append(fileCardContent(file, "下载 ↓"));
  link.addEventListener("click", () => showActivity(`正在下载 ${file.name}`, false));
  return link;
}

function previewFileCard(file, url, previewKind) {
  const card = document.createElement("div");
  card.className = "markdown-file-card";
  const preview = document.createElement("button");
  preview.type = "button";
  preview.className = "file-download file-preview-trigger";
  preview.setAttribute("aria-label", `预览 ${file.name}`);
  preview.append(fileCardContent(file));
  preview.addEventListener("click", () => openTextPreview(file, url, previewKind));
  const download = document.createElement("a");
  download.className = "file-download-direct";
  download.href = url;
  download.setAttribute("aria-label", `下载 ${file.name}`);
  download.title = "下载原文件";
  download.textContent = "↓";
  download.addEventListener("click", () => showActivity(`正在下载 ${file.name}`, false));
  card.append(preview, download);
  return card;
}

function fileCardContent(file, actionLabel) {
  const fragment = document.createDocumentFragment();
  const extension = document.createElement("span");
  extension.className = "file-extension";
  extension.textContent = (file.name.split(".").pop() || "FILE").slice(0, 4).toUpperCase();
  const copy = document.createElement("span");
  copy.className = "file-copy";
  const title = document.createElement("strong");
  title.textContent = file.label;
  const name = document.createElement("small");
  name.textContent = file.name;
  copy.append(title, name);
  fragment.append(extension, copy);
  if (actionLabel) {
    const action = document.createElement("span");
    action.className = "file-action";
    action.textContent = actionLabel;
    fragment.append(action);
  }
  return fragment;
}

function projectFileUrl(projectId, path, name) {
  return `/api/projects/${encodeURIComponent(projectId)}/files/download?path=${encodeURIComponent(path)}&name=${encodeURIComponent(name || "download")}`;
}

function localFileUrl(path, name) {
  const project = projectForLocalFile(state.projects, path);
  if (project) return projectFileUrl(project.id, path, name);
  if (state.user?.role === "admin") return `/api/admin/files/download?path=${encodeURIComponent(path)}&name=${encodeURIComponent(name || "download")}`;
  return projectFileUrl(currentProject().id, path, name);
}

let markdownPreviewRequest = 0;

async function openTextPreview(file, url, previewKind) {
  const request = ++markdownPreviewRequest;
  ui.filePreviewKicker.textContent = previewKind === "markdown" ? "Markdown 预览" : previewKind === "json" ? "JSON 预览" : previewKind === "code" ? "代码预览" : "文本预览";
  ui.markdownPreviewName.textContent = file.name;
  ui.markdownPreviewPath.textContent = file.path;
  ui.markdownPreviewDownload.href = url;
  ui.markdownPreviewDownload.hidden = false;
  ui.markdownPreviewDownload.removeAttribute("download");
  ui.markdownPreviewStatus.textContent = "正在读取文档…";
  ui.markdownPreviewStatus.className = "markdown-preview-status";
  ui.markdownPreviewStatus.hidden = false;
  ui.markdownPreviewBody.hidden = true;
  ui.markdownPreviewBody.replaceChildren();
  if (!ui.markdownPreviewDialog.open) ui.markdownPreviewDialog.showModal();

  try {
    const response = await fetch(url, { headers: { Accept: "text/plain, text/markdown, application/json;q=0.9" } });
    if (!response.ok) throw new Error(await fileResponseError(response));
    const contents = await response.text();
    if (request !== markdownPreviewRequest || !ui.markdownPreviewDialog.open) return;
    if (previewKind === "markdown") {
      ui.markdownPreviewBody.className = "markdown-document";
      renderMarkdownDocument(ui.markdownPreviewBody, contents);
    } else {
      renderSourceDocument(ui.markdownPreviewBody, contents, previewKind);
    }
    ui.markdownPreviewStatus.hidden = true;
    ui.markdownPreviewBody.hidden = false;
    ui.markdownPreviewBody.focus({ preventScroll: true });
  } catch (error) {
    if (request !== markdownPreviewRequest) return;
    ui.markdownPreviewStatus.textContent = error.message || "文件读取失败。";
    ui.markdownPreviewStatus.className = "markdown-preview-status error";
  }
}

function openFileChangePreview(item) {
  markdownPreviewRequest += 1;
  const changes = item.changes || [];
  const count = changes.length;
  ui.filePreviewKicker.textContent = "Diff 预览";
  ui.markdownPreviewName.textContent = count ? `${count} 个文件的修改` : "文件修改";
  ui.markdownPreviewPath.textContent = changes.map((change) => change.path).filter(Boolean).join(" · ") || "完整 diff";
  ui.markdownPreviewDownload.hidden = true;
  ui.markdownPreviewStatus.hidden = true;
  ui.markdownPreviewBody.hidden = false;
  ui.markdownPreviewBody.className = "diff-document";
  renderFileChanges(ui.markdownPreviewBody, changes);
  if (!ui.markdownPreviewDialog.open) ui.markdownPreviewDialog.showModal();
  ui.markdownPreviewBody.focus({ preventScroll: true });
}

function renderSourceDocument(container, contents, previewKind) {
  container.className = `source-document${previewKind === "text" ? " wrap" : ""}`;
  container.replaceChildren();
  const pre = document.createElement("pre");
  const code = document.createElement("code");
  const formatted = previewKind === "json" ? formatJsonText(contents) : null;
  code.textContent = formatted?.text || contents;
  pre.append(code);
  container.append(pre);
}

async function fileResponseError(response) {
  const text = await response.text();
  try {
    const payload = JSON.parse(text);
    return payload.error || payload.message || `文件读取失败（${response.status}）`;
  } catch {
    return text.trim() || `文件读取失败（${response.status}）`;
  }
}

function renderQueue() {
  ui.queuePanel.replaceChildren();
  const queue = currentQueue();
  if (!currentThread() || !queue.length) {
    ui.queuePanel.hidden = true;
    return;
  }
  ui.queuePanel.hidden = false;
  const list = document.createElement("ol");
  list.className = "queue-list";
  const runtime = currentRuntime();
  const runtimeActive = isActiveThreadRuntime(runtime);
  const runtimeIdentityPending = runtimeActive && !runtime.activeTurnId;
  for (const [index, item] of queue.entries()) {
    const row = ui.queueItemTemplate.content.firstElementChild.cloneNode(true);
    const queueIndex = row.querySelector(".queue-index");
    queueIndex.textContent = String(index + 1);
    row.querySelector(".queue-text").textContent = item.text;
    const guideButton = row.querySelector('[data-action="guide"]');
    const guiding = state.queueGuiding.has(item.id);
    row.classList.toggle("guiding", guiding);
    if (guiding) row.setAttribute("aria-busy", "true");
    if (guiding) queueIndex.replaceChildren(iconElement("guide"));
    if (guiding) row.querySelector(".queue-text").dataset.status = "正在转入信息流";
    guideButton.disabled = !runtime.activeTurnId || guiding;
    guideButton.setAttribute("aria-busy", String(guiding));
    guideButton.title = runtimeIdentityPending ? "正在同步当前执行标识" : runtime.activeTurnId ? "转入当前信息流" : "当前没有运行中的任务";
    row.querySelector('[data-action="edit"]').disabled = guiding;
    row.querySelector('[data-action="up"]').disabled = guiding || index === 0;
    row.querySelector('[data-action="down"]').disabled = guiding || index === queue.length - 1;
    row.querySelector('[data-action="remove"]').disabled = guiding;
    row.querySelector('[data-action="guide"]').addEventListener("click", () => guideQueueItem(item.id));
    row.querySelector('[data-action="edit"]').addEventListener("click", () => openQueueEdit(item));
    row.querySelector('[data-action="up"]').addEventListener("click", () => changeQueue(item.id, "up"));
    row.querySelector('[data-action="down"]').addEventListener("click", () => changeQueue(item.id, "down"));
    row.querySelector('[data-action="remove"]').addEventListener("click", () => removeQueue(item.id));
    list.append(row);
  }
  ui.queuePanel.append(list);
}

function updateComposer() {
  const hasThread = Boolean(currentThread());
  const switching = Boolean(state.threadSelectionTargetId);
  const runtime = currentRuntime();
  const active = isActiveThreadRuntime(runtime);
  const goalActive = isActiveGoal(currentThread()?.goal);
  const activeTurnReady = Boolean(runtime.activeTurnId);
  const hasInput = Boolean(ui.prompt.value.trim() || state.composerAttachments.length);
  const projectAvailable = currentProject()?.available !== false;
  const showStop = activeTurnReady && !hasInput && !state.materializingThread;
  const guideAvailable = hasThread && activeTurnReady;
  if (state.mode === "guide" && !active) state.mode = "queue";
  ui.guide.classList.toggle("active", state.mode === "guide");
  ui.queue.classList.toggle("active", state.mode === "queue");
  ui.guide.setAttribute("aria-checked", String(state.mode === "guide"));
  ui.queue.setAttribute("aria-checked", String(state.mode === "queue"));
  ui.guide.disabled = !state.codexReady || !guideAvailable || switching;
  ui.queue.disabled = !state.codexReady || switching;
  ui.planMode.disabled = !state.codexReady || !hasThread || active || goalActive || switching;
  ui.goalMode.disabled = !state.codexReady || !hasThread || state.materializingThread || state.submittingMessage || state.goalMutating || switching;
  renderThreadActions();
  ui.guide.title = active && !activeTurnReady ? "正在同步当前执行标识" : guideAvailable ? "向当前任务追加引导" : "当前没有运行中的任务";
  ui.prompt.disabled = !state.codexReady || !currentProject() || !projectAvailable || switching;
  ui.uploadFiles.disabled = !state.codexReady || !currentProject() || !projectAvailable || state.uploadingFiles || switching;
  ui.uploadFiles.title = "添加文件或图片；也可直接粘贴剪贴板图片";
  ui.stop.hidden = !showStop;
  ui.stop.disabled = !showStop || state.stoppingTurn || switching;
  ui.stop.querySelector("span").textContent = state.stoppingTurn ? "…" : "■";
  ui.send.hidden = showStop;
  ui.send.disabled = !state.codexReady || !currentProject() || !projectAvailable || state.materializingThread || state.submittingMessage || state.uploadingFiles || switching || !hasInput;
  if (state.materializingThread) {
    setSendIcon("send");
    ui.send.setAttribute("aria-label", "正在创建聊天");
    ui.send.title = "正在创建聊天";
    ui.send.classList.remove("guide");
  } else if (state.submittingMessage) {
    setSendIcon(state.mode === "guide" ? "guide" : "send");
    ui.send.setAttribute("aria-label", "正在发送");
    ui.send.title = "正在发送";
    ui.send.classList.toggle("guide", state.mode === "guide");
  } else if (state.mode === "guide") {
    ui.prompt.placeholder = activeTurnReady ? "补充目标、限制或修正方向…" : "正在同步当前执行，请稍候…";
    setSendIcon("guide");
    ui.send.setAttribute("aria-label", "发送引导");
    ui.send.title = "发送引导";
    ui.send.classList.add("guide");
  } else {
    ui.prompt.placeholder = state.codexReady ? "输入要交给 Codex 的任务…" : "连接 Codex 后可以开始对话";
    setSendIcon("send");
    const sendLabel = active ? "加入队列" : "发送";
    ui.send.setAttribute("aria-label", sendLabel);
    ui.send.title = sendLabel;
    ui.send.classList.remove("guide");
  }
  if (currentProject()) window.CodexAndroid?.readyForSharedFiles?.();
}

function chooseUploadFiles() {
  if (!currentProject() || state.uploadingFiles) return;
  ui.uploadFileInput.click();
}

function setSendIcon(kind) {
  const icon = ui.send.querySelector("svg");
  if (!icon) return;
  icon.replaceChildren(iconPath(kind));
}

function iconElement(kind) {
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.append(iconPath(kind));
  return icon;
}

function iconPath(kind) {
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", kind === "guide" ? "m4 12 15-7-5 14-3-5zM11 14l3-3" : "M12 18V6m-4.5 4.5L12 6l4.5 4.5");
  return path;
}

window.codexReceiveAndroidShare = () => {
  if (!currentProject() || state.uploadingFiles) return "not-ready";
  ui.uploadFileInput.click();
  return "picker-opened";
};

async function uploadSelectedFiles() {
  const files = [...(ui.uploadFileInput.files || [])];
  addComposerFiles(files);
  ui.uploadFileInput.value = "";
}

function addComposerFiles(files) {
  const project = currentProject();
  if (!project || !files.length || state.uploadingFiles) return;
  for (const file of files) {
    state.composerAttachments.push({
      file,
      name: file.name,
      projectId: project.id,
      type: file.type,
      previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
      uploaded: null,
    });
  }
  renderComposerAttachments();
  ui.prompt.focus();
  showActivity(`已加入 ${files.length} 个附件，发送时上传`, false);
}

async function pasteClipboardImages(event) {
  const images = clipboardImageFiles(event.clipboardData);
  if (!images.length) return;
  event.preventDefault();
  const timestamp = Date.now();
  const files = images.map((image, index) => new File([image], clipboardImageName(image.type, timestamp, index), {
    type: image.type,
    lastModified: timestamp,
  }));
  addComposerFiles(files);
}

async function uploadComposerAttachments(project, thread, attachments = state.composerAttachments) {
  const pending = attachments.filter((attachment) => !attachment.uploaded);
  if (!pending.length) return;
  state.uploadingFiles = true;
  updateComposer();
  try {
    for (const [index, attachment] of pending.entries()) {
      const result = await uploadProjectFile(project, thread, attachment.file, (loaded, total) => {
        const fileProgress = total > 0 ? loaded / total : 1;
        const overall = Math.round(((index + fileProgress) / pending.length) * 100);
        showActivity(`正在上传 ${attachment.name} · ${overall}%`, false);
      });
      attachment.uploaded = result.file;
    }
    renderComposerAttachments();
  } finally {
    state.uploadingFiles = false;
    updateComposer();
  }
}

function renderComposerAttachments() {
  ui.composerAttachments.replaceChildren();
  ui.composerAttachments.hidden = state.composerAttachments.length === 0;
  for (const [index, attachment] of state.composerAttachments.entries()) {
    const item = document.createElement("article");
    item.className = "composer-attachment";
    if (attachment.previewUrl) {
      const preview = document.createElement("img");
      preview.src = attachment.previewUrl;
      preview.alt = "";
      item.append(preview);
    } else {
      const fileIcon = document.createElement("span");
      fileIcon.className = "composer-attachment-file";
      fileIcon.textContent = "FILE";
      item.append(fileIcon);
    }
    const name = document.createElement("span");
    name.textContent = attachment.name;
    name.title = attachment.uploaded?.path || "发送时上传";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `从发送上下文移除 ${attachment.name}`);
    remove.addEventListener("click", () => removeComposerAttachment(index));
    item.append(name, remove);
    ui.composerAttachments.append(item);
  }
  updateComposer();
}

function removeComposerAttachment(index) {
  const [removed] = state.composerAttachments.splice(index, 1);
  if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
  if (removed?.uploaded) void deleteUploadedAttachment(removed).catch(showError);
  renderComposerAttachments();
  ui.prompt.focus();
}

function clearComposerAttachments({ deleteUploaded = true } = {}) {
  for (const attachment of state.composerAttachments) {
    if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    if (deleteUploaded && attachment.uploaded) void deleteUploadedAttachment(attachment).catch(showError);
  }
  state.composerAttachments = [];
  renderComposerAttachments();
}

function uploadProjectFile(project, thread, file, onProgress) {
  return new Promise((resolveUpload, rejectUpload) => {
    const request = new XMLHttpRequest();
    request.open("POST", `/api/projects/${encodeURIComponent(project.id)}/files/upload?name=${encodeURIComponent(file.name)}&threadId=${encodeURIComponent(thread.id)}`);
    if (state.csrfToken) request.setRequestHeader("X-Codex-CSRF-Token", state.csrfToken);
    request.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    request.upload.addEventListener("progress", (event) => onProgress(event.loaded, event.lengthComputable ? event.total : file.size));
    request.addEventListener("load", () => {
      const result = safeJson(request.responseText) || {};
      if (request.status >= 200 && request.status < 300) resolveUpload(result);
      else rejectUpload(new Error(result.error || `上传失败（${request.status}）`));
    });
    request.addEventListener("error", () => rejectUpload(new Error(`上传 ${file.name} 时连接中断。`)));
    request.addEventListener("abort", () => rejectUpload(new Error(`已取消上传 ${file.name}。`)));
    request.send(file);
  });
}

async function deleteUploadedAttachment(attachment) {
  if (!attachment.uploaded?.path || !attachment.projectId) return;
  await api(`/api/projects/${encodeURIComponent(attachment.projectId)}/files/attachment?path=${encodeURIComponent(attachment.uploaded.path)}`, { method: "DELETE" });
}

async function createThread({ focusPrompt = true } = {}) {
  const project = currentProject();
  if (!project || project.available === false) return null;
  cancelThreadSelection();
  const selected = currentThread();
  if (isLocalThreadId(selected?.id) && selected.runtime?.projectId === project.id && currentThreadIsEmpty()) {
    closeSidebar();
    if (focusPrompt) ui.prompt.focus();
    return selected;
  }
  const existingDraft = (state.threads.get(project.id) || []).find((thread) => isLocalThreadId(thread.id));
  const thread = existingDraft || {
    id: nextLocalThreadId(),
    name: null,
    preview: "",
    turns: [],
    settings: newThreadSettings({
      projectSettings: project.settings,
      currentThread: selected,
      projectId: project.id,
      models: state.models,
    }),
    runtime: { projectId: project.id, activeTurnId: null, status: "idle" },
    history: { hasMore: false, before: null, totalTurns: 0 },
    queueCount: 0,
    queueRevision: 0,
    createdAt: Math.floor(Date.now() / 1000),
    updatedAt: Math.floor(Date.now() / 1000),
    accessedAt: new Date().toISOString(),
  };
  updateThreadInState(project.id, thread);
  state.selectedThreadId = thread.id;
  state.followLatest = true;
  closeSidebar();
  renderThreads();
  renderCurrentThread();
  if (!state.models.length) {
    const draftId = thread.id;
    void loadModels().then(() => {
      if (state.selectedThreadId === draftId) renderSettings();
    });
  }
  if (focusPrompt) ui.prompt.focus();
  return thread;
}

function currentThreadIsEmpty() {
  const thread = currentThread();
  if (!thread) return false;
  return (thread.turns || []).length === 0
    && !isActiveThreadRuntime(thread.runtime)
    && currentQueue().length === 0
    && !thread.queueCount;
}

function isLocalThreadId(threadId) {
  return typeof threadId === "string" && threadId.startsWith("local-");
}

function nextLocalThreadId() {
  state.localThreadSequence += 1;
  return `local-${Date.now().toString(36)}-${state.localThreadSequence.toString(36)}`;
}

async function materializeThread(project, draft, firstMessage = "") {
  if (!project || !draft || !isLocalThreadId(draft.id)) return draft;
  state.materializingThread = true;
  updateComposer();
  try {
    const result = await api("/api/threads", {
      method: "POST",
      body: {
        projectId: project.id,
        settings: draft.settings || {},
        ...(draft.name ? { name: draft.name } : {}),
        ...(firstMessage ? { firstMessage } : {}),
      },
    });
    const thread = {
      ...result.thread,
      turns: result.thread.turns || [],
      history: result.history || { hasMore: false, before: null, totalTurns: 0 },
      runtime: result.runtime || result.thread.runtime || { projectId: project.id, activeTurnId: null, status: "idle" },
    };
    const threads = state.threads.get(project.id) || [];
    const index = threads.findIndex((entry) => entry.id === draft.id);
    if (index === -1) threads.unshift(thread);
    else threads[index] = thread;
    state.threads.set(project.id, threads);
    state.queueSnapshots.delete(draft.id);
    const stillSelected = state.selectedProjectId === project.id && state.selectedThreadId === draft.id;
    if (stillSelected) state.selectedThreadId = thread.id;
    applyQueueSnapshot(thread.id, result.queue || [], result.queueRevision ?? 0);
    ensureEventStream();
    renderThreads();
    if (stillSelected) renderCurrentThread({ messages: false });
    return thread;
  } finally {
    state.materializingThread = false;
    updateComposer();
  }
}

async function submitPrompt(event) {
  event.preventDefault();
  const hasContent = Boolean(ui.prompt.value.trim() || state.composerAttachments.length);
  if (!hasContent || !currentProject() || state.materializingThread || state.submittingMessage || state.uploadingFiles) return;
  state.submittingMessage = true;
  updateComposer();
  scrollToLatest(false);
  let submittedThreadId = null;
  try {
    let project = currentProject();
    let thread = currentThread() || await createThread();
    if (!project || !thread) return;
    const sourceThreadId = thread.id;
    const sourcePrompt = ui.prompt.value;
    const attachments = [...state.composerAttachments];
    const mode = state.mode;
    const activeTurnId = thread.runtime?.activeTurnId || null;
    let prompt = sourcePrompt;
    const goalCommand = goalShortcut(sourcePrompt);
    if (goalCommand) {
      if (attachments.length) throw new Error("目标不能包含附件；请在目标文字中引用项目里的文件路径。");
      await executeGoalCommand(goalCommand, project, thread);
      if (ui.prompt.value === sourcePrompt) {
        ui.prompt.value = "";
        resizePrompt();
      }
      return;
    }
    const shortcut = planShortcut(sourcePrompt);
    if (shortcut && !attachments.length) {
      const planActive = thread.settings?.collaborationMode === "plan";
      const targetMode = shortcut.prompt ? "plan" : planActive ? "default" : "plan";
      const changed = await saveSettings({ collaborationMode: targetMode }, { quiet: true });
      if (!changed) return;
      prompt = shortcut.prompt;
      if (!prompt) {
        if (state.selectedProjectId === project.id && state.selectedThreadId === sourceThreadId && ui.prompt.value === sourcePrompt) {
          ui.prompt.value = "";
          resizePrompt();
        }
        showActivity(targetMode === "plan" ? "已进入规划模式。" : "已退出规划模式。", false);
        return;
      }
    }
    if (isLocalThreadId(thread.id)) {
      const firstMessage = [prompt.trim(), ...attachments.map((attachment) => attachment.name)].filter(Boolean).join("\n");
      thread = await materializeThread(project, thread, firstMessage);
    }
    submittedThreadId = thread.id;
    state.submittingThreadIds.add(thread.id);
    ensureEventStream();
    await waitForEventStream();
    await uploadComposerAttachments(project, thread, attachments);
    const text = messageWithAttachments(prompt, attachments.map((attachment) => attachment.uploaded).filter(Boolean));
    if (mode === "guide") {
      if (!activeTurnId) throw new Error("当前没有可引导的执行任务。");
      const result = await api(`/api/threads/${encodeURIComponent(thread.id)}/steer`, { method: "POST", body: { projectId: project.id, expectedTurnId: activeTurnId, text } });
      acceptGuideMessage(thread.id, result.turnId, result.item);
      showActivity("引导已插入当前任务。", false);
    } else {
      const result = await api(`/api/threads/${encodeURIComponent(thread.id)}/queue`, { method: "POST", body: { projectId: project.id, text } });
      applyQueueSnapshot(thread.id, result.queue, result.queueRevision);
      renderQueue();
      renderThreads();
      renderRunStrip();
      showActivity("任务已进入队列。", false);
    }
    const sentAttachments = new Set(attachments);
    state.composerAttachments = state.composerAttachments.filter((attachment) => !sentAttachments.has(attachment));
    for (const attachment of attachments) if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    renderComposerAttachments();
    if (state.selectedProjectId === project.id && state.selectedThreadId === thread.id && ui.prompt.value === sourcePrompt) {
      ui.prompt.value = "";
    }
    resizePrompt();
  } catch (error) {
    showError(error);
  } finally {
    if (submittedThreadId) state.submittingThreadIds.delete(submittedThreadId);
    state.submittingMessage = false;
    ensureEventStream();
    updateComposer();
  }
}

async function executeGoalCommand(command, project, thread) {
  if (command.action === "show") {
    await openGoalDialog();
    return;
  }
  if (command.action === "set") {
    if (isLocalThreadId(thread.id)) thread = await materializeThread(project, thread, command.objective);
    await patchThreadGoal(project, thread, { objective: command.objective, status: "active" });
    showActivity("目标已启动，Codex 会持续执行到完成或暂停。", false);
    return;
  }
  if (!thread.goal) throw new Error("当前聊天还没有目标。输入 /goal 加目标内容即可启动。");
  if (command.action === "clear") {
    await deleteThreadGoal(project, thread);
    showActivity("目标已清除；当前任务不会被中断。", false);
    return;
  }
  const status = command.action === "pause" ? "paused" : "active";
  await patchThreadGoal(project, thread, { status });
  showActivity(status === "paused" ? "目标已暂停；当前任务会继续到本轮结束。" : "目标已恢复。", false);
}

async function openGoalDialog() {
  const thread = currentThread();
  if (!thread) return;
  state.goalDialogThreadId = thread.id;
  ui.goalForm.dataset.dirty = "false";
  ui.goalFormError.textContent = "";
  renderGoalDialog({ syncFields: true });
  if (!ui.goalDialog.open) {
    ui.goalDialog.showModal();
    ui.goalDialog.querySelector('button[value="cancel"]')?.focus({ preventScroll: true });
  }
  if (isLocalThreadId(thread.id)) return;
  const project = currentProject();
  if (!project) return;
  try {
    const result = await api(`/api/threads/${encodeURIComponent(thread.id)}/goal?projectId=${encodeURIComponent(project.id)}`);
    if (state.goalDialogThreadId !== thread.id) return;
    applyThreadGoal(thread.id, result.goal);
    renderGoalDialog({ syncFields: ui.goalForm.dataset.dirty !== "true" });
  } catch (error) {
    if (state.goalDialogThreadId === thread.id && ui.goalDialog.open) ui.goalFormError.textContent = error.message;
  }
}

function goalDialogThread() {
  const threadId = state.goalDialogThreadId;
  if (!threadId) return null;
  const projectId = findProjectForThread(threadId);
  return projectId ? findThread(projectId, threadId) : null;
}

function renderGoalDialog({ syncFields = false } = {}) {
  const thread = goalDialogThread();
  if (!thread) return;
  const goal = thread.goal || null;
  const presentation = goalPresentation(goal);
  ui.goalSummary.dataset.tone = presentation.tone;
  ui.goalStatusLabel.textContent = presentation.label;
  if (goal) {
    const used = Number.isFinite(Number(goal.tokensUsed)) ? Number(goal.tokensUsed) : 0;
    const budget = Number.isFinite(Number(goal.tokenBudget)) && Number(goal.tokenBudget) > 0 ? Number(goal.tokenBudget) : null;
    const tokens = budget
      ? `${used.toLocaleString()} / ${budget.toLocaleString()} 令牌`
      : `${used.toLocaleString()} 令牌`;
    const elapsed = formatDuration(Math.max(0, Number(goal.timeUsedSeconds) || 0) * 1000);
    ui.goalUsage.textContent = `${tokens} · ${elapsed}`;
  } else {
    ui.goalUsage.textContent = "设置后，Codex 会在聊天空闲时自动继续。";
  }
  if (syncFields) {
    ui.goalObjective.value = goal?.objective || "";
    ui.goalTokenBudget.value = goal?.tokenBudget || "";
  }
  ui.goalClear.hidden = !goal;
  ui.goalToggle.hidden = !presentation.control;
  ui.goalToggle.textContent = presentation.control === "pause" ? "暂停" : "恢复";
  ui.goalSave.textContent = !goal || presentation.status === "complete" ? "启动目标" : "保存修改";
  ui.goalObjective.disabled = state.goalMutating;
  ui.goalTokenBudget.disabled = state.goalMutating;
  ui.goalClear.disabled = state.goalMutating;
  ui.goalToggle.disabled = state.goalMutating;
  ui.goalSave.disabled = state.goalMutating;
}

function applyThreadGoal(threadId, goal) {
  const projectId = findProjectForThread(threadId);
  const thread = projectId && findThread(projectId, threadId);
  if (!thread) return null;
  const updated = updateThreadInState(projectId, { ...thread, goal: goal || null });
  if (state.selectedThreadId === threadId) {
    renderGoalButton();
    updateComposer();
  }
  if (state.goalDialogThreadId === threadId && ui.goalDialog.open) {
    renderGoalDialog({ syncFields: ui.goalForm.dataset.dirty !== "true" });
  }
  renderThreads();
  renderRunStrip();
  return updated;
}

async function patchThreadGoal(project, thread, patch) {
  ensureEventStream();
  await waitForEventStream();
  const result = await api(`/api/threads/${encodeURIComponent(thread.id)}/goal`, {
    method: "PATCH",
    body: { projectId: project.id, ...patch },
  });
  applyThreadGoal(thread.id, result.goal);
  return result.goal;
}

async function deleteThreadGoal(project, thread) {
  const result = await api(`/api/threads/${encodeURIComponent(thread.id)}/goal?projectId=${encodeURIComponent(project.id)}`, { method: "DELETE" });
  applyThreadGoal(thread.id, null);
  return result.cleared;
}

function goalBudgetFromInput() {
  const value = ui.goalTokenBudget.value.trim();
  if (!value) return null;
  const budget = Number(value);
  if (!Number.isSafeInteger(budget) || budget <= 0) throw new Error("令牌预算必须是正整数，或留空表示不限制。");
  return budget;
}

async function saveGoal(event) {
  event.preventDefault();
  if (event.submitter?.value === "cancel") {
    if (ui.goalDialog.open) ui.goalDialog.close("cancel");
    return;
  }
  if (state.goalMutating) return;
  let thread = goalDialogThread();
  const projectId = thread && findProjectForThread(thread.id);
  const project = projectId && state.projects.find((entry) => entry.id === projectId);
  if (!thread || !project) return;
  const objective = ui.goalObjective.value.trim();
  if (!objective) {
    ui.goalFormError.textContent = "请输入长期目标。";
    ui.goalObjective.focus();
    return;
  }
  let tokenBudget;
  try {
    tokenBudget = goalBudgetFromInput();
  } catch (error) {
    ui.goalFormError.textContent = error.message;
    ui.goalTokenBudget.focus();
    return;
  }
  setGoalMutating(true);
  ui.goalFormError.textContent = "";
  try {
    if (isLocalThreadId(thread.id)) {
      thread = await materializeThread(project, thread, objective);
      state.goalDialogThreadId = thread.id;
    }
    const status = !thread.goal || thread.goal.status === "complete" ? "active" : undefined;
    const patch = { objective, tokenBudget, ...(status ? { status } : {}) };
    await patchThreadGoal(project, thread, patch);
    ui.goalForm.dataset.dirty = "false";
    if (ui.goalDialog.open) ui.goalDialog.close();
    showActivity(status === "active" ? "目标已启动，Codex 会持续执行到完成或暂停。" : "目标已更新。", false);
  } catch (error) {
    ui.goalFormError.textContent = error.message;
  } finally {
    setGoalMutating(false);
  }
}

async function toggleGoal() {
  const thread = goalDialogThread();
  const projectId = thread && findProjectForThread(thread.id);
  const project = projectId && state.projects.find((entry) => entry.id === projectId);
  const control = goalPresentation(thread?.goal).control;
  if (!thread || !project || !control || state.goalMutating) return;
  const status = control === "pause" ? "paused" : "active";
  setGoalMutating(true);
  ui.goalFormError.textContent = "";
  try {
    await patchThreadGoal(project, thread, { status });
    if (ui.goalDialog.open) ui.goalDialog.close();
    showActivity(status === "paused" ? "目标已暂停；当前任务会继续到本轮结束。" : "目标已恢复。", false);
  } catch (error) {
    ui.goalFormError.textContent = error.message;
  } finally {
    setGoalMutating(false);
  }
}

async function clearGoal() {
  const thread = goalDialogThread();
  const projectId = thread && findProjectForThread(thread.id);
  const project = projectId && state.projects.find((entry) => entry.id === projectId);
  if (!thread?.goal || !project || state.goalMutating) return;
  const objective = thread.goal.objective;
  if (ui.goalDialog.open) ui.goalDialog.close();
  const confirmed = await confirmAction({
    kicker: "清除目标",
    title: objective.length > 44 ? `${objective.slice(0, 43)}…` : objective,
    message: "这会移除目标和累计用量；已经完成的聊天记录不会删除，当前任务也不会被中断。",
    confirmLabel: "清除目标",
  });
  if (!confirmed) {
    await openGoalDialog();
    return;
  }
  setGoalMutating(true);
  try {
    await deleteThreadGoal(project, thread);
    showActivity("目标已清除；当前任务不会被中断。", false);
  } catch (error) {
    showError(error);
  } finally {
    setGoalMutating(false);
  }
}

function setGoalMutating(value) {
  state.goalMutating = value;
  updateComposer();
  if (state.goalDialogThreadId && ui.goalDialog.open) renderGoalDialog();
}

async function stopCurrentTurn() {
  const project = currentProject();
  const thread = currentThread();
  if (!project || !thread || state.stoppingTurn) return;
  state.stoppingTurn = true;
  updateComposer();
  try {
    const activeTurnId = thread.runtime?.activeTurnId;
    if (!activeTurnId) {
      showActivity("当前任务已经结束。", false);
      return;
    }
    await api(`/api/threads/${encodeURIComponent(thread.id)}/interrupt`, {
      method: "POST",
      body: { projectId: project.id, turnId: activeTurnId },
      timeoutMs: 8000,
    });
    showActivity("已请求停止当前任务。", false);
  } catch (error) {
    showError(error);
  } finally {
    state.stoppingTurn = false;
    if (state.selectedThreadId === thread.id) updateComposer();
  }
}

async function compactCurrentThread() {
  const project = currentProject();
  const thread = currentThread();
  if (!project || !thread || isLocalThreadId(thread.id) || isActiveThreadRuntime(currentRuntime()) || state.compactingThreads.has(thread.id)) return;
  closeThreadMenu();
  state.compactingThreads.add(thread.id);
  renderThreadActions();
  showActivity("正在压缩当前聊天的上下文…", false);
  try {
    await api(`/api/threads/${encodeURIComponent(thread.id)}/compact`, {
      method: "POST",
      body: { projectId: project.id },
    });
  } catch (error) {
    state.compactingThreads.delete(thread.id);
    renderThreadActions();
    showError(error);
  }
}

function openThreadDialog() {
  const thread = currentThread();
  if (!thread || !currentProject()) return;
  ui.threadNameInput.value = thread.name || "";
  ui.threadFormError.textContent = "";
  ui.threadDialog.showModal();
  setTimeout(() => ui.threadNameInput.focus(), 0);
}

async function saveThreadName(event) {
  event.preventDefault();
  if (event.submitter?.value === "cancel") {
    ui.threadDialog.close();
    return;
  }
  const project = currentProject();
  const thread = currentThread();
  if (!thread || !project) return;
  const name = ui.threadNameInput.value.trim();
  if (!name) {
    ui.threadFormError.textContent = "聊天名称不能为空。";
    return;
  }
  if (name === thread.name) {
    ui.threadFormError.textContent = "名称没有变化，请输入新的聊天名称。";
    return;
  }
  if (isLocalThreadId(thread.id)) {
    updateThreadInState(project.id, { id: thread.id, name });
    ui.threadDialog.close();
    renderCurrentThread();
    renderThreads();
    return;
  }
  const submit = ui.threadForm.querySelector('button[value="default"]');
  submit.disabled = true;
  try {
    const result = await api(`/api/threads/${encodeURIComponent(thread.id)}`, { method: "PATCH", body: { projectId: project.id, name } });
    updateThreadInState(project.id, { id: thread.id, name: result.name });
    ui.threadDialog.close();
    if (state.selectedProjectId === project.id && state.selectedThreadId === thread.id) renderCurrentThread();
    renderThreads();
    renderRunStrip();
  } catch (error) {
    ui.threadFormError.textContent = error.message;
  } finally {
    submit.disabled = false;
  }
}

async function deleteCurrentThread() {
  const project = currentProject();
  const thread = currentThread();
  if (!project || !thread) return;
  if (isActiveThreadRuntime(currentRuntime())) {
    showActivity("聊天仍在执行中，请先停止任务再删除。", true);
    return;
  }
  const confirmed = await confirmAction({
    kicker: "删除聊天记录",
    title: threadDisplayName(thread),
    message: "这会永久删除该聊天及其 Codex 历史记录，项目目录和项目文件不会被删除。",
    confirmLabel: "永久删除",
  });
  if (!confirmed) return;
  if (isLocalThreadId(thread.id)) {
    const threads = (state.threads.get(project.id) || []).filter((entry) => entry.id !== thread.id);
    state.threads.set(project.id, threads);
    forgetClientThread(thread.id);
    clearThread();
    renderThreads();
    if (threads[0]) await selectThread(threads[0].id);
    else await createThread({ focusPrompt: false });
    showActivity("空聊天已移除。", false);
    return;
  }
  try {
    await api(`/api/threads/${encodeURIComponent(thread.id)}?projectId=${encodeURIComponent(project.id)}`, { method: "DELETE" });
    forgetClientThread(thread.id);
    if (ui.threadDialog.open) ui.threadDialog.close();
    clearThread();
    const threads = await refreshProjectThreads(project.id);
    if (threads[0]) await selectThread(threads[0].id);
    else await createThread({ focusPrompt: false });
    showActivity("聊天记录已永久删除。", false);
  } catch (error) {
    showError(error);
  }
}

async function changeQueue(itemId, direction) {
  const project = currentProject();
  const thread = currentThread();
  if (!thread || !project) return;
  try {
    const result = await api(`/api/threads/${encodeURIComponent(thread.id)}/queue/${encodeURIComponent(itemId)}`, { method: "PATCH", body: { projectId: project.id, direction } });
    applyQueueSnapshot(thread.id, result.queue, result.queueRevision);
    renderQueue();
  } catch (error) {
    showError(error);
  }
}

async function guideQueueItem(itemId) {
  const project = currentProject();
  const thread = currentThread();
  if (!project || !thread || state.queueGuiding.has(itemId)) return;
  const item = currentQueue().find((entry) => entry.id === itemId);
  const activeTurnId = currentRuntime().activeTurnId;
  if (!item || !activeTurnId) {
    showActivity(item ? "当前任务已经结束，排队任务将按顺序执行。" : "该任务已经离开等待队列。", false);
    return;
  }
  state.queueGuiding.add(itemId);
  renderQueue();
  showActivity("正在把排队任务转入当前信息流…", false);
  try {
    const result = await api(`/api/threads/${encodeURIComponent(thread.id)}/queue/${encodeURIComponent(item.id)}/steer`, {
      method: "POST",
      body: { projectId: project.id, expectedTurnId: activeTurnId },
      timeoutMs: 65000,
    });
    applyQueueSnapshot(thread.id, result.queue, result.queueRevision);
    acceptGuideMessage(thread.id, result.turnId, result.item);
    renderThreads();
    renderRunStrip();
    showActivity("排队任务已转入当前信息流。", false);
  } catch (error) {
    showError(error);
  } finally {
    state.queueGuiding.delete(itemId);
    if (state.selectedThreadId === thread.id) renderQueue();
  }
}

function openQueueEdit(item) {
  if (!currentThread() || !item) return;
  state.editingQueueItemId = item.id;
  ui.queueEditInput.value = item.text || "";
  ui.queueEditError.textContent = "";
  ui.queueEditDialog.showModal();
  setTimeout(() => {
    ui.queueEditInput.focus();
    ui.queueEditInput.setSelectionRange(ui.queueEditInput.value.length, ui.queueEditInput.value.length);
  }, 0);
}

async function saveQueueEdit(event) {
  event.preventDefault();
  if (event.submitter?.value === "cancel") {
    state.editingQueueItemId = null;
    ui.queueEditDialog.close();
    return;
  }
  const thread = currentThread();
  const itemId = state.editingQueueItemId;
  const text = ui.queueEditInput.value.trim();
  if (!thread || !itemId) return;
  if (!text) {
    ui.queueEditError.textContent = "任务内容不能为空。";
    return;
  }
  const existing = currentQueue().find((item) => item.id === itemId);
  if (existing?.text === text) {
    ui.queueEditError.textContent = "内容没有变化。";
    return;
  }
  try {
    const project = currentProject();
    if (!project) return;
    const result = await api(`/api/threads/${encodeURIComponent(thread.id)}/queue/${encodeURIComponent(itemId)}`, { method: "PATCH", body: { projectId: project.id, text } });
    applyQueueSnapshot(thread.id, result.queue, result.queueRevision);
    state.editingQueueItemId = null;
    ui.queueEditDialog.close();
    renderQueue();
    renderThreads();
    renderRunStrip();
    showActivity("排队任务已修改。", false);
  } catch (error) {
    ui.queueEditError.textContent = error.message;
  }
}

async function removeQueue(itemId) {
  const project = currentProject();
  const thread = currentThread();
  if (!thread || !project) return;
  try {
    const result = await api(`/api/threads/${encodeURIComponent(thread.id)}/queue/${encodeURIComponent(itemId)}?projectId=${encodeURIComponent(project.id)}`, { method: "DELETE" });
    applyQueueSnapshot(thread.id, result.queue, result.queueRevision);
    renderQueue();
    renderThreads();
    renderRunStrip();
  } catch (error) {
    showError(error);
  }
}

function openEventStream() {
  const existing = state.eventStream;
  if (existing && existing.readyState !== EventSource.CLOSED) return existing;
  state.eventStream = null;
  const stream = new EventSource("/api/events");
  let interrupted = false;
  stream.addEventListener("open", () => {
    if (interrupted && state.selectedThreadId && !isLocalThreadId(state.selectedThreadId)) {
      reconcileInterruptedThread(state.selectedThreadId).catch(showError);
    }
    interrupted = false;
  });
  stream.addEventListener("error", () => {
    interrupted = true;
  });
  stream.addEventListener("server", (event) => {
    const data = safeJson(event.data);
    applyCodexStatus(data);
    if (data?.status === "ready") scheduleResume(0);
  });
  stream.addEventListener("codex", (event) => {
    const data = safeJson(event.data);
    const threadId = data?.params?.threadId;
    if (threadId) handleCodexEvent(threadId, data);
  });
  state.eventStream = stream;
  return stream;
}

function waitForEventStream() {
  const stream = openEventStream();
  if (stream.readyState === EventSource.OPEN) return Promise.resolve();
  return new Promise((resolveReady, rejectReady) => {
    const finish = (callback, value) => {
      stream.removeEventListener("open", handleOpen);
      stream.removeEventListener("error", handleError);
      callback(value);
    };
    const handleOpen = () => finish(resolveReady);
    const handleError = () => finish(rejectReady, new Error("实时连接未建立，任务没有发送。"));
    stream.addEventListener("open", handleOpen);
    stream.addEventListener("error", handleError);
  });
}

function ensureEventStream() {
  if (state.user) openEventStream();
}

function handleCodexEvent(threadId, event) {
  if (!event) return;
  const params = event.params || {};
  const projectId = findProjectForThread(threadId);
  if (!projectId) return;
  let thread = findThread(projectId, threadId);
  if (!thread) return;
  if (event.method === "thread/goal/updated") {
    applyThreadGoal(threadId, params.goal);
    return;
  }
  if (event.method === "thread/goal/cleared") {
    applyThreadGoal(threadId, null);
    return;
  }
  if ((event.method === "workspace/state" && (isActiveThreadRuntime(params.runtime) || params.activeItems?.length))
    || event.method === "turn/started"
    || event.method === "turn/completed"
    || event.method === "turn/plan/updated"
    || event.method.startsWith("item/")) {
    thread = updateThreadInState(projectId, { id: threadId, historyLive: true });
  }
  if (event.method === "item/tool/requestUserInput") {
    const request = { ...params, requestId: String(params.requestId) };
    state.userInputRequests.set(request.requestId, request);
    if (state.selectedThreadId === threadId) renderUserInputRequest(request);
    clearTurnActivity(params.turnId);
    return;
  }
  if (event.method === "serverRequest/resolved") {
    removeUserInputRequest(params.requestId);
    if (state.selectedThreadId === threadId && currentRuntime().activeTurnId === params.turnId) scheduleTurnActivity(params.turnId);
    return;
  }
  if (event.method === "item/commandExecution/outputDelta") {
    if (params.turnId) clearTurnActivity(params.turnId);
    const previousMetric = state.turnMetrics.get(params.turnId)?.items?.[params.itemId] || {};
    mergeItemMetric(params.turnId, params.itemId, {
      type: "commandExecution",
      status: "inProgress",
      startedAt: timestampMilliseconds(previousMetric.startedAt) || timestampMilliseconds(params.startedAtMs),
    });
    if (params.turnId && params.itemId) {
      const current = rememberedThreadItem(projectId, threadId, params.turnId, params.itemId)
        || currentExecutionItem(params.turnId, params.itemId) || {
        id: params.itemId,
        type: "commandExecution",
        aggregatedOutput: "",
        status: "inProgress",
      };
      const delta = typeof params.delta === "string" ? params.delta : String(params.delta || "");
      const output = commandOutputTail(params.replaceOutput ? "" : current.aggregatedOutput, delta);
      const item = rememberThreadItem(projectId, threadId, params.turnId, {
        ...current,
        aggregatedOutput: output.text,
        outputTruncated: current.outputTruncated || output.truncated || params.replaceOutput,
        status: "inProgress",
      });
      if (state.selectedThreadId === threadId) {
        upsertExecutionItem(params.turnId, item, { outputDelta: params.replaceOutput ? null : delta });
      }
    }
    return;
  }
  if (event.method === "thread/tokenUsage/updated") {
    rememberThreadTokenUsage(threadId, params.tokenUsage);
    scheduleAccountRateLimitsRefresh();
    return;
  }
  if (event.method === "workspace/state") {
    const runtime = params.runtime || thread.runtime;
    updateThreadInState(projectId, {
      ...thread,
      runtime,
      ...(Object.hasOwn(params, "goal") ? { goal: params.goal || null } : {}),
    });
    const changed = applyQueueSnapshot(threadId, params.queue, params.queueRevision);
    syncUserInputRequests(threadId, params.userInputRequests);
    for (const item of params.activeItems || []) {
      const turnId = item.turnId || runtime.activeTurnId;
      if (!turnId || !item.id) continue;
      mergeItemMetric(turnId, item.id, item);
      const stored = rememberThreadItem(projectId, threadId, turnId, { ...item, status: item.status || "inProgress" });
      if (state.selectedThreadId === threadId) upsertExecutionItem(turnId, stored);
    }
    if (state.selectedThreadId === threadId) {
      if (changed) renderQueue();
      if (runtime?.activeTurnId && params.activePlan) renderTurnPlan(runtime.activeTurnId, params.activePlan);
      renderGoalButton();
      updateComposer();
      renderThreadActions();
    }
    renderThreads();
    renderRunStrip();
    return;
  }
  if (event.method === "turn/started") {
    const startedAt = timestampMilliseconds(params.turn?.startedAt);
    mergeTurnMetric(params.turn?.id, { startedAt });
    const runtime = params.runtime;
    rememberThreadTurn(projectId, threadId, params.turn?.id, { ...params.turn, status: params.turn?.status || "inProgress" });
    updateThreadInState(projectId, { ...thread, runtime });
    if (state.selectedThreadId === threadId) {
      appendConversationDate(params.turn?.id, startedAt);
      updateComposer();
      renderQueue();
    }
    renderThreads();
    renderRunStrip();
    if (state.selectedThreadId === threadId) scheduleTurnActivity(params.turn?.id, 0);
    return;
  }
  if (event.method === "thread/name/updated") {
    const name = typeof params.name === "string" ? params.name.trim() : "";
    if (!name) return;
    updateThreadInState(projectId, { ...thread, name });
    if (state.selectedThreadId === threadId) {
      ui.threadName.textContent = name;
      ui.configThreadName.textContent = `当前聊天：${name}`;
    }
    renderThreads();
    renderRunStrip();
    return;
  }
  if (event.method === "thread/status/changed") {
    const runtime = params.runtime;
    const active = isActiveThreadRuntime(runtime);
    const activeTurnId = thread.runtime?.activeTurnId;
    updateThreadInState(projectId, {
      ...thread,
      runtime,
    });
    if (state.selectedThreadId === threadId) {
      if (!active && activeTurnId) completeExecutionGroup(activeTurnId, "interrupted", { completedAt: params.changedAtMs });
      updateComposer();
      renderThreadActions();
    }
    renderThreads();
    renderRunStrip();
    return;
  }
  if (event.method === "turn/completed") {
    const completedAt = timestampMilliseconds(params.turn?.completedAt);
    mergeTurnMetric(params.turn?.id, {
      startedAt: params.turn?.startedAt,
      completedAt,
      durationMs: params.turn?.durationMs,
    });
    rememberThreadTurn(projectId, threadId, params.turn?.id, {
      ...params.turn,
      status: params.turn?.status || "completed",
    });
    updateThreadInState(projectId, { ...thread, runtime: params.runtime });
    if (state.selectedThreadId === threadId) {
      state.compactingThreads.delete(threadId);
      clearTurnActivity(params.turn?.id, { removeEmpty: true });
      completeExecutionGroup(params.turn?.id, params.turn?.status || "completed", params.turn);
      updateComposer();
    }
    reconcileCompletedThread(projectId, threadId).catch(showError);
    renderRunStrip();
    return;
  }
  if (event.method === "queue/updated") {
    const changed = applyQueueSnapshot(threadId, params.queue, params.queueRevision);
    if (changed && state.selectedThreadId === threadId) renderQueue();
    if (changed) {
      renderThreads();
      renderRunStrip();
    }
    return;
  }
  if (event.method === "queue/error") {
    if (state.selectedThreadId === threadId) showActivity(params.message || "队列任务启动失败。", true);
    return;
  }
  if (event.method === "turn/plan/updated") {
    clearTurnActivity(params.turnId);
    mergeTurnMetric(params.turnId, { plan: { plan: params.plan, explanation: params.explanation } });
    if (state.selectedThreadId === threadId) renderTurnPlan(params.turnId, { plan: params.plan, explanation: params.explanation });
    return;
  }
  if (event.method === "turn/diff/updated") {
    const changes = unifiedDiffChanges(params.diff);
    if (!changes.length || !params.turnId) return;
    const itemId = activeFileChangeItemId(projectId, threadId, params.turnId);
    const current = rememberedThreadItem(projectId, threadId, params.turnId, itemId)
      || currentExecutionItem(params.turnId, itemId);
    const item = fileChangeUpdateItem(current, {
      itemId,
      changes,
      startedAtMs: timestampMilliseconds(current?.startedAt) || timestampMilliseconds(params.updatedAtMs) || Date.now(),
    });
    mergeItemMetric(params.turnId, itemId, item);
    rememberThreadItem(projectId, threadId, params.turnId, item);
    if (state.selectedThreadId === threadId) upsertExecutionItem(params.turnId, item);
    return;
  }
  if (event.method.startsWith("item/") && params.turnId) clearTurnActivity(params.turnId);
  if (event.method === "item/started") {
    const item = params.item || {};
    if (item.type === "contextCompaction") {
      state.compactingThreads.add(threadId);
      if (state.selectedThreadId === threadId) renderThreadActions();
    }
    const previousMetric = state.turnMetrics.get(params.turnId)?.items?.[item.id] || {};
    mergeItemMetric(params.turnId, item.id, {
      type: item.type,
      status: item.status || "inProgress",
      startedAt: timestampMilliseconds(params.startedAtMs) || timestampMilliseconds(item.startedAt) || timestampMilliseconds(previousMetric.startedAt),
    });
    rememberThreadItem(projectId, threadId, params.turnId, {
      ...item,
      status: item.status || "inProgress",
      startedAt: timestampMilliseconds(params.startedAtMs) || timestampMilliseconds(item.startedAt),
    });
  } else if (event.method === "item/completed") {
    const item = params.item || {};
    if (item.type === "contextCompaction") {
      state.compactingThreads.delete(threadId);
      renderThreadActions();
    }
    const previousMetric = state.turnMetrics.get(params.turnId)?.items?.[item.id] || {};
    mergeItemMetric(params.turnId, item.id, {
      type: item.type,
      status: terminalExecutionStatus(item.status),
      startedAt: timestampMilliseconds(item.startedAt) || timestampMilliseconds(previousMetric.startedAt),
      completedAt: timestampMilliseconds(params.completedAtMs) || timestampMilliseconds(item.completedAt),
      durationMs: item.durationMs,
    });
    rememberThreadItem(projectId, threadId, params.turnId, {
      ...item,
      status: terminalExecutionStatus(item.status),
      completedAt: timestampMilliseconds(params.completedAtMs) || timestampMilliseconds(item.completedAt),
    });
  } else if (event.method === "item/fileChange/patchUpdated") {
    const previousMetric = state.turnMetrics.get(params.turnId)?.items?.[params.itemId] || {};
    mergeItemMetric(params.turnId, params.itemId, {
      type: "fileChange",
      status: "inProgress",
      startedAt: timestampMilliseconds(previousMetric.startedAt) || timestampMilliseconds(params.startedAtMs),
    });
  }
  if (event.method === "item/agentMessage/delta") {
    const current = rememberedThreadItem(projectId, threadId, params.turnId, params.itemId)
      || { id: params.itemId, type: "agentMessage", phase: "commentary", text: "", status: "inProgress" };
    const item = rememberThreadItem(projectId, threadId, params.turnId, { ...current, text: `${current.text || ""}${params.delta || ""}` });
    if (state.selectedThreadId !== threadId) return;
    const message = addProgressMessage(params.itemId, item.text);
    placeTurnContent(params.turnId, message);
  } else if (event.method === "item/reasoning/summaryTextDelta") {
    const current = rememberedThreadItem(projectId, threadId, params.turnId, params.itemId)
      || currentExecutionItem(params.turnId, params.itemId)
      || { id: params.itemId, type: "reasoning", summary: [], content: [], status: "inProgress" };
    const summary = [...(current.summary || [])];
    summary[params.summaryIndex || 0] = `${summary[params.summaryIndex || 0] || ""}${params.delta || ""}`;
    const item = rememberThreadItem(projectId, threadId, params.turnId, { ...current, summary, status: "inProgress" });
    if (state.selectedThreadId !== threadId) return;
    upsertExecutionItem(params.turnId, item);
  } else if (event.method === "item/reasoning/summaryPartAdded") {
    const current = rememberedThreadItem(projectId, threadId, params.turnId, params.itemId)
      || currentExecutionItem(params.turnId, params.itemId)
      || { id: params.itemId, type: "reasoning", summary: [], content: [], status: "inProgress" };
    const summary = [...(current.summary || [])];
    if (summary[params.summaryIndex] === undefined) summary[params.summaryIndex] = "";
    const item = rememberThreadItem(projectId, threadId, params.turnId, { ...current, summary, status: "inProgress" });
    if (state.selectedThreadId !== threadId) return;
    upsertExecutionItem(params.turnId, item);
  } else if (event.method === "item/reasoning/textDelta") {
    const current = rememberedThreadItem(projectId, threadId, params.turnId, params.itemId)
      || currentExecutionItem(params.turnId, params.itemId)
      || { id: params.itemId, type: "reasoning", summary: [], content: [], status: "inProgress" };
    const content = [...(current.content || [])];
    content[params.contentIndex || 0] = `${content[params.contentIndex || 0] || ""}${params.delta || ""}`;
    const item = rememberThreadItem(projectId, threadId, params.turnId, { ...current, content, status: "inProgress" });
    if (state.selectedThreadId !== threadId) return;
    upsertExecutionItem(params.turnId, item);
  } else if (event.method === "item/fileChange/patchUpdated") {
    const current = rememberedThreadItem(projectId, threadId, params.turnId, params.itemId)
      || currentExecutionItem(params.turnId, params.itemId);
    const item = fileChangeUpdateItem(current, params);
    mergeItemMetric(params.turnId, params.itemId, item);
    rememberThreadItem(projectId, threadId, params.turnId, item);
    if (state.selectedThreadId !== threadId) return;
    upsertExecutionItem(params.turnId, item);
  } else if (event.method === "item/completed") {
    const item = params.item || {};
    const timing = state.turnMetrics.get(params.turnId)?.items?.[item.id] || {};
    if (state.selectedThreadId !== threadId) return;
    if (item.type === "userMessage") {
      renderLiveUserMessage(item, params.turnId);
    } else if ((item.type === "agentMessage" && item.phase !== "commentary") || item.type === "plan") {
      removeExecutionItem(params.turnId, item.id);
      removeRenderedMessage(item.id);
      renderHistoryItem(item, { turnId: params.turnId });
    } else if (item.type === "agentMessage") {
      renderHistoryItem(item, { turnId: params.turnId });
    } else if (isExecutionItem(item)) {
      upsertExecutionItem(params.turnId, { ...item, ...timing, status: terminalExecutionStatus(item.status) });
    }
  } else if (event.method === "item/started") {
    const timing = state.turnMetrics.get(params.turnId)?.items?.[params.item?.id] || {};
    if (state.selectedThreadId !== threadId) return;
    if (params.item?.type === "userMessage") renderLiveUserMessage(params.item, params.turnId);
    else if (isExecutionItem(params.item)) upsertExecutionItem(params.turnId, { ...params.item, ...timing, status: params.item?.status || "inProgress" });
  } else if (event.method === "error") {
    if (state.selectedThreadId === threadId) showActivity(params.message || "Codex 返回错误。", true);
  }
  if (state.selectedThreadId !== threadId) return;
  const completedFinalMessage = event.method === "item/completed"
    && params.item?.type === "agentMessage"
    && params.item?.phase !== "commentary";
  if (event.method === "item/completed" && !completedFinalMessage && currentRuntime().activeTurnId === params.turnId) {
    scheduleTurnActivity(params.turnId);
  }
}

async function reconcileCompletedThread(projectId, threadId) {
  await refreshProjectThreads(projectId);
  ensureEventStream();
}

async function reconcileInterruptedThread(threadId) {
  const projectId = findProjectForThread(threadId);
  if (!projectId) return;
  await refreshProjectThreads(projectId);
  if (state.selectedThreadId === threadId) {
    await selectThread(threadId, { closeNavigation: false, preserveFollowLatest: true, mergeHistory: true });
  } else {
    updateThreadInState(projectId, { id: threadId, historyLive: false, syncedUpdatedAt: null });
  }
}

function findProjectForThread(threadId) {
  for (const [projectId, threads] of state.threads) {
    if (threads.some((thread) => thread.id === threadId)) return projectId;
  }
  return null;
}

function findThread(projectId, threadId) {
  return (state.threads.get(projectId) || []).find((thread) => thread.id === threadId) || null;
}

function updateThreadInState(projectId, updated) {
  const threads = state.threads.get(projectId) || [];
  const index = threads.findIndex((thread) => thread.id === updated.id);
  const stored = index === -1 ? updated : { ...threads[index], ...updated };
  if (index === -1) threads.unshift(stored);
  else threads[index] = stored;
  state.threads.set(projectId, threads);
  return stored;
}

function rememberThreadTurn(projectId, threadId, turnId, patch = {}) {
  if (!turnId) return null;
  const thread = findThread(projectId, threadId);
  if (!thread) return null;
  if (!Array.isArray(thread.turns)) thread.turns = [];
  let turn = thread.turns.find((entry) => entry.id === turnId);
  if (!turn) {
    turn = { id: turnId, status: "inProgress", items: [] };
    thread.turns.push(turn);
  }
  const existingItems = Array.isArray(turn.items) ? turn.items : [];
  const { items: incomingItems, ...fields } = patch;
  Object.assign(turn, fields);
  turn.items = Array.isArray(incomingItems)
    ? mergeTurnItems(existingItems, incomingItems)
    : existingItems;
  return turn;
}

function rememberThreadItem(projectId, threadId, turnId, item) {
  if (!item?.id) return null;
  const turn = rememberThreadTurn(projectId, threadId, turnId);
  if (!turn) return null;
  let stored = turn.items.find((entry) => entry.id === item.id);
  if (!stored) {
    stored = { ...item };
    turn.items.push(stored);
  } else {
    Object.assign(stored, item);
  }
  return stored;
}

function rememberedThreadItem(projectId, threadId, turnId, itemId) {
  return findThread(projectId, threadId)?.turns
    ?.find((turn) => turn.id === turnId)?.items
    ?.find((item) => item.id === itemId) || null;
}

function activeFileChangeItemId(projectId, threadId, turnId) {
  const items = findThread(projectId, threadId)?.turns?.find((turn) => turn.id === turnId)?.items || [];
  const active = [...items].reverse().find((item) => item?.type === "fileChange" && executionStatus(item).tone === "running");
  return active?.id || `${turnId}:diff`;
}

function applyQueueSnapshot(threadId, queue, queueRevision) {
  const revision = Number.isInteger(queueRevision) && queueRevision >= 0 ? queueRevision : null;
  const previous = state.queueSnapshots.get(threadId);
  if (revision !== null && previous?.revision !== null && previous?.revision !== undefined) {
    if (revision < previous.revision) return false;
  }
  const next = Array.isArray(queue) ? queue : [];
  state.queueSnapshots.set(threadId, { queue: next, revision });
  if (state.selectedThreadId === threadId && state.editingQueueItemId && !next.some((item) => item.id === state.editingQueueItemId)) {
    state.editingQueueItemId = null;
    if (ui.queueEditDialog.open) ui.queueEditDialog.close();
  }
  const projectId = findProjectForThread(threadId);
  const thread = projectId && findThread(projectId, threadId);
  if (thread) updateThreadInState(projectId, { ...thread, queueCount: next.length, ...(revision === null ? {} : { queueRevision: revision }) });
  return true;
}

async function saveSettings(overrides = {}, { quiet = false } = {}) {
  const project = currentProject();
  const thread = currentThread();
  if (!project || !thread) return;
  const modelId = Object.hasOwn(overrides, "model") ? overrides.model : ui.model.value;
  const model = state.models.find((entry) => entry.id === modelId);
  const efforts = model?.supportedReasoningEfforts || [];
  const tiers = model?.serviceTiers || [];
  const effortValue = Object.hasOwn(overrides, "effort") ? overrides.effort : (Object.hasOwn(overrides, "model") ? thread.settings?.effort : ui.effort.value);
  const tierValue = Object.hasOwn(overrides, "serviceTier") ? overrides.serviceTier : (Object.hasOwn(overrides, "model") ? thread.settings?.serviceTier : ui.tier.value);
  const effort = efforts.some((entry) => entry.reasoningEffort === effortValue) ? effortValue : (model?.defaultReasoningEffort || efforts[0]?.reasoningEffort);
  const serviceTier = tiers.some((entry) => entry.id === tierValue) ? tierValue : "";
  const settings = {
    model: modelId || null,
    effort: effort || null,
    serviceTier: serviceTier || null,
    summary: (Object.hasOwn(overrides, "summary") ? overrides.summary : ui.summary.value) || "detailed",
    collaborationMode: Object.hasOwn(overrides, "collaborationMode")
      ? overrides.collaborationMode
      : thread.settings?.collaborationMode || "default",
  };
  if (isLocalThreadId(thread.id)) {
    updateThreadInState(project.id, { ...thread, settings });
    renderSettings();
    if (!quiet) showActivity("配置将在首次发送时生效。", false);
    return true;
  }
  try {
    const result = await api(`/api/threads/${encodeURIComponent(thread.id)}`, { method: "PATCH", body: { projectId: project.id, settings } });
    updateThreadInState(project.id, { ...thread, settings: result.settings || {} });
    renderSettings();
    if (!quiet) showActivity("已保存到当前聊天；其他聊天不受影响。", false);
    return true;
  } catch (error) {
    showError(error);
    renderSettings();
    return false;
  }
}

async function refreshWorkspace({ quiet = false } = {}) {
  ui.refreshWorkspace.disabled = true;
  let refresh = state.workspaceRefreshPromise;
  if (!refresh) {
    const rememberedProjectId = state.selectedProjectId;
    const rememberedThreadId = state.selectedThreadId;
    const previousThread = currentThread();
    const selectionId = state.threadSelectionId;
    refresh = (async () => {
      const status = await api("/api/status");
      if (!acceptAssetVersion(status)) return;
      state.workspaceRoot = status.workspaceRoot || null;
      applyCodexStatus(status);
      await loadProjects();
      if (state.codexReady) {
        await Promise.all([loadModels(), loadCollaborationModes(), loadAccountRateLimits(), refreshAllThreads()]);
      }
      const projectId = state.projects.some((project) => project.id === rememberedProjectId) ? rememberedProjectId : state.projects[0]?.id;
      if (projectId && selectionId === state.threadSelectionId) {
        await restoreSelectionAfterRefresh(projectId, rememberedThreadId, previousThread);
      } else {
        renderProjects();
        renderThreads();
        if (!projectId) clearThread();
      }
      if (ui.projectManagerDialog.open) renderProjectManager();
    })();
    state.workspaceRefreshPromise = refresh;
  }
  try {
    await refresh;
    if (!quiet) showActivity("工作台已刷新。", false);
  } catch (error) {
    if (!quiet) showError(error);
    else throw error;
  } finally {
    if (state.workspaceRefreshPromise === refresh) {
      state.workspaceRefreshPromise = null;
      ui.refreshWorkspace.disabled = false;
    }
  }
}

async function restoreSelectionAfterRefresh(projectId, rememberedThreadId, previousThread) {
  state.selectedProjectId = projectId;
  localStorage.setItem(userStorageKey("project"), projectId);
  const threads = state.threads.get(projectId) || [];
  const project = state.projects.find((entry) => entry.id === projectId);
  const target = threads.find((thread) => thread.id === rememberedThreadId)
    || recentThreadEntries(project ? [project] : [], state.threads, 1)[0]?.thread;
  renderProjects();
  if (!target) {
    renderThreads();
    clearThread();
    return createThread({ focusPrompt: false });
  }
  if (!isLocalThreadId(target.id)) {
    if (previousThread?.id === target.id && target.history) {
      state.selectedThreadId = target.id;
      renderThreads();
      ensureEventStream();
      renderCurrentThread({ messages: false });
      return;
    }
    return selectThread(target.id, {
      closeNavigation: false,
      preserveFollowLatest: true,
      mergeHistory: false,
    });
  }
  state.selectedThreadId = target.id;
  renderThreads();
  renderCurrentThread();
}

function configureAutoRefresh() {
  clearInterval(state.refreshTimer);
  const seconds = Number(ui.refreshInterval.value);
  localStorage.setItem(userStorageKey("refresh-seconds"), String(seconds));
  if (Number.isFinite(seconds) && seconds > 0) {
    state.refreshTimer = setInterval(() => {
      refreshWorkspace({ quiet: true }).catch(showError);
    }, seconds * 1000);
  }
}

function scheduleResume(delay = 120) {
  if (!state.booted || document.hidden) return;
  clearTimeout(state.resumeTimer);
  state.resumeTimer = setTimeout(() => {
    state.resumeTimer = null;
    resumeWorkspace().catch(showError);
  }, delay);
}

async function resumeWorkspace() {
  const wasReady = state.codexReady;
  const status = await api("/api/status");
  if (!acceptAssetVersion(status)) return;
  state.serverReachable = true;
  applyCodexStatus(status);
  if (status.status !== "ready") return;
  if (!wasReady || !state.projects.length) {
    await refreshWorkspace({ quiet: true });
    return;
  }
  if (state.selectedProjectId) {
    const selectedThreadId = state.selectedThreadId;
    const before = currentThread()?.runtime;
    await refreshProjectThreads(state.selectedProjectId);
    const after = currentThread()?.runtime;
    const runtimeChanged = selectedThreadId === state.selectedThreadId && (
      (before?.activeTurnId || null) !== (after?.activeTurnId || null)
      || String(before?.status || "idle") !== String(after?.status || "idle")
      || (timestampMilliseconds(before?.startedAt) || null) !== (timestampMilliseconds(after?.startedAt) || null)
    );
    if (selectedThreadId === state.selectedThreadId
      && (runtimeChanged || renderedExecutionNeedsReconciliation(after))
      && currentThread()) renderCurrentThread();
  }
  ensureEventStream();
}

function renderedExecutionNeedsReconciliation(runtime) {
  const activeActivityId = runtime?.activeTurnId ? turnActivityId(runtime.activeTurnId) : null;
  for (const [id, entry] of state.messageElements) {
    if (entry.kind === "progress" && entry.root.classList.contains("waiting") && id !== activeActivityId) return true;
  }
  for (const group of state.executionGroups.values()) {
    const current = isActiveThreadRuntime(runtime) && runtime.activeTurnId === group.turnId;
    if (current) continue;
    if (isActiveThreadStatus(group.turnStatus)) return true;
    for (const entry of group.items.values()) {
      if (isActiveThreadStatus(entry.item?.status)) return true;
    }
  }
  return false;
}

function acceptAssetVersion(status) {
  const version = status?.assetVersion;
  if (!version) return true;
  if (!state.assetVersion) {
    state.assetVersion = version;
    return true;
  }
  if (version === state.assetVersion) return true;
  const hasDraft = Boolean(ui.prompt.value || state.composerAttachments.length || state.submittingMessage || state.uploadingFiles);
  if (hasDraft) {
    showActivity("工作台已更新；发送或清空当前输入后刷新页面。", true);
    return false;
  }
  location.reload();
  return false;
}

function openGlobalSettings() {
  closeTopbarOverlays();
  closeSidebar();
  renderSettings();
  ui.globalConfigDialog.showModal();
}

function openProjectManager() {
  renderProjectManager();
  ui.projectManagerDialog.showModal();
}

function renderProjectManager() {
  ui.projectManagerList.replaceChildren();
  for (const project of state.projects) {
    const row = document.createElement("article");
    row.className = "project-manager-row";
    if (project.id === state.selectedProjectId) row.dataset.selected = "true";
    const detail = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = project.name;
    const path = document.createElement("code");
    path.textContent = project.available === false ? `目录不可用 · ${project.path}` : project.path;
    detail.append(name, path);
    const actions = document.createElement("div");
    actions.className = "project-manager-actions";
    const open = projectAction(project.available === false ? "查看" : "打开", async () => {
      ui.projectManagerDialog.close();
      await selectProject(project.id);
    });
    const rename = projectAction("改名", () => {
      ui.projectManagerDialog.close();
      openProjectRenameDialog(project);
    });
    const edit = projectAction("编辑", () => {
      ui.projectManagerDialog.close();
      openProjectDialog(project);
    });
    const remove = projectAction("删除", () => deleteProjectRecord(project.id));
    rename.disabled = state.submittingMessage;
    edit.disabled = state.submittingMessage;
    remove.disabled = state.submittingMessage || state.projects.length === 1;
    if (state.submittingMessage) {
      rename.title = edit.title = remove.title = "当前消息提交完成后可以修改项目。";
    } else if (remove.disabled) {
      remove.title = "至少保留一个项目。";
    }
    actions.append(open, rename, edit, remove);
    row.append(detail, actions);
    ui.projectManagerList.append(row);
  }
}

function projectAction(label, action) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "quiet-button";
  button.textContent = label;
  button.addEventListener("click", () => Promise.resolve(action()).catch(showError));
  return button;
}

function openProjectRenameDialog(project) {
  ui.projectRenameForm.dataset.projectId = project.id;
  ui.projectRenameInput.value = project.name;
  ui.projectRenameError.textContent = "";
  ui.projectRenameDialog.showModal();
  setTimeout(() => {
    ui.projectRenameInput.focus();
    ui.projectRenameInput.select();
  }, 0);
}

async function saveProjectRename(event) {
  event.preventDefault();
  if (event.submitter?.value === "cancel") {
    ui.projectRenameDialog.close();
    renderProjectManager();
    ui.projectManagerDialog.showModal();
    return;
  }
  if (state.submittingMessage) {
    ui.projectRenameError.textContent = "当前消息提交完成后可以修改项目。";
    return;
  }
  const project = state.projects.find((entry) => entry.id === ui.projectRenameForm.dataset.projectId);
  if (!project) {
    ui.projectRenameError.textContent = "项目不存在或已删除。";
    return;
  }
  const name = ui.projectRenameInput.value.trim();
  if (!name) {
    ui.projectRenameError.textContent = "项目名称不能为空。";
    return;
  }
  if (name === project.name) {
    ui.projectRenameError.textContent = "名称没有变化，请输入新的项目名称。";
    return;
  }
  try {
    const result = await api(`/api/projects/${encodeURIComponent(project.id)}`, { method: "PATCH", body: { name } });
    const index = state.projects.findIndex((entry) => entry.id === project.id);
    state.projects[index] = result.project;
    ui.projectRenameDialog.close();
    renderProjects();
    renderProjectManager();
    renderSettings();
    if (currentThread()) renderCurrentThread();
    ui.projectManagerDialog.showModal();
    showActivity(`项目已改名为“${name}”。`, false);
  } catch (error) {
    ui.projectRenameError.textContent = error.message;
  }
}

function openProjectDialog(project = null) {
  ui.projectForm.dataset.projectId = project?.id || "";
  ui.projectKicker.textContent = project ? "项目设置" : "新项目";
  ui.projectDialogTitle.textContent = project ? "编辑项目" : "新建项目";
  ui.projectName.value = project?.name || "";
  const admin = state.user?.role === "admin";
  ui.projectPath.readOnly = !admin;
  ui.projectPath.setAttribute("aria-readonly", String(!admin));
  ui.projectPath.required = false;
  ui.projectPath.placeholder = admin ? "留空则在个人目录创建，或输入任意绝对目录" : "";
  ui.projectPath.value = project?.path || (admin
    ? ""
    : `${state.workspaceRoot || "工作区根目录"}\\${state.user?.username || "账号"}\\（按项目名称自动创建）`);
  ui.projectError.textContent = "";
  ui.deleteProject.hidden = !project;
  ui.projectDialog.showModal();
  setTimeout(() => ui.projectName.focus(), 0);
}

async function saveProject(event) {
  event.preventDefault();
  if (event.submitter?.value === "cancel") {
    ui.projectDialog.close();
    return;
  }
  if (state.submittingMessage) {
    ui.projectError.textContent = "当前消息提交完成后可以修改项目。";
    return;
  }
  ui.projectError.textContent = "";
  const projectId = ui.projectForm.dataset.projectId;
  const body = {
    name: ui.projectName.value.trim(),
    ...(state.user?.role === "admin" ? { path: ui.projectPath.value.trim() } : {}),
  };
  try {
    const result = await api(projectId ? `/api/projects/${encodeURIComponent(projectId)}` : "/api/projects", { method: projectId ? "PATCH" : "POST", body });
    ui.projectDialog.close();
    await loadProjects();
    await refreshAllThreads();
    await selectProject(result.project.id);
  } catch (error) {
    ui.projectError.textContent = error.message;
  }
}

async function deleteCurrentProject() {
  const project = state.projects.find((entry) => entry.id === ui.projectForm.dataset.projectId);
  if (!project) return;
  await deleteProjectRecord(project.id, true);
}

async function deleteProjectRecord(projectId, closeEditor = false) {
  const project = state.projects.find((entry) => entry.id === projectId);
  if (!project) return;
  if (state.submittingMessage) {
    showActivity("当前消息提交完成后可以删除项目。", true);
    return;
  }
  const confirmed = await confirmAction({
    kicker: "删除项目记录",
    title: project.name,
    message: "只删除工作台中的项目记录；项目目录、项目文件和已有 Codex 聊天不会被删除。",
    confirmLabel: "删除项目记录",
  });
  if (!confirmed) return;
  try {
    await api(`/api/projects/${encodeURIComponent(project.id)}`, { method: "DELETE" });
    if (closeEditor) ui.projectDialog.close();
    for (const thread of state.threads.get(project.id) || []) forgetClientThread(thread.id);
    state.threads.delete(project.id);
    if (state.selectedProjectId === project.id) state.selectedProjectId = null;
    await loadProjects();
    await refreshAllThreads();
    await selectProject(state.selectedProjectId);
    if (ui.projectManagerDialog.open) renderProjectManager();
  } catch (error) {
    if (closeEditor) ui.projectError.textContent = error.message;
    else showError(error);
  }
}

function showActivity(message, error = false) {
  clearTimeout(state.activityTimer);
  ui.activity.textContent = message;
  ui.activity.hidden = !message;
  ui.activity.classList.toggle("error", error);
  if (message) {
    state.activityTimer = setTimeout(() => {
      ui.activity.hidden = true;
      ui.activity.textContent = "";
    }, error ? 6000 : 2600);
  }
}

function showError(error) {
  showActivity(error?.message || "发生未知错误。", true);
}

function applyCodexStatus(status) {
  state.serverReachable = true;
  const codexState = status?.status || "offline";
  const error = status?.codexError || status?.message || "";
  const text = codexState === "ready" ? "本机 Codex 已连接"
    : codexState === "login_required" ? (error || "Codex CLI 尚未登录")
      : codexState === "starting" ? "正在连接本机 Codex"
        : error || (codexState === "failed" ? "本机 Codex 连接失败" : "本机 Codex 连接中断");
  setServerStatus(codexState === "ready", text);
  if (state.codexStatusTimer) clearTimeout(state.codexStatusTimer);
  state.codexStatusTimer = null;
  if (state.user && (codexState === "starting" || codexState === "offline")) {
    state.codexStatusTimer = setTimeout(checkCodexConnection, 2000);
  }
}

function setServerStatus(online, text) {
  state.codexReady = online;
  ui.serverStatus.classList.toggle("online", online);
  ui.serverStatus.classList.toggle("offline", !online);
  ui.serverStatus.textContent = text;
  updateComposer();
}

async function checkCodexConnection() {
  state.codexStatusTimer = null;
  if (!state.user) return;
  try {
    await resumeWorkspace();
  } catch {
    state.serverReachable = false;
    setServerStatus(false, "无法连接 CodexLAN 服务");
    if (state.user) state.codexStatusTimer = setTimeout(checkCodexConnection, 2000);
  }
}

function resizePrompt() {
  resizeComposerInput(ui.prompt);
}

function scrollToLatest(smooth = true) {
  state.followLatest = true;
  state.scrollCommandUntil = Date.now() + (smooth ? 700 : 120);
  ui.jumpLatest.hidden = true;
  requestAnimationFrame(() => ui.conversation.scrollTo({ top: ui.conversation.scrollHeight, behavior: smooth ? "smooth" : "auto" }));
}

function updateJumpLatest() {
  const distance = ui.conversation.scrollHeight - ui.conversation.scrollTop - ui.conversation.clientHeight;
  if (Date.now() < state.scrollCommandUntil) {
    state.followLatest = true;
    ui.jumpLatest.hidden = true;
    return;
  }
  state.followLatest = distance < 72;
  ui.jumpLatest.hidden = state.followLatest || !currentThread() || ui.conversation.scrollHeight <= ui.conversation.clientHeight;
}

function followNewContent() {
  if (state.renderingConversation) return;
  if (state.followLatest) scrollToLatest(false);
  else updateJumpLatest();
}

function cancelScrollCommand() {
  state.scrollCommandUntil = 0;
}

function confirmAction({ kicker, title, message, confirmLabel }) {
  ui.confirmKicker.textContent = kicker;
  ui.confirmTitle.textContent = title;
  ui.confirmMessage.textContent = message;
  ui.confirmSubmit.textContent = confirmLabel;
  ui.confirmDialog.showModal();
  return new Promise((resolve) => {
    const finish = (confirmed) => {
      ui.confirmForm.removeEventListener("submit", onSubmit);
      ui.confirmDialog.removeEventListener("cancel", onCancel);
      if (ui.confirmDialog.open) ui.confirmDialog.close();
      resolve(confirmed);
    };
    const onSubmit = (event) => {
      event.preventDefault();
      finish(event.submitter?.value === "default");
    };
    const onCancel = (event) => {
      event.preventDefault();
      finish(false);
    };
    ui.confirmForm.addEventListener("submit", onSubmit);
    ui.confirmDialog.addEventListener("cancel", onCancel);
  });
}

function renderAccount() {
  const user = state.user;
  if (!user) return;
  const label = user.displayName.trim();
  ui.accountAvatar.textContent = [...label][0] || "我";
  ui.accountDisplayName.textContent = label;
  ui.accountUsername.textContent = `@${user.username}`;
  ui.manageUsers.hidden = user.role !== "admin";
  if (user.mustChangePassword) openPasswordDialog(true);
}

function openPasswordDialog(required = false) {
  closeAccountMenu();
  closeSidebar();
  ui.passwordForm.reset();
  ui.passwordError.textContent = "";
  ui.passwordDialog.dataset.required = String(required);
  ui.closePasswordDialog.hidden = required;
  ui.passwordIntro.textContent = required
    ? "管理员为你设置了临时密码。请先换成只有你知道的新密码。"
    : "修改后，其他设备上的登录会立即失效。";
  ui.passwordDialog.showModal();
  setTimeout(() => ui.currentPassword.focus(), 0);
}

async function saveMyPassword(event) {
  event.preventDefault();
  if (event.submitter?.value === "cancel") {
    if (state.user?.mustChangePassword) return;
    ui.passwordDialog.close();
    return;
  }
  ui.passwordError.textContent = "";
  if (ui.newPassword.value !== ui.newPasswordConfirm.value) {
    ui.passwordError.textContent = "两次输入的新密码不一致。";
    return;
  }
  try {
    const result = await api("/api/auth/password", {
      method: "POST",
      body: { currentPassword: ui.currentPassword.value, newPassword: ui.newPassword.value },
    });
    state.user = result.user;
    state.csrfToken = result.csrfToken;
    renderAccount();
    ui.passwordDialog.close();
    showActivity("密码已修改，其他设备需要重新登录。", false);
  } catch (error) {
    ui.passwordError.textContent = error.message;
  }
}

async function openUserManager() {
  closeAccountMenu();
  closeSidebar();
  try {
    const result = await api("/api/users");
    state.users = result.users || [];
    renderUsers();
    ui.userManagerDialog.showModal();
  } catch (error) {
    showError(error);
  }
}

function renderUsers() {
  ui.userList.replaceChildren();
  for (const user of state.users) {
    const row = document.createElement("article");
    row.className = `user-row${user.active ? "" : " inactive"}`;
    const avatar = document.createElement("span");
    avatar.className = "user-avatar";
    avatar.textContent = [...user.displayName][0] || "人";
    const copy = document.createElement("div");
    copy.className = "user-copy";
    const name = document.createElement("strong");
    name.textContent = user.displayName;
    if (user.role === "admin") {
      const role = document.createElement("i");
      role.className = "user-role";
      role.textContent = "管理员";
      name.append(role);
    }
    const username = document.createElement("small");
    username.textContent = `@${user.username}${user.mustChangePassword ? " · 待修改临时密码" : ""}`;
    copy.append(name, username);
    const actions = document.createElement("div");
    actions.className = "user-actions";
    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "quiet-button";
    reset.textContent = "重设密码";
    reset.disabled = user.id === state.user.id;
    reset.addEventListener("click", () => openUserDialog(user));
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = user.active ? "danger-button" : "quiet-button";
    toggle.textContent = user.active ? "停用" : "启用";
    toggle.disabled = user.id === state.user.id;
    toggle.addEventListener("click", () => setUserActive(user, !user.active));
    actions.append(reset, toggle);
    row.append(avatar, copy, actions);
    ui.userList.append(row);
  }
}

function openUserDialog(user = null) {
  state.editingUserId = user?.id || null;
  ui.userForm.reset();
  ui.userFormError.textContent = "";
  ui.userDialogTitle.textContent = user ? `重设 ${user.displayName} 的密码` : "新增账号";
  ui.newUserFields.hidden = Boolean(user);
  ui.userUsername.required = !user;
  ui.userDisplayName.required = !user;
  ui.userDialog.showModal();
  setTimeout(() => (user ? ui.userPassword : ui.userUsername).focus(), 0);
}

async function saveUser(event) {
  event.preventDefault();
  if (event.submitter?.value === "cancel") return ui.userDialog.close();
  ui.userFormError.textContent = "";
  if (ui.userPassword.value !== ui.userPasswordConfirm.value) {
    ui.userFormError.textContent = "两次输入的临时密码不一致。";
    return;
  }
  try {
    if (state.editingUserId) {
      await api(`/api/users/${encodeURIComponent(state.editingUserId)}/password`, { method: "POST", body: { password: ui.userPassword.value } });
    } else {
      await api("/api/users", {
        method: "POST",
        body: { username: ui.userUsername.value, displayName: ui.userDisplayName.value, password: ui.userPassword.value },
      });
    }
    ui.userDialog.close();
    const result = await api("/api/users");
    state.users = result.users || [];
    renderUsers();
  } catch (error) {
    ui.userFormError.textContent = error.message;
  }
}

async function setUserActive(user, active) {
  const action = active ? "启用" : "停用";
  if (!await confirmAction({ kicker: "成员账号", title: `${action}${user.displayName}`, message: active ? "这个账号将可以重新登录。" : "这个账号会立即退出，已有项目和聊天不会删除。", confirmLabel: action })) return;
  try {
    await api(`/api/users/${encodeURIComponent(user.id)}`, { method: "PATCH", body: { active } });
    const result = await api("/api/users");
    state.users = result.users || [];
    renderUsers();
  } catch (error) {
    showError(error);
  }
}

function forgetClientThread(threadId) {
  state.queueSnapshots.delete(threadId);
  state.threadTokenUsage.delete(threadId);
  for (const [requestId, request] of state.userInputRequests) {
    if (request.threadId === threadId) state.userInputRequests.delete(requestId);
  }
}

window.codexHandleAndroidBack = () => {
  const openDialog = document.querySelector("dialog[open]");
  if (openDialog) {
    const cancel = openDialog.querySelector('button[value="cancel"]');
    if (cancel) cancel.click();
    else openDialog.close();
    return "handled";
  }
  if (state.runStripOpen || !ui.threadMenu.hidden || !ui.accountMenu.hidden) {
    closeTopbarOverlays();
    return "handled";
  }
  if (ui.sidebar.classList.contains("open")) {
    closeSidebar();
    return "handled";
  }
  return "exit";
};

function userStorageKey(name) {
  return `codex-workspace-${name}:${state.user?.id || "anonymous"}`;
}

function safeJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function api(path, options = {}) {
  const method = options.method || "GET";
  const headers = {};
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  options.signal?.addEventListener("abort", abortFromCaller, { once: true });
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 30000);
  if (options.body) headers["Content-Type"] = "application/json";
  if (!["GET", "HEAD"].includes(method) && state.csrfToken) headers["X-Codex-CSRF-Token"] = state.csrfToken;
  try {
    const response = await fetch(path, {
      method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    const body = await response.json().catch(() => ({}));
    if (response.status === 401) location.reload();
    if (!response.ok) throw new Error(body.error || `请求失败（${response.status}）`);
    return body;
  } catch (error) {
    if (error?.name === "AbortError" && options.signal?.aborted) throw error;
    if (error?.name === "AbortError") throw new Error("请求超时，请检查连接后重试。");
    throw error;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abortFromCaller);
  }
}

async function submitLogin(event) {
  event.preventDefault();
  ui.loginError.textContent = "";
  try {
    await authRequest("/api/auth/login", { username: ui.loginUsername.value, password: ui.loginPassword.value });
    location.reload();
  } catch (error) {
    ui.loginError.textContent = error.message;
  }
}

async function submitSetup(event) {
  event.preventDefault();
  ui.setupError.textContent = "";
  if (ui.setupPassword.value !== ui.setupPasswordConfirm.value) {
    ui.setupError.textContent = "两次输入的管理员密码不一致。";
    return;
  }
  try {
    await authRequest("/api/auth/setup", {
      username: ui.setupUsername.value,
      displayName: ui.setupDisplayName.value,
      password: ui.setupPassword.value,
    });
    location.reload();
  } catch (error) {
    ui.setupError.textContent = error.message;
  }
}

async function authRequest(path, body) {
  const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `请求失败（${response.status}）`);
  return result;
}

ui.loginForm.addEventListener("submit", submitLogin);
ui.setupForm.addEventListener("submit", submitSetup);
ui.manageUsers.addEventListener("click", openUserManager);
ui.changePassword.addEventListener("click", () => openPasswordDialog(false));
ui.logout.addEventListener("click", async () => {
  try {
    await api("/api/auth/logout", { method: "POST" });
  } finally {
    location.reload();
  }
});
ui.passwordForm.addEventListener("submit", saveMyPassword);
ui.passwordDialog.addEventListener("cancel", (event) => {
  if (state.user?.mustChangePassword) event.preventDefault();
});
ui.addUser.addEventListener("click", () => openUserDialog());
ui.userForm.addEventListener("submit", saveUser);
ui.addProject.addEventListener("click", () => openProjectDialog());
ui.manageProjectsSide.addEventListener("click", openProjectManager);
function reloadPage() {
  location.reload();
}

ui.refreshWorkspace.addEventListener("click", reloadPage);
ui.mobileRefresh.addEventListener("click", reloadPage);
ui.openGlobalSettings.addEventListener("click", openGlobalSettings);
ui.newThread.addEventListener("click", () => createThread().catch(showError));
ui.quickNewThread.addEventListener("click", () => createThread().catch(showError));
ui.guide.addEventListener("click", () => { state.mode = "guide"; updateComposer(); });
ui.queue.addEventListener("click", () => { state.mode = "queue"; updateComposer(); });
ui.planMode.addEventListener("click", async () => {
  const thread = currentThread();
  if (!thread || isActiveThreadRuntime(currentRuntime()) || isActiveGoal(thread.goal)) return;
  const active = thread.settings?.collaborationMode === "plan";
  if (await saveSettings({ collaborationMode: active ? "default" : "plan" }, { quiet: true })) {
    showActivity(active ? "已退出规划模式。" : "已进入规划模式。", false);
  }
});
ui.goalMode.addEventListener("click", () => { void openGoalDialog(); });
ui.goalForm.addEventListener("submit", saveGoal);
ui.goalToggle.addEventListener("click", () => { void toggleGoal(); });
ui.goalClear.addEventListener("click", () => { void clearGoal(); });
ui.goalObjective.addEventListener("input", () => { ui.goalForm.dataset.dirty = "true"; });
ui.goalTokenBudget.addEventListener("input", () => { ui.goalForm.dataset.dirty = "true"; });
ui.goalDialog.addEventListener("close", () => {
  state.goalDialogThreadId = null;
  ui.goalForm.dataset.dirty = "false";
  ui.goalFormError.textContent = "";
});
ui.composer.addEventListener("submit", submitPrompt);
ui.uploadFiles.addEventListener("click", chooseUploadFiles);
ui.uploadFileInput.addEventListener("change", () => uploadSelectedFiles());
ui.prompt.addEventListener("paste", (event) => { void pasteClipboardImages(event).catch(showError); });
ui.prompt.addEventListener("input", () => {
  resizePrompt();
  updateComposer();
});
ui.stop.addEventListener("click", stopCurrentTurn);
ui.renameThread.addEventListener("click", () => { closeThreadMenu(); openThreadDialog(); });
ui.compactThread.addEventListener("click", compactCurrentThread);
ui.deleteThread.addEventListener("click", () => { closeThreadMenu(); deleteCurrentThread(); });
ui.threadForm.addEventListener("submit", saveThreadName);
ui.queueEditForm.addEventListener("submit", saveQueueEdit);
ui.jumpLatest.addEventListener("click", () => scrollToLatest());
ui.closeMarkdownPreview.addEventListener("click", () => ui.markdownPreviewDialog.close());
ui.markdownPreviewDialog.addEventListener("close", () => {
  markdownPreviewRequest += 1;
  ui.markdownPreviewBody.replaceChildren();
});
ui.markdownPreviewDialog.addEventListener("click", (event) => {
  if (event.target === ui.markdownPreviewDialog) ui.markdownPreviewDialog.close();
});
ui.conversation.addEventListener("scroll", updateJumpLatest, { passive: true });
ui.model.addEventListener("change", () => saveSettings({ model: ui.model.value }));
ui.effort.addEventListener("change", () => saveSettings({ effort: ui.effort.value }));
ui.tier.addEventListener("change", () => saveSettings({ serviceTier: ui.tier.value }));
ui.summary.addEventListener("change", () => saveSettings({ summary: ui.summary.value }));
ui.composerModel.addEventListener("change", () => saveSettings({ model: ui.composerModel.value }));
ui.composerEffort.addEventListener("change", () => saveSettings({ effort: ui.composerEffort.value }));
ui.composerTier.addEventListener("change", () => saveSettings({ serviceTier: ui.composerTier.value }));
ui.refreshInterval.addEventListener("change", configureAutoRefresh);
ui.refreshFromConfig.addEventListener("click", () => refreshWorkspace());
ui.projectForm.addEventListener("submit", saveProject);
ui.projectRenameForm.addEventListener("submit", saveProjectRename);
ui.deleteProject.addEventListener("click", deleteCurrentProject);
ui.newProjectFromManager.addEventListener("click", () => {
  ui.projectManagerDialog.close();
  openProjectDialog();
});
for (const dialog of document.querySelectorAll("dialog")) {
  for (const cancelButton of dialog.querySelectorAll('button[value="cancel"]')) {
    cancelButton.formNoValidate = true;
  }
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog || dialog.dataset.required === "true") return;
    const bounds = dialog.getBoundingClientRect();
    const inside = event.clientX >= bounds.left && event.clientX <= bounds.right
      && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
    if (!inside) dialog.close("cancel");
  });
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") scheduleResume(0);
});
window.addEventListener("pageshow", (event) => {
  if (event.persisted) scheduleResume(0);
});
window.addEventListener("online", () => scheduleResume(0));
window.addEventListener("focus", () => scheduleResume());
window.addEventListener("codex-native-resume", () => scheduleResume(0));
layout.bind();
ui.openSettings.addEventListener("click", () => {
  if (window.CodexAndroid?.openConnectionSettings) window.CodexAndroid.openConnectionSettings();
  else ui.connectionDialog.showModal();
});
