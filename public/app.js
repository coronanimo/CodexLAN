import { downloadableFiles } from "./file-downloads.js?v=0.6.6-code-line-preview";
import { renderMarkdownDocument } from "./markdown-preview.js?v=0.6.46-math";
import { formatJsonText, plainInlineMarkdown } from "./text-format.js?v=0.6.44-workbench";
import { textPreviewKind } from "./file-preview.js?v=0.6.6-text-preview";
import { projectForLocalFile } from "./file-access.js?v=0.6.6-local-file-preview";
import { elapsedTiming, formatDuration, formatElapsed, timestampMilliseconds } from "./elapsed-time.js?v=0.6.29-command-timing";
import { fileChangeUpdateItem, mergeHistoricalExecutionItem, reconcileStaleExecutionTurn, terminalExecutionStatus } from "./execution-events.js?v=0.6.35-active-runtime-wins";
import { summarizeExecutionTiming } from "./execution-timing.js?v=0.6.6-complete-timing";
import { parseTimingState, resolveActiveTurnStartedAt, serializeTimingState } from "./timing-persistence.js?v=0.6.6-persistent-timing";
import { recentThreadEntries } from "./recent-threads.js?v=0.6.6-compact-navigation";
import { alignItemMetrics, restoreMissingExecutionItems } from "./timing-alignment.js?v=0.6.31-command-snapshots";
import { accountLimitWindows, contextWindowUsage } from "./usage-indicators.js?v=0.6.7-usage-meters";
import { newThreadSettings } from "./thread-defaults.js?v=0.6.23-thread-defaults";
import { renderAnsiOutput } from "./ansi-output.js?v=0.6.36-ansi-output";
import { diffLineStats, renderFileChanges } from "./diff-output.js?v=0.6.41-diff-kind-stats";
import { isMobileComposer, shouldSubmitPromptFromKeyboard } from "./composer-input.js?v=0.6.40-ime-enter";
import { clipboardImageFiles, clipboardImageName, messageWithAttachments } from "./composer-attachments.js?v=0.6.43-clipboard-images";

const $ = (selector) => document.querySelector(selector);

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
  setupToken: $("#setup-token"),
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
  deleteThread: $("#delete-thread"),
  conversation: $("#conversation"),
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
  accountRateLimits: null,
  threadTokenUsage: new Map(),
  threads: new Map(),
  selectedProjectId: null,
  selectedThreads: {},
  currentThread: null,
  loadingHistory: false,
  currentQueue: [],
  queueSnapshots: new Map(),
  queueGuiding: new Set(),
  editingQueueItemId: null,
  mode: "queue",
  runStripOpen: false,
  refreshTimer: null,
  refreshing: false,
  materializingThread: false,
  uploadingFiles: false,
  projectAttachmentStorage: false,
  composerAttachments: [],
  stoppingTurn: false,
  followLatest: true,
  scrollCommandUntil: 0,
  renderingConversation: false,
  streams: new Map(),
  messageElements: new Map(),
  pendingUserMessages: [],
  executionGroups: new Map(),
  executionIdleTimers: new Map(),
  turnMetrics: new Map(),
  activeTurnStarts: new Map(),
  timingSaveTimer: null,
  activityTimer: null,
  elapsedTimer: null,
  booted: false,
  resumeTimer: null,
  resumePromise: null,
  lastResumeAt: 0,
  workspaceStarted: false,
  localThreadSequence: 0,
  editingUserId: null,
  accountLimitsTimer: null,
};

boot().catch((error) => showAuth(false, error.message));

async function boot() {
  const response = await fetch("/api/auth/session");
  const body = await response.json().catch(() => ({}));
  if (!response.ok) return showAuth(Boolean(body.setupRequired));
  await enterWorkspace(body);
}

async function enterWorkspace(session) {
  state.user = session.user;
  state.csrfToken = session.csrfToken;
  loadTimingState();
  loadThreadTokenUsage();
  state.selectedProjectId = localStorage.getItem(userStorageKey("project")) || null;
  state.selectedThreads = loadSelection();
  ui.authShell.hidden = true;
  ui.app.hidden = false;
  renderAccount();
  if (state.workspaceStarted) return refreshWorkspace();
  state.workspaceStarted = true;
  const status = await api("/api/status");
  state.projectAttachmentStorage = status.capabilities?.projectAttachmentStorage === true;
  setServerStatus(status.status === "ready", status.status === "ready" ? "本机 Codex 已连接" : "正在启动本机 Codex");
  ui.connectionAddress.textContent = location.origin;
  ui.globalConnectionAddress.textContent = location.origin;
  ui.refreshInterval.value = localStorage.getItem(userStorageKey("refresh-seconds")) || "0";
  await Promise.all([loadProjects(), loadModels(), loadAccountRateLimits()]);
  await refreshAllThreads();
  if (!currentProject()) state.selectedProjectId = state.projects[0]?.id || null;
  await selectProject(state.selectedProjectId);
  configureAutoRefresh();
  state.booted = true;
}

function showAuth(setupRequired, message = "") {
  closeAllStreams();
  state.booted = false;
  ui.app.hidden = true;
  ui.authShell.hidden = false;
  ui.loginForm.hidden = setupRequired;
  ui.setupForm.hidden = !setupRequired;
  ui.loginError.textContent = setupRequired ? "" : message;
  ui.setupError.textContent = setupRequired ? message : "";
  ui.authKicker.textContent = setupRequired ? "首次初始化" : "个人工作区";
  ui.authTitle.textContent = setupRequired ? "创建管理员账号" : "登录 Codex 工作台";
  ui.authDescription.textContent = setupRequired
    ? "输入启动窗口中的初始化密钥，现有项目和聊天会归到这个账号。"
    : "进入只属于你的项目与聊天。";
  setTimeout(() => (setupRequired ? ui.setupToken : ui.loginUsername).focus(), 0);
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

function loadThreadTokenUsage() {
  state.threadTokenUsage.clear();
  const stored = safeJson(localStorage.getItem(userStorageKey("thread-token-usage")));
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return;
  for (const [threadId, tokenUsage] of Object.entries(stored)) {
    if (contextWindowUsage(tokenUsage)) state.threadTokenUsage.set(threadId, tokenUsage);
  }
}

function rememberThreadTokenUsage(threadId, tokenUsage) {
  if (!threadId || !contextWindowUsage(tokenUsage)) return;
  state.threadTokenUsage.delete(threadId);
  state.threadTokenUsage.set(threadId, tokenUsage);
  while (state.threadTokenUsage.size > 200) state.threadTokenUsage.delete(state.threadTokenUsage.keys().next().value);
  localStorage.setItem(userStorageKey("thread-token-usage"), JSON.stringify(Object.fromEntries(state.threadTokenUsage)));
  if (state.currentThread?.id === threadId) renderContextUsage();
}

function renderContextUsage() {
  const usage = contextWindowUsage(state.threadTokenUsage.get(state.currentThread?.id));
  ui.contextUsage.hidden = !usage;
  if (!usage) return;
  const percent = Math.round(usage.usedPercent);
  ui.contextUsageFill.style.width = `${usage.usedPercent}%`;
  ui.contextUsageLabel.textContent = `窗口 ${percent}%`;
  ui.contextUsage.title = `当前上下文 ${usage.usedTokens.toLocaleString()} / ${usage.contextWindow.toLocaleString()} tokens`;
  ui.contextUsage.classList.toggle("warn", percent >= 75 && percent < 90);
  ui.contextUsage.classList.toggle("critical", percent >= 90);
}

async function refreshAllThreads() {
  await Promise.all(state.projects.map((project) => refreshProjectThreads(project.id)));
  syncEventStreams();
  renderRunStrip();
}

async function refreshProjectThreads(projectId) {
  const result = await api(`/api/projects/${encodeURIComponent(projectId)}/threads`);
  const previousThreads = state.threads.get(projectId) || [];
  const previousRuntimeById = new Map(previousThreads.map((thread) => [thread.id, thread.runtime]));
  const localDrafts = previousThreads.filter((thread) => isLocalThreadId(thread.id));
  const threads = [...localDrafts, ...(result.threads || []).map((thread) => {
    const previousRuntime = previousRuntimeById.get(thread.id);
    const normalized = { ...thread, runtime: ensureRuntimeStartedAt(thread.runtime, previousRuntime, thread.id) };
    const snapshot = state.queueSnapshots.get(thread.id);
    if (!snapshot || snapshot.revision === null || snapshot.revision === undefined || !Number.isInteger(normalized.queueRevision)) return normalized;
    if (normalized.queueRevision > snapshot.revision || (normalized.queueRevision === snapshot.revision && !snapshot.optimistic)) return normalized;
    return { ...normalized, queueCount: snapshot.queue.length, queueRevision: snapshot.revision };
  })];
  state.threads.set(projectId, threads);
  if (projectId === state.selectedProjectId) renderThreads();
  renderRunStrip();
  return threads;
}

async function selectProject(projectId, { keepSidebarOpen = false, preserveFollowLatest = false } = {}) {
  const project = state.projects.find((entry) => entry.id === projectId);
  if (!project) return;
  const changedProject = state.selectedProjectId !== project.id;
  state.selectedProjectId = project.id;
  if (changedProject) {
    state.currentThread = null;
    state.currentQueue = [];
    clearComposerAttachments();
  }
  if (!keepSidebarOpen) closeSidebar();
  localStorage.setItem(userStorageKey("project"), project.id);
  renderProjects();
  renderThreads();
  renderSettings();
  const threads = state.threads.get(project.id) || [];
  const storedThreadId = state.selectedThreads[project.id];
  const nextThread = threads.find((thread) => thread.id === storedThreadId) || threads[0];
  if (nextThread) await selectThread(nextThread.id, { closeNavigation: !keepSidebarOpen, preserveFollowLatest });
  else await createThread({ focusPrompt: false });
}

async function selectThread(threadId, { closeNavigation = true, preserveFollowLatest = false, mergeHistory = false } = {}) {
  const project = currentProject();
  if (!project || !threadId) return;
  const listedThread = findThread(project.id, threadId);
  if (!preserveFollowLatest) state.followLatest = true;
  if (closeNavigation) closeSidebar();
  if (isLocalThreadId(threadId) && listedThread) {
    state.currentThread = listedThread;
    state.currentQueue = [];
    state.selectedThreads[project.id] = threadId;
    saveSelection();
    renderThreads();
    renderCurrentThread();
    ui.prompt.focus();
    return;
  }
  const result = await api(`/api/threads/${encodeURIComponent(threadId)}?projectId=${encodeURIComponent(project.id)}`);
  ingestTurnMetrics(result.metrics);
  if (result.tokenUsage) rememberThreadTokenUsage(threadId, result.tokenUsage);
  const previous = state.currentThread?.id === threadId ? state.currentThread : null;
  const turns = mergeHistory && previous
    ? mergeTurnPages(previous.turns || [], result.thread.turns || [])
    : result.thread.turns || [];
  const history = mergeHistory && previous?.history
    ? { ...result.history, hasMore: previous.history.hasMore, before: previous.history.before }
    : result.history;
  state.currentThread = {
    ...result.thread,
    turns,
    history,
    syncedUpdatedAt: listedThread?.updatedAt ?? result.thread.updatedAt,
    runtime: ensureRuntimeStartedAt(result.runtime || result.thread.runtime, listedThread?.runtime, threadId),
  };
  updateThreadInState(project.id, state.currentThread);
  if (!applyQueueSnapshot(threadId, result.queue, result.queueRevision)) {
    state.currentQueue = state.queueSnapshots.get(threadId)?.queue || [];
  }
  state.selectedThreads[project.id] = threadId;
  saveSelection();
  openEventStream(threadId);
  syncEventStreams();
  renderThreads();
  renderCurrentThread();
}

function clearThread() {
  state.currentThread = null;
  state.currentQueue = [];
  ui.threadName.textContent = "尚未打开聊天";
  ui.openRecentThreads.disabled = true;
  closeRecentThreads();
  ui.openThreadMenu.disabled = true;
  ui.renameThread.disabled = true;
  ui.deleteThread.disabled = true;
  ui.stop.disabled = true;
  renderConversation([]);
  renderQueue();
  updateComposer();
  renderSettings();
  ui.jumpLatest.hidden = true;
  renderContextUsage();
}

function currentProject() {
  return state.projects.find((project) => project.id === state.selectedProjectId) || null;
}

function currentRuntime() {
  return state.currentThread?.runtime || { activeTurnId: null, status: "idle" };
}

function runtimeIsActive(runtime) {
  const status = typeof runtime?.status === "string" ? runtime.status : runtime?.status?.type;
  return Boolean(runtime?.activeTurnId) || ["active", "running", "inProgress"].includes(status);
}

function ensureRuntimeStartedAt(runtime, previousRuntime, threadId) {
  if (!runtimeIsActive(runtime)) {
    forgetActiveTurnStart(threadId);
    return runtime;
  }
  const turnId = runtime?.activeTurnId || previousRuntime?.activeTurnId || null;
  const startedAt = resolveActiveTurnStartedAt({
    runtime,
    previousRuntime,
    metric: turnId ? state.turnMetrics.get(turnId) : null,
    saved: threadId ? state.activeTurnStarts.get(threadId) : null,
  });
  rememberActiveTurnStart(threadId, turnId, startedAt);
  if (turnId) mergeTurnMetric(turnId, { startedAt });
  return { ...runtime, ...(turnId ? { activeTurnId: turnId } : {}), startedAt };
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
  const active = runtimeIsActive(currentRuntime())
    || visibleExecutionRunning
    || state.projects.some((project) => (state.threads.get(project.id) || []).some((thread) => runtimeIsActive(thread.runtime)));
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
  scheduleTimingStateSave();
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
  const alignedMetrics = alignItemMetrics(items, metric.items);
  timed.items = items.map((item) => {
    const itemMetric = alignedMetrics.get(item.id);
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
    const name = document.createElement("strong");
    name.textContent = project.name;
    const path = document.createElement("small");
    path.textContent = project.path;
    button.append(name, path);
    button.addEventListener("click", () => selectProject(project.id, { keepSidebarOpen: true }).catch(showError));
    ui.projectList.append(button);
  }
  const projectName = currentProject()?.name || "尚未选择";
  ui.desktopProjectName.textContent = projectName;
  const canCreateThread = Boolean(currentProject());
  ui.newThread.disabled = !canCreateThread;
  ui.quickNewThread.disabled = !canCreateThread;
  renderRecentThreads();
}

function renderThreads() {
  ui.threadList.replaceChildren();
  const project = currentProject();
  if (!project) return;
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
    if (thread.id === state.currentThread?.id) button.classList.add("active");
    if (runtimeIsActive(thread.runtime)) button.classList.add("running");
    const title = document.createElement("strong");
    title.textContent = thread.name || "未命名聊天";
    const details = document.createElement("small");
    const queueCount = thread.queueCount || 0;
    if (runtimeIsActive(thread.runtime)) setElapsedDisplay(details, "执行中", thread.runtime);
    else details.textContent = queueCount ? `队列 ${queueCount}` : "空闲";
    button.append(title, details);
    button.addEventListener("click", () => selectThread(thread.id).catch(showError));
    ui.threadList.append(button);
  }
  renderRecentThreads();
}

function renderRecentThreads() {
  const entries = recentThreadEntries(state.projects, state.threads, 6);
  ui.openRecentThreads.disabled = !state.currentThread || entries.length === 0;
  const signature = JSON.stringify(entries.map(({ project, thread }) => [
    project.id,
    project.name,
    thread.id,
    thread.name,
    runtimeIsActive(thread.runtime),
    thread.id === state.currentThread?.id,
  ]));
  if (ui.recentThreadMenu.dataset.signature === signature) return;
  const scrollTop = ui.recentThreadMenu.scrollTop;
  ui.recentThreadMenu.dataset.signature = signature;
  ui.recentThreadMenu.replaceChildren();
  for (const { project, thread } of entries) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "recent-thread-item";
    if (thread.id === state.currentThread?.id) button.classList.add("active");
    if (runtimeIsActive(thread.runtime)) button.classList.add("running");
    const title = document.createElement("strong");
    title.textContent = thread.name || "未命名聊天";
    const projectName = document.createElement("small");
    projectName.textContent = project.name;
    button.append(title, projectName);
    button.addEventListener("click", async () => {
      closeRecentThreads();
      if (project.id === state.selectedProjectId && thread.id === state.currentThread?.id) return;
      state.selectedThreads[project.id] = thread.id;
      saveSelection();
      await selectProject(project.id);
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
      if (runtimeIsActive(thread.runtime) || thread.queueCount) running.push({ project, thread });
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
  const activeCount = running.filter(({ thread }) => runtimeIsActive(thread.runtime)).length;
  const queuedCount = running.reduce((total, { thread }) => total + (thread.queueCount || 0), 0);
  ui.runStatus.hidden = false;
  ui.runStatus.classList.toggle("queue-only", activeCount === 0);
  const statusText = activeCount ? `${activeCount} 个聊天正在运行` : `${queuedCount} 个任务正在排队`;
  ui.runStatusLabel.textContent = statusText;
  ui.runStatus.setAttribute("aria-label", statusText);
  ui.runStatus.title = statusText;
  ui.runStatus.setAttribute("aria-expanded", String(state.runStripOpen));
  ui.runStrip.hidden = !state.runStripOpen;
  for (const { project, thread } of running) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "run-card";
    if (thread.id === state.currentThread?.id) button.classList.add("active");
    const dot = document.createElement("span");
    dot.className = `run-card-dot${runtimeIsActive(thread.runtime) ? "" : " queue"}`;
    const words = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = `${project.name} · ${thread.name || "未命名聊天"}`;
    const detail = document.createElement("small");
    if (runtimeIsActive(thread.runtime)) setElapsedDisplay(detail, "正在执行", thread.runtime);
    else detail.textContent = `等待队列 ${thread.queueCount}`;
    words.append(title, detail);
    button.append(dot, words);
    button.addEventListener("click", async () => {
      closeRunStrip();
      await selectProject(project.id);
      await selectThread(thread.id);
    });
    ui.runStrip.append(button);
  }
  syncElapsedTimer();
}

function renderSettings() {
  const thread = state.currentThread;
  const settings = thread?.settings || {};
  const selectedModel = selectedModelForThread(thread);
  fillOptions(ui.model, state.models, (model) => model.displayName || model.id, selectedModel?.id, "当前模型不可用");
  fillOptions(ui.composerModel, state.models, compactModelLabel, selectedModel?.id, "No model");
  const efforts = selectedModel?.supportedReasoningEfforts || [];
  const selectedEffort = settings.effort || selectedModel?.defaultReasoningEffort || efforts[0]?.reasoningEffort;
  fillOptions(ui.effort, efforts, (effort) => reasoningLabel(effort.reasoningEffort), selectedEffort, "Default");
  fillCompactEffortOptions(ui.composerEffort, efforts, selectedEffort);
  const tiers = selectedModel?.serviceTiers || [];
  const selectedTier = settings.serviceTier || "";
  fillTierOptions(ui.tier, tiers, selectedTier);
  fillCompactTierOptions(ui.composerTier, tiers, selectedTier);
  ui.summary.value = ["auto", "concise", "detailed", "none"].includes(settings.summary) ? settings.summary : "detailed";
  ui.tierField.hidden = !selectedModel;
  const disabled = !thread || !state.models.length;
  ui.model.disabled = disabled;
  ui.composerModel.disabled = disabled;
  ui.effort.disabled = disabled || !efforts.length;
  ui.composerEffort.disabled = disabled || !efforts.length;
  ui.tier.disabled = disabled || !tiers.length;
  ui.composerTier.disabled = disabled || !tiers.length;
  ui.summary.disabled = !thread;
  ui.configThreadName.textContent = thread ? `当前聊天：${thread.name || "未命名聊天"}` : "请先选择聊天。";
  const selectedTierEntry = tiers.find((tier) => tier.id === selectedTier);
  ui.tierDescription.textContent = selectedTierEntry
    ? `${serviceTierLabel(selectedTierEntry)}: ${selectedTierEntry.description || "Accelerated service tier."}`
    : tiers.length
      ? "Standard (Default): no accelerated service tier requested."
      : "This model does not offer optional service tiers.";
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
  select.append(new Option("Standard (Default)", "", false, !selectedId));
  for (const tier of tiers) {
    const option = new Option(serviceTierLabel(tier), tier.id, false, tier.id === selectedId);
    select.append(option);
  }
}

function fillCompactTierOptions(select, tiers, selectedId) {
  select.replaceChildren();
  select.append(new Option("Standard", "", false, !selectedId));
  for (const tier of tiers) select.append(new Option(serviceTierLabel(tier), tier.id, false, tier.id === selectedId));
}

function fillCompactEffortOptions(select, efforts, selectedId) {
  select.replaceChildren();
  if (!efforts.length) {
    select.append(new Option("Reasoning", ""));
    return;
  }
  for (const effort of efforts) {
    const value = effort.reasoningEffort;
    select.append(new Option(reasoningLabel(value), value, false, value === selectedId));
  }
}

function reasoningLabel(effort) {
  return ({ low: "Low", medium: "Medium", high: "High", xhigh: "XHigh", max: "Max", ultra: "Ultra" })[effort] || "Default";
}

function compactModelLabel(model) {
  const label = String(model?.displayName || model?.id || "Model");
  return label.replace(/^gpt[-\s]*/i, "");
}

function serviceTierLabel(tier) {
  const name = String(tier?.name || "");
  if (name && /^[\x20-\x7e]+$/.test(name)) return name;
  const id = String(tier?.id || "");
  if (id) return id.slice(0, 1).toUpperCase() + id.slice(1);
  return "Service";
}

function renderCurrentThread() {
  const thread = state.currentThread;
  if (!thread) return clearThread();
  ui.threadName.textContent = thread.name || "未命名聊天";
  ui.openRecentThreads.disabled = false;
  renderRecentThreads();
  ui.openThreadMenu.disabled = false;
  ui.renameThread.disabled = false;
  ui.deleteThread.disabled = runtimeIsActive(currentRuntime());
  ui.stop.disabled = !currentRuntime().activeTurnId;
  renderConversation(thread.turns || []);
  renderQueue();
  updateComposer();
  renderSettings();
  renderContextUsage();
  syncElapsedTimer();
}

function renderConversation(turns) {
  const shouldFollow = state.followLatest;
  const previousScrollTop = ui.conversation.scrollTop;
  const liveMetricsByTurn = captureRenderedExecutionItems();
  state.renderingConversation = true;
  ui.conversation.replaceChildren();
  state.messageElements.clear();
  if (state.currentThread) state.pendingUserMessages = state.pendingUserMessages.filter((entry) => entry.threadId !== state.currentThread.id);
  state.executionGroups.clear();
  if (state.currentThread?.history?.hasMore) {
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
    const items = turn.items || [];
    for (const item of items) {
      if (isExecutionItem(item)) {
        upsertExecutionItem(turn.id, item, { turnStatus: turn.status, timing: turn });
      } else {
        renderHistoryItem(item, { turnId: turn.id });
      }
    }
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
  const thread = state.currentThread;
  const before = thread?.history?.before;
  if (!project || !thread || !before || state.loadingHistory) return;
  state.loadingHistory = true;
  renderConversation(thread.turns || []);
  const previousHeight = ui.conversation.scrollHeight;
  const previousTop = ui.conversation.scrollTop;
  try {
    const result = await api(`/api/threads/${encodeURIComponent(thread.id)}?projectId=${encodeURIComponent(project.id)}&before=${encodeURIComponent(before)}`);
    if (state.currentThread?.id !== thread.id) return;
    ingestTurnMetrics(result.metrics);
    const turns = [...(result.thread.turns || []), ...(state.currentThread.turns || [])];
    state.currentThread = {
      ...state.currentThread,
      turns,
      history: result.history,
      runtime: result.runtime || state.currentThread.runtime,
    };
    updateThreadInState(project.id, state.currentThread);
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
      if (state.currentThread?.id === thread.id) renderConversation(state.currentThread.turns || []);
    }
  }
}

function renderHistoryItem(item, { turnId = null } = {}) {
  if (item.type === "userMessage") {
    const message = addMessage(item.id, "你", userMessageText(item), "user");
    placeTurnContent(turnId, message, { beforeExecution: true });
    return message;
  } else if (item.type === "agentMessage") {
    const message = item.phase === "commentary"
      ? addProgressMessage(item.id, item.text || "")
      : addMessage(item.id, "Codex", item.text || "", "assistant");
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
  if (beforeExecution) {
    const entries = [...group.items.values()];
    const firstExecution = entries.map((entry) => entry.root).find((root) => root.parentNode === group.list);
    const hasSubstantiveExecution = entries.length > 0;
    if (firstExecution && !hasSubstantiveExecution) firstExecution.before(message.root);
    else group.list.append(message.root);
    return;
  }
  group.list.append(message.root);
}

function userMessageText(item) {
  return (item.content || []).filter((part) => part.type === "text").map((part) => part.text).join("\n");
}

function isExecutionItem(item) {
  if (!item || item.type === "userMessage") return false;
  if (item.type === "agentMessage") return false;
  return true;
}

function upsertExecutionItem(turnId, item, { turnStatus = "inProgress", timing } = {}) {
  if (!turnId || !item?.id) return;
  const group = ensureExecutionGroup(turnId, turnStatus, timing);
  let entry = group.items.get(item.id);
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
    group.list.append(root);
    entry = { root, kind, title, status, body, item: {}, autoOpened: false };
    summary.addEventListener("click", (event) => {
      if (entry.item.type !== "fileChange") return;
      event.preventDefault();
      openFileChangePreview(entry.item);
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
  let presentation = executionPresentation(entry.item);
  if (presentation.tone === "running" && !timestampMilliseconds(entry.item.startedAt)) {
    entry.item.startedAt = Date.now();
  } else if (presentation.tone !== "running" && timestampMilliseconds(entry.item.startedAt) && !timestampMilliseconds(entry.item.completedAt) && entry.item.durationMs == null) {
    entry.item.completedAt = Date.now();
  }
  presentation = executionPresentation(entry.item);
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
  renderAnsiOutput(entry.body, presentation.body || "");
  const isFileChange = entry.item.type === "fileChange";
  entry.body.hidden = isFileChange || !presentation.body;
  entry.root.classList.toggle("empty", !isFileChange && !presentation.body);
  entry.root.classList.toggle("diff-preview-entry", isFileChange);
  entry.root.classList.toggle("failed", presentation.tone === "failed");
  entry.root.classList.toggle("running", presentation.tone === "running");
  entry.root.classList.toggle("stopped", presentation.tone === "stopped");
  entry.root.classList.toggle("complete", presentation.tone === "complete");
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
  caret.textContent = "⌄";
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
    ["local", "本地", "本地命令与文件处理耗时"],
    ["model", "模型 ≈", "总耗时扣除可识别本地与外部调用后的估算值"],
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
    timingFields[key] = { name, value, detail };
  }
  timingSummary.prepend(total);
  root.append(summary, list, timingSummary);
  ui.conversation.append(root);
  group = { turnId, root, count, status, list, items: new Map(), turnStatus, timingSummary, totalValue, timingFields };
  mergeExecutionTiming(group, timing);
  state.executionGroups.set(turnId, group);
  updateExecutionGroup(group, turnStatus);
  return group;
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
  const runtimeMatchesTurn = runtimeIsActive(runtime) && runtime.activeTurnId === group.turnId;
  const running = runtimeMatchesTurn || ["active", "running", "inProgress"].includes(group.turnStatus);
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
    group.timingSummary.hidden = true;
    return;
  }
  group.totalValue.textContent = formatDuration(summary.totalMs);
  group.timingFields.local.value.textContent = summary.localUnknownCount
    ? summary.localMs > 0 ? `≥ ${formatDuration(summary.localMs)}` : "未记录"
    : formatDuration(summary.localMs);
  group.timingFields.local.detail.textContent = `${summary.localCount} 项`;
  group.timingFields.model.value.textContent = summary.modelMs === null ? "未记录" : formatDuration(summary.modelMs);
  group.timingFields.model.detail.textContent = summary.modelMs === null ? "数据不全" : "推算";
  group.timingFields.model.name.textContent = summary.modelMs === null ? "模型" : "模型 ≈";
  group.timingSummary.hidden = false;
}

function completeExecutionGroup(turnId, turnStatus, timing) {
  const group = state.executionGroups.get(turnId);
  if (!group) return;
  mergeExecutionTiming(group, timing);
  if (!group.durationMs && group.startedAt && !group.completedAt) group.completedAt = Date.now();
  mergeTurnMetric(turnId, {
    startedAt: group.startedAt,
    completedAt: group.completedAt,
    durationMs: group.durationMs,
  });
  const itemStatus = turnStatus === "failed" ? "failed" : ["interrupted", "cancelled"].includes(turnStatus) ? "interrupted" : "completed";
  for (const entry of group.items.values()) {
    entry.item = {
      ...entry.item,
      status: itemStatus,
      ...(entry.item.durationMs == null && !entry.item.completedAt ? { completedAt: Date.now() } : {}),
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
  const message = addProgressMessage(turnActivityId(turnId), "处理中，等待状态更新");
  message.root.classList.add("running");
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

function executionPresentation(item) {
  const status = executionStatus(item);
  const body = item.type === "fileChange" ? "" : limitExecutionDetail(executionBody(item));
  if (item.type === "agentMessage") return { kind: "进度", title: compactText(item.text || "Codex 正在处理"), status: status.label, tone: status.tone, body };
  if (item.type === "plan") return { kind: "计划", title: compactText(item.text || "更新执行计划"), status: status.label, tone: status.tone, body };
  if (item.type === "reasoning") {
    const summary = uniqueTextParts(item.summary || []);
    return { kind: "思考", title: compactText(plainInlineMarkdown(summary[summary.length - 1]) || "整理思路"), status: status.label, tone: status.tone, body };
  }
  if (item.type === "commandExecution") return { kind: "命令", title: compactText(item.command || "执行终端命令"), status: status.label, tone: status.tone, body };
  if (item.type === "fileChange") return { kind: "文件", title: fileChangeTitle(item, status.tone), status: status.label, tone: status.tone, body };
  if (item.type === "mcpToolCall") return { kind: "工具", title: compactText([item.server, item.tool].filter(Boolean).join(" / ") || "调用工具"), status: status.label, tone: status.tone, body };
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
  if (["inprogress", "running", "started", "pending"].includes(value)) return { label: "进行中", tone: "running" };
  if (["interrupted", "cancelled"].includes(value)) return { label: "已停止", tone: "stopped" };
  if (["failed", "error", "declined"].includes(value) || item.error || Number(item.exitCode) > 0) return { label: "失败", tone: "failed" };
  if (item.exitCode === 0) return { label: "结束", tone: "complete" };
  return { label: "结束", tone: "complete" };
}

function executionBody(item) {
  if (item.type === "agentMessage" || item.type === "plan") return item.text || "";
  if (item.type === "reasoning") return uniqueTextParts([...(item.summary || []), ...(item.content || [])]).join("\n\n");
  if (item.type === "commandExecution") return [item.cwd && `目录：${item.cwd}`, item.command, item.aggregatedOutput, item.exitCode !== null && item.exitCode !== undefined && `退出码：${item.exitCode}`].filter(Boolean).join("\n\n");
  if (item.type === "fileChange") return (item.changes || []).map((change) => [change.path, change.diff].filter(Boolean).join("\n")).join("\n\n");
  if (item.type === "mcpToolCall") return [item.arguments && `参数\n${safeStringify(item.arguments)}`, item.result && `结果\n${safeStringify(item.result)}`, item.error && `错误\n${safeStringify(item.error)}`].filter(Boolean).join("\n\n");
  if (item.type === "dynamicToolCall") return [item.arguments && `参数\n${safeStringify(item.arguments)}`, item.contentItems && `结果\n${safeStringify(item.contentItems)}`].filter(Boolean).join("\n\n");
  if (item.type === "collabAgentToolCall") return [item.prompt, item.receiverThreadIds?.length && `目标：${item.receiverThreadIds.join(", ")}`, item.agentsStates && safeStringify(item.agentsStates)].filter(Boolean).join("\n\n");
  if (item.type === "subAgentActivity") return [item.kind, item.agentPath, item.agentThreadId].filter(Boolean).join("\n");
  if (item.type === "webSearch") return [item.query, item.action && safeStringify(item.action)].filter(Boolean).join("\n\n");
  if (item.type === "imageView") return item.path || "";
  if (item.type === "sleep") return `等待时长：${item.durationMs || 0} ms`;
  return "";
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

function limitExecutionDetail(value, limit = 16000) {
  const text = String(value || "").trim();
  return text.length > limit ? `${text.slice(0, limit)}\n\n…内容过长，已截断显示` : text;
}

function safeStringify(value) {
  try {
    return typeof value === "string" ? value : JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
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

function addMessage(id, label, text, kind) {
  if (state.messageElements.has(id)) {
    const entry = state.messageElements.get(id);
    if (text !== undefined) renderMessageContent(entry, text);
    return entry;
  }
  ui.conversation.querySelector(".empty-state")?.remove();
  const root = ui.messageTemplate.content.firstElementChild.cloneNode(true);
  root.classList.add(kind);
  const meta = root.querySelector(".message-meta");
  const body = root.querySelector(".message-body");
  meta.textContent = label;
  ui.conversation.append(root);
  const entry = { root, body, kind, files: null };
  renderMessageContent(entry, text);
  state.messageElements.set(id, entry);
  return entry;
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

function addPendingUserMessage(threadId, text) {
  const pending = { id: `pending-user-${Date.now()}-${Math.random().toString(16).slice(2)}`, threadId, text };
  state.pendingUserMessages.push(pending);
  addMessage(pending.id, "你 · 引导", text, "user");
  if (state.followLatest) scrollToLatest();
  return pending;
}

function removePendingUserMessage(pending) {
  state.pendingUserMessages = state.pendingUserMessages.filter((entry) => entry !== pending);
  const message = state.messageElements.get(pending.id);
  message?.root.remove();
  state.messageElements.delete(pending.id);
}

function renderLiveUserMessage(threadId, item, turnId = null) {
  const text = userMessageText(item);
  const pending = state.pendingUserMessages.find((entry) => entry.threadId === threadId && entry.text === text);
  if (!pending) {
    renderHistoryItem(item, { turnId });
    return;
  }
  const message = state.messageElements.get(pending.id);
  state.pendingUserMessages = state.pendingUserMessages.filter((entry) => entry !== pending);
  state.messageElements.delete(pending.id);
  if (!message) {
    renderHistoryItem(item, { turnId });
    return;
  }
  message.root.querySelector(".message-meta").textContent = "你 · 引导";
  renderMessageContent(message, text);
  state.messageElements.set(item.id, message);
  placeTurnContent(turnId, message, { beforeExecution: true });
}

function renderMessageContent(entry, value) {
  const text = String(value || "");
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
    followNewContent();
    return;
  }
  const list = document.createElement("div");
  list.className = "message-files";
  list.setAttribute("aria-label", "可下载文件");
  for (const file of presentation.files) list.append(downloadCard(file));
  entry.root.append(list);
  entry.files = list;
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
  if (!state.currentThread || !state.currentQueue.length) {
    ui.queuePanel.hidden = true;
    return;
  }
  ui.queuePanel.hidden = false;
  const heading = document.createElement("header");
  heading.textContent = `等待队列 · ${state.currentQueue.length}`;
  const list = document.createElement("ol");
  list.className = "queue-list";
  for (const [index, item] of state.currentQueue.entries()) {
    const row = ui.queueItemTemplate.content.firstElementChild.cloneNode(true);
    row.querySelector(".queue-index").textContent = String(index + 1);
    row.querySelector(".queue-text").textContent = item.text;
    const guideButton = row.querySelector('[data-action="guide"]');
    const guiding = state.queueGuiding.has(item.id);
    row.classList.toggle("guiding", guiding);
    if (guiding) row.setAttribute("aria-busy", "true");
    row.querySelector(".queue-index").textContent = guiding ? "↗" : String(index + 1);
    if (guiding) row.querySelector(".queue-text").dataset.status = "正在转入信息流";
    guideButton.disabled = !currentRuntime().activeTurnId || guiding;
    guideButton.textContent = guiding ? "…" : "↗";
    row.querySelector('[data-action="edit"]').disabled = guiding;
    row.querySelector('[data-action="up"]').disabled = guiding || index === 0;
    row.querySelector('[data-action="down"]').disabled = guiding || index === state.currentQueue.length - 1;
    row.querySelector('[data-action="remove"]').disabled = guiding;
    row.querySelector('[data-action="guide"]').addEventListener("click", () => guideQueueItem(item.id));
    row.querySelector('[data-action="edit"]').addEventListener("click", () => openQueueEdit(item));
    row.querySelector('[data-action="up"]').addEventListener("click", () => changeQueue(item.id, "up"));
    row.querySelector('[data-action="down"]').addEventListener("click", () => changeQueue(item.id, "down"));
    row.querySelector('[data-action="remove"]').addEventListener("click", () => removeQueue(item.id));
    list.append(row);
  }
  ui.queuePanel.append(heading, list);
}

function updateComposer() {
  const hasThread = Boolean(state.currentThread);
  const active = Boolean(currentRuntime().activeTurnId);
  const hasInput = Boolean(ui.prompt.value.trim() || state.composerAttachments.length);
  const showStop = active && !hasInput && !state.materializingThread;
  const guideAvailable = hasThread && active;
  if (state.mode === "guide" && !guideAvailable) state.mode = "queue";
  ui.guide.classList.toggle("active", state.mode === "guide");
  ui.guide.classList.toggle("guide-active", state.mode === "guide");
  ui.queue.classList.toggle("active", state.mode === "queue");
  ui.guide.disabled = !guideAvailable;
  ui.prompt.disabled = !currentProject();
  ui.uploadFiles.disabled = !currentProject() || state.uploadingFiles || !state.projectAttachmentStorage;
  ui.uploadFiles.title = state.projectAttachmentStorage
    ? "添加文件或图片；也可直接粘贴剪贴板图片"
    : "当前服务版本暂不支持附件";
  ui.stop.hidden = !showStop;
  ui.stop.disabled = !showStop || state.stoppingTurn;
  ui.stop.querySelector("span").textContent = state.stoppingTurn ? "…" : "■";
  ui.send.hidden = showStop;
  ui.send.disabled = !currentProject() || state.materializingThread || state.uploadingFiles || !hasInput;
  if (state.materializingThread) {
    ui.send.querySelector("span").textContent = "↑";
    ui.send.setAttribute("aria-label", "正在创建聊天");
    ui.send.title = "正在创建聊天";
    ui.send.classList.remove("guide");
  } else if (state.mode === "guide") {
    ui.prompt.placeholder = "补充目标、限制或修正方向…";
    ui.send.querySelector("span").textContent = "↗";
    ui.send.setAttribute("aria-label", "发送引导");
    ui.send.title = "发送引导";
    ui.send.classList.add("guide");
  } else {
    ui.prompt.placeholder = "输入要交给 Codex 的任务…";
    ui.send.querySelector("span").textContent = "↑";
    const sendLabel = active ? "加入队列" : "发送";
    ui.send.setAttribute("aria-label", sendLabel);
    ui.send.title = sendLabel;
    ui.send.classList.remove("guide");
  }
}

function chooseUploadFiles() {
  if (!currentProject() || state.uploadingFiles) return;
  ui.uploadFileInput.click();
}

async function uploadSelectedFiles() {
  const files = [...(ui.uploadFileInput.files || [])];
  addComposerFiles(files);
  ui.uploadFileInput.value = "";
}

function addComposerFiles(files) {
  const project = currentProject();
  if (!state.projectAttachmentStorage) {
    showActivity("当前服务版本暂不支持附件；文字仍可正常发送。", true);
    return;
  }
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
  if (!state.projectAttachmentStorage) return;
  event.preventDefault();
  const timestamp = Date.now();
  const files = images.map((image, index) => new File([image], clipboardImageName(image.type, timestamp, index), {
    type: image.type,
    lastModified: timestamp,
  }));
  addComposerFiles(files);
}

async function uploadComposerAttachments(project, thread) {
  const pending = state.composerAttachments.filter((attachment) => !attachment.uploaded);
  if (!pending.length) return;
  if (!state.projectAttachmentStorage) throw new Error("当前服务版本暂不支持附件；请移除附件后发送文字。");
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
  if (!project) return null;
  if (state.currentThread?.runtime?.projectId === project.id && currentThreadIsEmpty()) {
    closeSidebar();
    if (focusPrompt) ui.prompt.focus();
    return state.currentThread;
  }
  const existingDraft = (state.threads.get(project.id) || []).find((thread) => isLocalThreadId(thread.id));
  const thread = existingDraft || {
    id: nextLocalThreadId(),
    name: null,
    preview: "",
    turns: [],
    settings: newThreadSettings({
      projectSettings: project.settings,
      currentThread: state.currentThread,
      projectId: project.id,
      models: state.models,
    }),
    runtime: { projectId: project.id, activeTurnId: null, status: "idle" },
    history: { hasMore: false, before: null, totalTurns: 0 },
    queueCount: 0,
    queueRevision: 0,
    createdAt: Math.floor(Date.now() / 1000),
    updatedAt: Math.floor(Date.now() / 1000),
  };
  updateThreadInState(project.id, thread);
  state.currentThread = thread;
  state.currentQueue = [];
  state.followLatest = true;
  state.selectedThreads[project.id] = thread.id;
  saveSelection();
  closeSidebar();
  renderThreads();
  renderCurrentThread();
  if (!state.models.length) {
    const draftId = thread.id;
    void loadModels().then(() => {
      if (state.currentThread?.id === draftId) renderSettings();
    });
  }
  if (focusPrompt) ui.prompt.focus();
  return thread;
}

function currentThreadIsEmpty() {
  const thread = state.currentThread;
  if (!thread) return false;
  return (thread.turns || []).length === 0
    && !runtimeIsActive(thread.runtime)
    && state.currentQueue.length === 0
    && !thread.queueCount;
}

function isLocalThreadId(threadId) {
  return typeof threadId === "string" && threadId.startsWith("local-");
}

function nextLocalThreadId() {
  state.localThreadSequence += 1;
  return `local-${Date.now().toString(36)}-${state.localThreadSequence.toString(36)}`;
}

async function materializeCurrentThread() {
  const project = currentProject();
  const draft = state.currentThread;
  if (!project || !draft || !isLocalThreadId(draft.id)) return draft;
  state.materializingThread = true;
  updateComposer();
  try {
    const result = await api("/api/threads", {
      method: "POST",
      body: { projectId: project.id, settings: draft.settings || {}, ...(draft.name ? { name: draft.name } : {}) },
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
    state.currentThread = thread;
    state.selectedThreads[project.id] = thread.id;
    saveSelection();
    applyQueueSnapshot(thread.id, result.queue || [], result.queueRevision ?? 0);
    openEventStream(thread.id);
    syncEventStreams();
    renderThreads();
    renderCurrentThread();
    return thread;
  } finally {
    state.materializingThread = false;
    updateComposer();
  }
}

async function submitPrompt(event) {
  event.preventDefault();
  const hasContent = Boolean(ui.prompt.value.trim() || state.composerAttachments.length);
  if (!hasContent || !currentProject() || state.materializingThread || state.uploadingFiles) return;
  scrollToLatest(false);
  try {
    if (!state.currentThread) await createThread();
    if (isLocalThreadId(state.currentThread?.id)) await materializeCurrentThread();
    const project = currentProject();
    const thread = state.currentThread;
    await uploadComposerAttachments(project, thread);
    const text = messageWithAttachments(ui.prompt.value, state.composerAttachments.map((attachment) => attachment.uploaded).filter(Boolean));
    if (state.mode === "guide") {
      const latest = await refreshThreadSnapshot(thread, project);
      const activeTurnId = latest?.runtime.activeTurnId;
      if (!activeTurnId) throw new Error("当前没有可引导的执行任务。");
      const pending = addPendingUserMessage(thread.id, text);
      try {
        await api(`/api/threads/${encodeURIComponent(thread.id)}/steer`, { method: "POST", body: { projectId: project.id, expectedTurnId: activeTurnId, text } });
        showActivity("引导已插入当前任务。", false);
      } catch (error) {
        removePendingUserMessage(pending);
        throw error;
      }
    } else {
      const result = await api(`/api/threads/${encodeURIComponent(thread.id)}/queue`, { method: "POST", body: { projectId: project.id, text } });
      applyQueueSnapshot(thread.id, result.queue, result.queueRevision);
      renderQueue();
      renderThreads();
      renderRunStrip();
      showActivity("任务已进入队列。", false);
    }
    ui.prompt.value = "";
    clearComposerAttachments({ deleteUploaded: false });
    resizePrompt();
    updateComposer();
  } catch (error) {
    showError(error);
  }
}

async function stopCurrentTurn() {
  const project = currentProject();
  const thread = state.currentThread;
  if (!project || !thread || state.stoppingTurn) return;
  state.stoppingTurn = true;
  updateComposer();
  try {
    const latest = await refreshThreadSnapshot(thread, project);
    if (!latest) return;
    const activeTurnId = latest.runtime.activeTurnId;
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
    if (state.currentThread?.id === thread.id) updateComposer();
  }
}

async function refreshThreadSnapshot(thread, project) {
  const latest = await api(`/api/threads/${encodeURIComponent(thread.id)}?projectId=${encodeURIComponent(project.id)}`, { timeoutMs: 8000 });
  if (state.currentThread?.id !== thread.id) return null;
  const runtime = ensureRuntimeStartedAt(latest.runtime || { activeTurnId: null, status: "idle" }, state.currentThread.runtime, thread.id);
  state.currentThread = { ...state.currentThread, runtime };
  updateThreadInState(project.id, state.currentThread);
  applyQueueSnapshot(thread.id, latest.queue, latest.queueRevision);
  return { ...latest, runtime };
}

function openThreadDialog() {
  if (!state.currentThread || !currentProject()) return;
  ui.threadNameInput.value = state.currentThread.name || "";
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
  if (!state.currentThread || !currentProject()) return;
  const name = ui.threadNameInput.value.trim();
  if (!name) {
    ui.threadFormError.textContent = "聊天名称不能为空。";
    return;
  }
  if (name === state.currentThread.name) {
    ui.threadFormError.textContent = "名称没有变化，请输入新的聊天名称。";
    return;
  }
  if (isLocalThreadId(state.currentThread.id)) {
    const updated = { ...state.currentThread, name };
    state.currentThread = updated;
    updateThreadInState(currentProject().id, updated);
    ui.threadDialog.close();
    renderCurrentThread();
    renderThreads();
    return;
  }
  try {
    await api(`/api/threads/${encodeURIComponent(state.currentThread.id)}`, { method: "PATCH", body: { name } });
    const updated = { ...state.currentThread, name };
    state.currentThread = updated;
    updateThreadInState(currentProject().id, updated);
    ui.threadDialog.close();
    renderCurrentThread();
    renderThreads();
    renderRunStrip();
  } catch (error) {
    ui.threadFormError.textContent = error.message;
  }
}

async function deleteCurrentThread() {
  const project = currentProject();
  const thread = state.currentThread;
  if (!project || !thread) return;
  if (currentRuntime().activeTurnId) {
    showActivity("聊天仍在执行中，请先停止任务再删除。", true);
    return;
  }
  const confirmed = await confirmAction({
    kicker: "删除聊天记录",
    title: thread.name || "未命名聊天",
    message: "这会永久删除该聊天及其 Codex 历史记录，项目目录和项目文件不会被删除。",
    confirmLabel: "永久删除",
  });
  if (!confirmed) return;
  if (isLocalThreadId(thread.id)) {
    const threads = (state.threads.get(project.id) || []).filter((entry) => entry.id !== thread.id);
    state.threads.set(project.id, threads);
    state.queueSnapshots.delete(thread.id);
    delete state.selectedThreads[project.id];
    saveSelection();
    clearThread();
    renderThreads();
    if (threads[0]) await selectThread(threads[0].id);
    else await createThread({ focusPrompt: false });
    showActivity("空聊天已移除。", false);
    return;
  }
  try {
    await api(`/api/threads/${encodeURIComponent(thread.id)}?projectId=${encodeURIComponent(project.id)}`, { method: "DELETE" });
    state.streams.get(thread.id)?.close();
    state.streams.delete(thread.id);
    state.queueSnapshots.delete(thread.id);
    delete state.selectedThreads[project.id];
    saveSelection();
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
  if (!state.currentThread) return;
  try {
    const result = await api(`/api/threads/${encodeURIComponent(state.currentThread.id)}/queue/${encodeURIComponent(itemId)}`, { method: "PATCH", body: { direction } });
    applyQueueSnapshot(state.currentThread.id, result.queue, result.queueRevision);
    renderQueue();
  } catch (error) {
    showError(error);
  }
}

async function guideQueueItem(itemId) {
  const project = currentProject();
  const thread = state.currentThread;
  if (!project || !thread || state.queueGuiding.has(itemId)) return;
  const item = state.currentQueue.find((entry) => entry.id === itemId);
  const activeTurnId = currentRuntime().activeTurnId;
  if (!item || !activeTurnId) {
    showActivity(item ? "当前任务已经结束，排队任务将按顺序执行。" : "该任务已经离开等待队列。", false);
    return;
  }
  state.queueGuiding.add(itemId);
  const pending = addPendingUserMessage(thread.id, item.text);
  renderQueue();
  showActivity("正在把排队任务转入当前信息流…", false);
  try {
    await api(`/api/threads/${encodeURIComponent(thread.id)}/steer`, {
      method: "POST",
      body: { projectId: project.id, expectedTurnId: activeTurnId, text: item.text },
      timeoutMs: 8000,
    });
    const result = await api(`/api/threads/${encodeURIComponent(thread.id)}/queue/${encodeURIComponent(itemId)}`, { method: "DELETE", timeoutMs: 8000 });
    applyQueueSnapshot(thread.id, result.queue, result.queueRevision);
    renderThreads();
    renderRunStrip();
    showActivity("排队任务已转入当前信息流。", false);
  } catch (error) {
    removePendingUserMessage(pending);
    showError(error);
  } finally {
    state.queueGuiding.delete(itemId);
    if (state.currentThread?.id === thread.id) renderQueue();
  }
}

function openQueueEdit(item) {
  if (!state.currentThread || !item) return;
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
  const thread = state.currentThread;
  const itemId = state.editingQueueItemId;
  const text = ui.queueEditInput.value.trim();
  if (!thread || !itemId) return;
  if (!text) {
    ui.queueEditError.textContent = "任务内容不能为空。";
    return;
  }
  const existing = state.currentQueue.find((item) => item.id === itemId);
  if (existing?.text === text) {
    ui.queueEditError.textContent = "内容没有变化。";
    return;
  }
  try {
    const result = await api(`/api/threads/${encodeURIComponent(thread.id)}/queue/${encodeURIComponent(itemId)}`, { method: "PATCH", body: { text } });
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
  if (!state.currentThread) return;
  try {
    const result = await api(`/api/threads/${encodeURIComponent(state.currentThread.id)}/queue/${encodeURIComponent(itemId)}`, { method: "DELETE" });
    applyQueueSnapshot(state.currentThread.id, result.queue, result.queueRevision);
    renderQueue();
    renderThreads();
    renderRunStrip();
  } catch (error) {
    showError(error);
  }
}

function openEventStream(threadId) {
  if (isLocalThreadId(threadId) || state.streams.has(threadId)) return;
  const stream = new EventSource(`/api/events?thread=${encodeURIComponent(threadId)}`);
  let interrupted = false;
  stream.addEventListener("open", () => {
    setServerStatus(true, "本机 Codex 已连接");
    if (interrupted) scheduleResume();
    interrupted = false;
  });
  stream.addEventListener("error", () => {
    interrupted = true;
    setServerStatus(false, "连接正在重试");
  });
  stream.addEventListener("server", (event) => {
    const data = safeJson(event.data);
    setServerStatus(data?.status === "ready", data?.status === "ready" ? "本机 Codex 已连接" : "本机 Codex 未连接");
  });
  stream.addEventListener("codex", (event) => handleCodexEvent(threadId, safeJson(event.data)));
  state.streams.set(threadId, stream);
}

function syncEventStreams() {
  const desired = new Set();
  if (state.currentThread?.id && !isLocalThreadId(state.currentThread.id)) desired.add(state.currentThread.id);
  for (const threads of state.threads.values()) {
    for (const thread of threads) {
      if (runtimeIsActive(thread.runtime) || thread.queueCount > 0) desired.add(thread.id);
    }
  }
  for (const threadId of desired) openEventStream(threadId);
  for (const [threadId, stream] of state.streams) {
    if (desired.has(threadId)) continue;
    stream.close();
    state.streams.delete(threadId);
  }
}

function handleCodexEvent(threadId, event) {
  if (!event) return;
  const params = event.params || {};
  const projectId = findProjectForThread(threadId);
  if (!projectId) return;
  const thread = findThread(projectId, threadId);
  if (!thread) return;
  if (event.method === "thread/tokenUsage/updated") {
    rememberThreadTokenUsage(threadId, params.tokenUsage);
    scheduleAccountRateLimitsRefresh();
    return;
  }
  if (event.method === "workspace/state") {
    const runtime = ensureRuntimeStartedAt(params.runtime || thread.runtime, thread.runtime, threadId);
    updateThreadInState(projectId, { ...thread, runtime });
    const changed = applyQueueSnapshot(threadId, params.queue, params.queueRevision);
    if (state.currentThread?.id === threadId) {
      state.currentThread = findThread(projectId, threadId);
      if (changed) renderQueue();
      for (const item of params.activeItems || []) {
        const turnId = item.turnId || runtime.activeTurnId;
        if (!turnId || !item.id) continue;
        mergeItemMetric(turnId, item.id, item);
        upsertExecutionItem(turnId, { ...item, status: item.status || "inProgress" });
      }
      updateComposer();
      ui.deleteThread.disabled = runtimeIsActive(runtime);
    }
    renderThreads();
    renderRunStrip();
    return;
  }
  if (event.method === "turn/started") {
    const startedAt = timestampMilliseconds(params.turn?.startedAt) || Date.now();
    mergeTurnMetric(params.turn?.id, { startedAt });
    rememberActiveTurnStart(threadId, params.turn?.id, startedAt);
    const runtime = { ...thread.runtime, activeTurnId: params.turn?.id, status: "running", startedAt };
    updateThreadInState(projectId, { ...thread, runtime });
    if (state.currentThread?.id === threadId) {
      state.currentThread = findThread(projectId, threadId);
      consumeQueueHead(threadId);
      updateComposer();
      renderQueue();
    }
    renderThreads();
    renderRunStrip();
    if (state.currentThread?.id === threadId) scheduleTurnActivity(params.turn?.id, 0);
    return;
  }
  if (event.method === "thread/name/updated") {
    const name = typeof params.name === "string" ? params.name.trim() : "";
    if (!name) return;
    updateThreadInState(projectId, { ...thread, name });
    if (state.currentThread?.id === threadId) {
      state.currentThread = findThread(projectId, threadId);
      ui.threadName.textContent = name;
      ui.configThreadName.textContent = `当前聊天：${name}`;
    }
    renderThreads();
    renderRunStrip();
    return;
  }
  if (event.method === "thread/status/changed") {
    const active = runtimeIsActive({ status: params.status });
    const activeTurnId = thread.runtime?.activeTurnId;
    const runtime = ensureRuntimeStartedAt(
      { ...thread.runtime, status: params.status, ...(active ? {} : { activeTurnId: null, startedAt: null }) },
      thread.runtime,
      threadId,
    );
    updateThreadInState(projectId, {
      ...thread,
      runtime,
    });
    if (state.currentThread?.id === threadId) {
      state.currentThread = findThread(projectId, threadId);
      if (!active && activeTurnId) completeExecutionGroup(activeTurnId, "interrupted", { completedAt: Date.now() });
      updateComposer();
      ui.deleteThread.disabled = active;
    }
    renderThreads();
    renderRunStrip();
    return;
  }
  if (event.method === "turn/completed") {
    const completedAt = timestampMilliseconds(params.turn?.completedAt) || Date.now();
    mergeTurnMetric(params.turn?.id, {
      startedAt: params.turn?.startedAt,
      completedAt,
      durationMs: params.turn?.durationMs,
    });
    forgetActiveTurnStart(threadId, params.turn?.id);
    updateThreadInState(projectId, { ...thread, runtime: { ...thread.runtime, activeTurnId: null, status: "idle", startedAt: null } });
    if (state.currentThread?.id === threadId) {
      state.currentThread = findThread(projectId, threadId);
      clearTurnActivity(params.turn?.id, { removeEmpty: true });
      completeExecutionGroup(params.turn?.id, params.turn?.status || "completed", params.turn);
      updateComposer();
      ui.deleteThread.disabled = false;
    }
    reconcileCompletedThread(projectId, threadId).catch(showError);
    renderRunStrip();
    return;
  }
  if (event.method === "queue/updated") {
    const changed = applyQueueSnapshot(threadId, params.queue, params.queueRevision);
    if (changed && state.currentThread?.id === threadId) renderQueue();
    if (changed) {
      renderThreads();
      renderRunStrip();
    }
    return;
  }
  if (event.method === "queue/error") {
    if (state.currentThread?.id === threadId) showActivity(params.message || "队列任务启动失败。", true);
    return;
  }
  if (event.method.startsWith("item/") && params.turnId) clearTurnActivity(params.turnId);
  if (event.method === "item/started") {
    const item = params.item || {};
    const previousMetric = state.turnMetrics.get(params.turnId)?.items?.[item.id] || {};
    mergeItemMetric(params.turnId, item.id, {
      type: item.type,
      status: item.status || "inProgress",
      startedAt: timestampMilliseconds(params.startedAtMs) || timestampMilliseconds(item.startedAt) || timestampMilliseconds(previousMetric.startedAt) || Date.now(),
    });
  } else if (event.method === "item/completed") {
    const item = params.item || {};
    const previousMetric = state.turnMetrics.get(params.turnId)?.items?.[item.id] || {};
    mergeItemMetric(params.turnId, item.id, {
      type: item.type,
      status: terminalExecutionStatus(item.status),
      startedAt: timestampMilliseconds(item.startedAt) || timestampMilliseconds(previousMetric.startedAt),
      completedAt: timestampMilliseconds(params.completedAtMs) || timestampMilliseconds(item.completedAt) || Date.now(),
      durationMs: item.durationMs,
    });
  } else if (event.method === "item/fileChange/patchUpdated") {
    const previousMetric = state.turnMetrics.get(params.turnId)?.items?.[params.itemId] || {};
    mergeItemMetric(params.turnId, params.itemId, {
      type: "fileChange",
      status: "inProgress",
      startedAt: timestampMilliseconds(previousMetric.startedAt) || Date.now(),
    });
  } else if (event.method === "item/commandExecution/outputDelta") {
    const previousMetric = state.turnMetrics.get(params.turnId)?.items?.[params.itemId] || {};
    mergeItemMetric(params.turnId, params.itemId, {
      type: "commandExecution",
      status: "inProgress",
      startedAt: timestampMilliseconds(previousMetric.startedAt) || Date.now(),
    });
  }
  if (state.currentThread?.id !== threadId) return;
  if (event.method === "item/agentMessage/delta") {
    const current = state.messageElements.get(params.itemId);
    const message = addProgressMessage(params.itemId, `${current?.text || ""}${params.delta || ""}`);
    placeTurnContent(params.turnId, message);
  } else if (event.method === "item/commandExecution/outputDelta") {
    const current = currentExecutionItem(params.turnId, params.itemId) || { id: params.itemId, type: "commandExecution", aggregatedOutput: "", status: "inProgress" };
    upsertExecutionItem(params.turnId, { ...current, aggregatedOutput: `${current.aggregatedOutput || ""}${params.delta || ""}`, status: "inProgress" });
  } else if (event.method === "item/reasoning/summaryTextDelta") {
    const current = currentExecutionItem(params.turnId, params.itemId) || { id: params.itemId, type: "reasoning", summary: [], content: [], status: "inProgress" };
    const summary = [...(current.summary || [])];
    summary[params.summaryIndex || 0] = `${summary[params.summaryIndex || 0] || ""}${params.delta || ""}`;
    upsertExecutionItem(params.turnId, { ...current, summary, status: "inProgress" });
  } else if (event.method === "item/reasoning/summaryPartAdded") {
    const current = currentExecutionItem(params.turnId, params.itemId) || { id: params.itemId, type: "reasoning", summary: [], content: [], status: "inProgress" };
    const summary = [...(current.summary || [])];
    if (summary[params.summaryIndex] === undefined) summary[params.summaryIndex] = "";
    upsertExecutionItem(params.turnId, { ...current, summary, status: "inProgress" });
  } else if (event.method === "item/reasoning/textDelta") {
    const current = currentExecutionItem(params.turnId, params.itemId) || { id: params.itemId, type: "reasoning", summary: [], content: [], status: "inProgress" };
    const content = [...(current.content || [])];
    content[params.contentIndex || 0] = `${content[params.contentIndex || 0] || ""}${params.delta || ""}`;
    upsertExecutionItem(params.turnId, { ...current, content, status: "inProgress" });
  } else if (event.method === "item/fileChange/patchUpdated") {
    const current = currentExecutionItem(params.turnId, params.itemId);
    const item = fileChangeUpdateItem(current, params);
    mergeItemMetric(params.turnId, params.itemId, item);
    upsertExecutionItem(params.turnId, item);
  } else if (event.method === "item/completed") {
    const item = params.item || {};
    const timing = state.turnMetrics.get(params.turnId)?.items?.[item.id] || {};
    if (item.type === "userMessage") {
      renderLiveUserMessage(threadId, item, params.turnId);
    } else if (item.type === "agentMessage" && item.phase !== "commentary") {
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
    if (params.item?.type === "userMessage") renderLiveUserMessage(threadId, params.item, params.turnId);
    else if (params.item?.type !== "agentMessage") upsertExecutionItem(params.turnId, { ...params.item, ...timing, status: params.item?.status || "inProgress" });
  } else if (event.method === "error") {
    showActivity(params.message || "Codex 返回错误。", true);
  }
  const completedFinalMessage = event.method === "item/completed"
    && params.item?.type === "agentMessage"
    && params.item?.phase !== "commentary";
  if (event.method === "item/completed" && !completedFinalMessage && currentRuntime().activeTurnId === params.turnId) {
    scheduleTurnActivity(params.turnId);
  }
}

async function reconcileCompletedThread(projectId, threadId) {
  await refreshProjectThreads(projectId);
  if (state.currentThread?.id === threadId) {
    await selectThread(threadId, { closeNavigation: false, preserveFollowLatest: true, mergeHistory: true });
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
  if (index === -1) threads.unshift(updated);
  else threads[index] = { ...threads[index], ...updated };
  state.threads.set(projectId, threads);
}

function applyQueueSnapshot(threadId, queue, queueRevision) {
  const revision = Number.isInteger(queueRevision) && queueRevision >= 0 ? queueRevision : null;
  const previous = state.queueSnapshots.get(threadId);
  if (revision !== null && previous?.revision !== null && previous?.revision !== undefined) {
    if (revision < previous.revision) return false;
    if (revision === previous.revision && previous.optimistic) return false;
  }
  const next = Array.isArray(queue) ? queue : [];
  state.queueSnapshots.set(threadId, { queue: next, revision, optimistic: false });
  if (state.currentThread?.id === threadId && state.editingQueueItemId && !next.some((item) => item.id === state.editingQueueItemId)) {
    state.editingQueueItemId = null;
    if (ui.queueEditDialog.open) ui.queueEditDialog.close();
  }
  const projectId = findProjectForThread(threadId);
  const thread = projectId && findThread(projectId, threadId);
  if (thread) updateThreadInState(projectId, { ...thread, queueCount: next.length, ...(revision === null ? {} : { queueRevision: revision }) });
  if (state.currentThread?.id === threadId) state.currentQueue = next;
  return true;
}

function consumeQueueHead(threadId) {
  if (state.currentThread?.id !== threadId || state.currentQueue.length === 0) return false;
  const previous = state.queueSnapshots.get(threadId);
  const next = state.currentQueue.slice(1);
  state.currentQueue = next;
  state.queueSnapshots.set(threadId, {
    queue: next,
    revision: previous?.revision ?? null,
    optimistic: previous?.revision !== null && previous?.revision !== undefined,
  });
  const projectId = findProjectForThread(threadId);
  const thread = projectId && findThread(projectId, threadId);
  if (thread) updateThreadInState(projectId, { ...thread, queueCount: next.length });
  return true;
}

async function saveSettings(overrides = {}) {
  const project = currentProject();
  const thread = state.currentThread;
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
  };
  if (isLocalThreadId(thread.id)) {
    state.currentThread = { ...thread, settings };
    updateThreadInState(project.id, state.currentThread);
    renderSettings();
    showActivity("配置将在首次发送时生效。", false);
    return;
  }
  try {
    const result = await api(`/api/threads/${encodeURIComponent(thread.id)}`, { method: "PATCH", body: { settings } });
    state.currentThread = { ...thread, settings: result.settings || {} };
    updateThreadInState(project.id, state.currentThread);
    renderSettings();
    showActivity("已保存到当前聊天；其他聊天不受影响。", false);
  } catch (error) {
    showError(error);
    renderSettings();
  }
}

async function refreshWorkspace({ quiet = false } = {}) {
  if (state.refreshing) return;
  state.refreshing = true;
  ui.refreshWorkspace.disabled = true;
  const rememberedProjectId = state.selectedProjectId;
  const rememberedThreadId = state.currentThread?.id;
  const previousThread = state.currentThread;
  try {
    const status = await api("/api/status");
    setServerStatus(status.status === "ready", status.status === "ready" ? "本机 Codex 已连接" : "本机 Codex 未连接");
    await Promise.all([loadProjects(), loadModels(), loadAccountRateLimits()]);
    await refreshAllThreads();
    const projectId = state.projects.some((project) => project.id === rememberedProjectId) ? rememberedProjectId : state.projects[0]?.id;
    if (projectId) {
      await restoreSelectionAfterRefresh(projectId, rememberedThreadId, previousThread);
    } else {
      clearThread();
    }
    if (ui.projectManagerDialog.open) renderProjectManager();
    if (!quiet) showActivity("工作台已刷新。", false);
  } catch (error) {
    if (!quiet) showError(error);
  } finally {
    state.refreshing = false;
    ui.refreshWorkspace.disabled = false;
  }
}

async function restoreSelectionAfterRefresh(projectId, rememberedThreadId, previousThread, { forceReload = false } = {}) {
  state.selectedProjectId = projectId;
  localStorage.setItem(userStorageKey("project"), projectId);
  const threads = state.threads.get(projectId) || [];
  const target = threads.find((thread) => thread.id === rememberedThreadId) || threads[0];
  renderProjects();
  renderThreads();
  if (!target) {
    clearThread();
    return createThread({ focusPrompt: false });
  }
  state.selectedThreads[projectId] = target.id;
  saveSelection();
  if (forceReload && !isLocalThreadId(target.id)) {
    return selectThread(target.id, {
      closeNavigation: false,
      preserveFollowLatest: true,
      mergeHistory: previousThread?.id === target.id,
    });
  }
  if (previousThread?.id !== target.id) {
    return selectThread(target.id, { closeNavigation: false, preserveFollowLatest: true });
  }
  const historyChanged = Boolean(target.updatedAt && previousThread.syncedUpdatedAt && target.updatedAt !== previousThread.syncedUpdatedAt);
  if (historyChanged) {
    return selectThread(target.id, { closeNavigation: false, preserveFollowLatest: true, mergeHistory: true });
  }
  state.currentThread = {
    ...previousThread,
    ...target,
    turns: previousThread.turns || [],
    history: previousThread.history,
    syncedUpdatedAt: target.updatedAt ?? previousThread.syncedUpdatedAt,
  };
  renderCurrentThread();
}

function configureAutoRefresh() {
  clearInterval(state.refreshTimer);
  const seconds = Number(ui.refreshInterval.value);
  localStorage.setItem(userStorageKey("refresh-seconds"), String(seconds));
  if (Number.isFinite(seconds) && seconds > 0) {
    state.refreshTimer = setInterval(() => refreshWorkspace({ quiet: true }), seconds * 1000);
  }
}

function scheduleResume(delay = 120) {
  if (!state.booted || document.hidden) return;
  clearTimeout(state.resumeTimer);
  state.resumeTimer = setTimeout(() => {
    state.resumeTimer = null;
    resumeAfterInterruption().catch(() => setServerStatus(false, "连接正在重试"));
  }, delay);
}

async function resumeAfterInterruption() {
  if (state.resumePromise) return state.resumePromise;
  if (Date.now() - state.lastResumeAt < 800) return;
  state.lastResumeAt = Date.now();
  state.resumePromise = (async () => {
    const status = await api("/api/status");
    setServerStatus(status.status === "ready", status.status === "ready" ? "本机 Codex 已连接" : "本机 Codex 未连接");
    await Promise.all([refreshAllThreads(), loadAccountRateLimits()]);
    closeAllStreams();
    syncEventStreams();
    const projectId = state.selectedProjectId;
    const threadId = state.currentThread?.id || state.selectedThreads[projectId];
    const previousThread = state.currentThread;
    if (projectId) {
      await restoreSelectionAfterRefresh(projectId, threadId, previousThread, { forceReload: true });
    }
  })();
  try {
    await state.resumePromise;
  } finally {
    state.resumePromise = null;
  }
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
    path.textContent = project.path;
    detail.append(name, path);
    const actions = document.createElement("div");
    actions.className = "project-manager-actions";
    const open = projectAction("打开", async () => {
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
    remove.disabled = state.projects.length === 1;
    if (remove.disabled) remove.title = "至少保留一个项目。";
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
    if (state.currentThread) renderCurrentThread();
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
  ui.projectPath.value = project?.path || `工作区根目录\\${state.user?.username || "账号"}\\（按项目名称自动创建）`;
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
  ui.projectError.textContent = "";
  const projectId = ui.projectForm.dataset.projectId;
  const body = { name: ui.projectName.value.trim() };
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

function setServerStatus(online, text) {
  ui.serverStatus.classList.toggle("online", online);
  ui.serverStatus.classList.toggle("offline", !online);
  ui.serverStatus.textContent = text;
}

function resizePrompt() {
  ui.prompt.style.height = "auto";
  ui.prompt.style.height = `${Math.min(ui.prompt.scrollHeight, 145)}px`;
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
  ui.jumpLatest.hidden = state.followLatest || !state.currentThread || ui.conversation.scrollHeight <= ui.conversation.clientHeight;
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

function closeTopbarOverlays() {
  closeRunStrip();
  closeThreadMenu();
  closeRecentThreads();
  closeAccountMenu();
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

function closeAllStreams() {
  for (const stream of state.streams.values()) stream.close();
  state.streams.clear();
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

function loadSelection() {
  try {
    return JSON.parse(localStorage.getItem(userStorageKey("threads")) || "{}");
  } catch {
    return {};
  }
}

function saveSelection() {
  localStorage.setItem(userStorageKey("threads"), JSON.stringify(state.selectedThreads));
}

function loadTimingState() {
  if (state.timingSaveTimer) clearTimeout(state.timingSaveTimer);
  state.timingSaveTimer = null;
  const restored = parseTimingState(localStorage.getItem(userStorageKey("timing-state")));
  state.turnMetrics = restored.turnMetrics;
  state.activeTurnStarts = restored.activeTurnStarts;
}

function scheduleTimingStateSave() {
  if (!state.user || state.timingSaveTimer) return;
  state.timingSaveTimer = setTimeout(persistTimingState, 50);
}

function persistTimingState() {
  if (state.timingSaveTimer) clearTimeout(state.timingSaveTimer);
  state.timingSaveTimer = null;
  if (!state.user) return;
  try {
    localStorage.setItem(userStorageKey("timing-state"), serializeTimingState(state.turnMetrics, state.activeTurnStarts));
  } catch {
    // 计时记录不应阻断聊天主流程；后续服务端记录仍会在刷新时重新合并。
  }
}

function rememberActiveTurnStart(threadId, turnId, startedAt) {
  if (!threadId || !timestampMilliseconds(startedAt)) return;
  const previous = state.activeTurnStarts.get(threadId);
  const next = { turnId: turnId || previous?.turnId || null, startedAt: timestampMilliseconds(startedAt) };
  if (previous?.turnId === next.turnId && previous?.startedAt === next.startedAt) return;
  state.activeTurnStarts.set(threadId, next);
  scheduleTimingStateSave();
}

function forgetActiveTurnStart(threadId, turnId = null) {
  if (!threadId) return;
  const saved = state.activeTurnStarts.get(threadId);
  if (!saved || (turnId && saved.turnId && saved.turnId !== turnId)) return;
  state.activeTurnStarts.delete(threadId);
  scheduleTimingStateSave();
}

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
    if (response.status === 401) showAuth(false, body.error || "登录已失效，请重新登录。");
    if (!response.ok) throw new Error(body.error || `请求失败（${response.status}）`);
    return body;
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("请求超时，请检查连接后重试。");
    throw error;
  } finally {
    clearTimeout(timeout);
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
      setupToken: ui.setupToken.value,
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
ui.openAccountMenu.addEventListener("click", toggleAccountMenu);
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
ui.openSidebar.addEventListener("click", openSidebar);
ui.closeSidebar.addEventListener("click", closeSidebar);
ui.sidebarScrim.addEventListener("click", closeSidebar);
ui.addProject.addEventListener("click", () => openProjectDialog());
ui.manageProjectsSide.addEventListener("click", openProjectManager);
ui.refreshWorkspace.addEventListener("click", () => {
  persistTimingState();
  location.reload();
});
ui.openGlobalSettings.addEventListener("click", openGlobalSettings);
ui.runStatus.addEventListener("click", toggleRunStrip);
ui.openRecentThreads.addEventListener("click", toggleRecentThreads);
ui.openThreadMenu.addEventListener("click", toggleThreadMenu);
ui.newThread.addEventListener("click", () => createThread().catch(showError));
ui.quickNewThread.addEventListener("click", () => createThread().catch(showError));
ui.guide.addEventListener("click", () => { state.mode = "guide"; updateComposer(); ui.prompt.focus(); });
ui.queue.addEventListener("click", () => { state.mode = "queue"; updateComposer(); ui.prompt.focus(); });
ui.composer.addEventListener("submit", submitPrompt);
ui.uploadFiles.addEventListener("click", chooseUploadFiles);
ui.uploadFileInput.addEventListener("change", () => uploadSelectedFiles());
ui.prompt.addEventListener("paste", (event) => { void pasteClipboardImages(event).catch(showError); });
ui.prompt.addEventListener("input", () => {
  resizePrompt();
  updateComposer();
});
let promptCompositionActive = false;
ui.prompt.addEventListener("compositionstart", () => { promptCompositionActive = true; });
ui.prompt.addEventListener("compositionend", () => { promptCompositionActive = false; });
ui.prompt.addEventListener("keydown", (event) => {
  if (shouldSubmitPromptFromKeyboard(event, {
    compositionActive: promptCompositionActive,
    mobile: isMobileComposer(navigator),
  })) {
    event.preventDefault();
    ui.composer.requestSubmit();
  }
});
ui.stop.addEventListener("click", stopCurrentTurn);
ui.renameThread.addEventListener("click", () => { closeThreadMenu(); openThreadDialog(); });
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
ui.conversation.addEventListener("pointerdown", cancelScrollCommand, { passive: true });
ui.conversation.addEventListener("touchstart", cancelScrollCommand, { passive: true });
ui.conversation.addEventListener("wheel", cancelScrollCommand, { passive: true });
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
window.addEventListener("pagehide", persistTimingState);
window.addEventListener("online", () => scheduleResume(0));
window.addEventListener("focus", () => scheduleResume());
window.addEventListener("codex-native-resume", () => scheduleResume(0));
ui.openSettings.addEventListener("click", () => {
  if (window.CodexAndroid?.openConnectionSettings) window.CodexAndroid.openConnectionSettings();
  else ui.connectionDialog.showModal();
});
document.addEventListener("click", (event) => {
  if (!ui.runStatus.contains(event.target) && !ui.runStrip.contains(event.target)) closeRunStrip();
  if (!ui.threadMenuWrap.contains(event.target)) closeThreadMenu();
  if (!ui.recentThreadWrap.contains(event.target)) closeRecentThreads();
  if (!ui.accountMenuWrap.contains(event.target)) closeAccountMenu();
});
