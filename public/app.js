import { downloadableFiles, downloadLocalFile, localFileDownloadUrl, textPreviewKind } from "./file-downloads.js";
import { renderMarkdownDocument } from "./markdown-preview.js";
import { formatJsonText, plainInlineMarkdown } from "./text-format.js";
import { conversationDateKey, elapsedTiming, formatConversationDate, formatDuration, formatElapsed, formatMessageDateTime, formatMessageTime, timestampMilliseconds } from "./elapsed-time.js";
import { commandDisplayText, executionItemText, isExecutionItem, mergeHistoricalExecutionItem, reconcileStaleExecutionTurn, summarizeExecutionTiming, terminalExecutionStatus, turnProcessMarkdown } from "./execution-events.js";
import { accountLimitWindows, contextWindowUsage, hasCurrentThreadHistory, invalidateThreadHistory, isActiveThreadRuntime, isActiveThreadStatus, mergeAccountRateLimits, mergeThreadListPage, mergeThreadSummaryPage, newThreadSettings, recentThreadEntries, sidebarProjectEntries, sidebarThreadEntries, threadDisplayName, userMessageClientId, visibleServiceTiers } from "./workspace.js";
import { renderAnsiOutput } from "./ansi-output.js";
import { diffLineStats, renderFileChanges, unifiedDiffChanges } from "./diff-output.js";
import { clipboardImageFiles, clipboardImageName, isMobileComposer, messageWithAttachments, resizeComposerInput } from "./composer.js";
import { planShortcut } from "./plan.js";
import { createTurnFooter, updateTurnFooter } from "./turn-footer.js";
import { goalPresentation, goalShortcut, isActiveGoal } from "./goal.js";
import { createWorkbenchLayout } from "./layout.js";
import { copyTextToClipboard, fileChangesText, isPreviewableImage, printableMarkdownHtml, shareMarkdown } from "./mobile-actions.js";

import { EVENT_STREAM_WATCHDOG_INTERVAL_MS, eventStreamNeedsRestart } from "./event-stream.js";
import { profileMark, profileSpan } from "./profiling.js";
import { deriveRunDiagnostic } from "./run-diagnostics.js";
import { conversationNeedsSnapshot, mergeConversationTurns, reduceConversationEvent, recoveryItems, resetConversationVersions } from "./conversation-state.js";
import { reconcileTimelineChildren } from "./conversation-view.js";
import { reconcileSidebarChildren } from "./sidebar-list.js";
import { createAsyncQuestionView, setAsyncQuestionCollapsed, showAnsweredAsyncQuestion } from "./conversation-controls.js";
import { asyncUserInputRequest, asyncAnswerMessage, asyncAnswerText, asyncAnswerRequestId, answeredAsyncRequestIds, displayUserInputText, asyncQuestionDeferred, setAsyncQuestionDeferred, deliverAsyncUserInput } from "./async-user-input.js";

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
  projectsSection: $("#projects-section"),
  sidebarThreadHeading: $("#sidebar-thread-heading"),
  sidebarViewProjects: $("#sidebar-view-projects"),
  sidebarViewRecent: $("#sidebar-view-recent"),
  sidebarSortWrap: $("#sidebar-sort-wrap"),
  sidebarSortTrigger: $("#sidebar-sort-trigger"),
  sidebarSortMenu: $("#sidebar-sort-menu"),
  sidebarOrderOriginal: $("#sidebar-order-original"),
  sidebarOrderRecent: $("#sidebar-order-recent"),
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
  forkThread: $("#fork-thread"),
  compactThread: $("#compact-thread"),
  deleteThread: $("#delete-thread"),
  conversation: $("#conversation"),
  conversationStage: $(".conversation-stage"),
  jumpLatest: $("#jump-latest"),
  queuePanel: $("#queue-panel"),
  summary: $("#summary-select"),
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
  serverStatusLabel: $("#server-status-label"),
  copyConnectionAddress: $("#copy-connection-address"),
  changeConnectionAddress: $("#change-connection-address"),
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
  accountLimitDetails: $("#account-limit-details"),
  accountLimitDetailFiveHour: $("#account-limit-detail-five-hour"),
  accountLimitFiveHourUsage: $("#account-limit-five-hour-usage"),
  accountLimitFiveHourReset: $("#account-limit-five-hour-reset"),
  accountLimitDetailWeek: $("#account-limit-detail-week"),
  accountLimitWeekUsage: $("#account-limit-week-usage"),
  accountLimitWeekReset: $("#account-limit-week-reset"),
  manageUsers: $("#manage-users"),
  changeDisplayName: $("#change-display-name"),
  changePassword: $("#change-password"),
  logout: $("#logout"),
  displayNameDialog: $("#display-name-dialog"),
  displayNameForm: $("#display-name-form"),
  profileDisplayName: $("#profile-display-name"),
  displayNameError: $("#display-name-error"),
  closeDisplayNameDialog: $("#close-display-name-dialog"),
  cancelDisplayName: $("#cancel-display-name"),
  saveDisplayName: $("#save-display-name"),
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
  globalConnectionAddress: $("#global-connection-address"),
  configThreadName: $("#config-thread-name"),
  completionNotifications: $("#completion-notifications"),
  completionNotificationDescription: $("#completion-notification-description"),
  sendShortcut: $("#send-shortcut"),
  defaultModel: $("#default-model"),
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
  suggestThreadName: $("#suggest-thread-name"),
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
  copyMarkdownPreview: $("#copy-markdown-preview"),
  shareMarkdownPreview: $("#share-markdown-preview"),
  closeMarkdownPreview: $("#close-markdown-preview"),
  imagePreviewDialog: $("#image-preview-dialog"),
  imagePreviewName: $("#image-preview-name"),
  imagePreviewPath: $("#image-preview-path"),
  imagePreviewImage: $("#image-preview-image"),
  imagePreviewDownload: $("#image-preview-download"),
  closeImagePreview: $("#close-image-preview"),
  mermaidPreviewDialog: $("#mermaid-preview-dialog"),
  mermaidPreviewName: $("#mermaid-preview-name"),
  mermaidPreviewStage: $("#mermaid-preview-stage"),
  closeMermaidPreview: $("#close-mermaid-preview"),
  visualizationDialog: $("#visualization-dialog"),
  visualizationName: $("#visualization-name"),
  visualizationUrl: $("#visualization-url"),
  visualizationStatus: $("#visualization-status"),
  visualizationFrame: $("#visualization-frame"),
  closeVisualization: $("#close-visualization"),
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
  accountLimitsRevision: 0,
  accountLimitsRequest: null,
  accountLimitsUpdates: new Map(),
  threadTokenUsage: new Map(),
  threads: new Map(),
  threadPages: new Map(),
  globalThreadPage: null,
  globalThreadRefresh: null,
  selectedProjectId: null,
  selectedThreadId: null,
  threadSelectionId: 0,
  threadSelectionController: null,
  threadSelectionTargetId: null,
  loadingHistory: false,
  queueSnapshots: new Map(),
  queueGuiding: new Set(),
  compactingThreads: new Set(),
  forkingThreads: new Set(),
  goalDialogThreadId: null,
  goalMutating: false,
  userInputRequests: new Map(),
  asyncInputCards: new Map(),
  approvalRequests: new Map(),
  editingQueueItemId: null,
  mode: "queue",
  runStripOpen: false,
  workspaceRefreshPromise: null,
  materializingThread: false,
  submittingMessage: false,
  submittingThreadIds: new Set(),
  turnDiagnostics: new Map(),
  uploadingFiles: false,
  composerAttachments: [],
  stoppingTurn: false,
  followLatest: true,
  scrollCommandUntil: 0,
  renderingConversation: false,
  eventStream: null,
  eventEpoch: null,
  eventRevisions: new Map(),
  eventDetailRevisions: new Map(),
  eventStreamReconnectTimer: null,
  eventStreamLastActivityAt: 0,
  eventStreamInterrupted: false,
  eventStreamWatchdogTimer: null,
  eventStreamRecoveryTimer: null,
  eventStreamRecoveryRunning: false,
  messageElements: new Map(),
  executionGroups: new Map(),
  renderedThreadId: null,
  pendingCards: new Map(),
  executionIdleTimers: new Map(),
  runtimeProbes: new Map(),
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
  workspaceSyncVersion: 0,
  sidebarView: "projects",
  sidebarOrder: "original",
  completionNotificationsEnabled: false,
  backgroundCompletionCount: 0,
  sendShortcut: "enter",
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
const platform = platformEntry.bindPlatformInteractions({
  ui,
  cancelScrollCommand,
  closeTopbarOverlays,
  getSubmitShortcut: () => state.sendShortcut,
});
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
  const download = pendingBrowserDownload();
  if (download) {
    location.replace(download);
    return;
  }
  await enterWorkspace(body);
}

function pendingBrowserDownload() {
  const value = new URLSearchParams(location.search).get("download");
  if (!value) return null;
  try {
    const target = new URL(value, location.origin);
    if (target.origin !== location.origin || target.hash) return null;
    const allowed = /^\/api\/projects\/[0-9a-f-]+\/files\/download$/i.test(target.pathname)
      || target.pathname === "/api/admin/files/download";
    return allowed ? `${target.pathname}${target.search}` : null;
  } catch {
    return null;
  }
}

async function enterWorkspace(session) {
  state.user = session.user;
  state.csrfToken = session.csrfToken;
  state.selectedProjectId = localStorage.getItem(userStorageKey("project")) || null;
  state.sidebarView = localStorage.getItem(userStorageKey("sidebar-view")) === "recent" ? "recent" : "projects";
  state.sidebarOrder = localStorage.getItem(userStorageKey("sidebar-order")) === "recent" ? "recent" : "original";
  ui.authShell.hidden = true;
  ui.app.hidden = false;
  renderAccount();
  ui.globalConnectionAddress.textContent = location.origin;
  initializeLocalPreferences();
  await refreshWorkspace({ quiet: true });
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

function loadAccountRateLimits() {
  if (state.accountLimitsRequest) return state.accountLimitsRequest;
  const revision = state.accountLimitsRevision;
  const request = (async () => {
    try {
      const result = await api("/api/account/rate-limits");
      let data = result.available === false ? null : result;
      for (const update of state.accountLimitsUpdates.values()) {
        if (update.revision > revision) data = mergeAccountRateLimits(data, update.snapshot);
      }
      state.accountRateLimits = data;
    } catch {
      if (revision === state.accountLimitsRevision) state.accountRateLimits = null;
    }
    renderAccountLimits();
  })().finally(() => {
    if (state.accountLimitsRequest === request) state.accountLimitsRequest = null;
  });
  state.accountLimitsRequest = request;
  return request;
}

function applyAccountRateLimitsSnapshot(snapshot) {
  clearTimeout(state.accountLimitsTimer);
  state.accountLimitsTimer = null;
  state.accountLimitsRevision++;
  state.accountLimitsUpdates.set(snapshot.limitId || "codex", { revision: state.accountLimitsRevision, snapshot });
  state.accountRateLimits = mergeAccountRateLimits(state.accountRateLimits, snapshot);
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
  ui.accountLimitDetails.hidden = visible.length === 0;
  ui.accountLimitFiveHour.hidden = !limits.fiveHour;
  ui.accountLimitWeek.hidden = !limits.weekly;
  for (const [element, label, limit] of visible) {
    const percent = Math.round(limit.usedPercent);
    element.textContent = `${label} ${percent}%`;
    const reset = limit.resetsAt ? new Date(limit.resetsAt * 1000).toLocaleString() : "未知";
    element.title = `${label === "5H" ? "5 小时" : "每周"}限额已使用 ${percent}%，重置时间：${reset}`;
  }
  renderAccountLimitDetail(ui.accountLimitDetailFiveHour, ui.accountLimitFiveHourUsage, ui.accountLimitFiveHourReset, limits.fiveHour);
  renderAccountLimitDetail(ui.accountLimitDetailWeek, ui.accountLimitWeekUsage, ui.accountLimitWeekReset, limits.weekly);
}

function renderAccountLimitDetail(row, usage, reset, limit) {
  row.hidden = !limit;
  if (!limit) return;
  usage.textContent = `已用 ${Math.round(limit.usedPercent)}%`;
  reset.textContent = limit.resetsAt ? `重置 ${new Date(limit.resetsAt * 1000).toLocaleString()}` : "重置时间未知";
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

async function refreshAllThreads({ foregroundProjectId = null } = {}) {
  const foreground = foregroundProjectId || state.selectedProjectId || state.projects[0]?.id;
  const foregroundRefresh = foreground ? refreshProjectThreads(foreground) : Promise.resolve();
  void refreshGlobalThreads().catch((error) => showActivity(`跨项目摘要刷新失败：${error.message}`, true));
  await foregroundRefresh;
  ensureEventStream();
  renderRunStrip();
}

async function refreshGlobalThreads({ cursor = null, append = false } = {}) {
  if (state.globalThreadRefresh) return state.globalThreadRefresh;
  const order = state.sidebarOrder;
  const baseline = new Map([...state.threads].map(([id, threads]) => [id, [...threads]]));
  const baselineIds = [...(state.globalThreadPage?.ids || [])];
  const refresh = (async () => {
    // Static assets can update before the running service is restarted. Keep
    // that existing server usable until it advertises the new sync contract.
    if (state.workspaceSyncVersion < 2) {
      for (const project of state.projects) if (project.id !== state.selectedProjectId) await refreshProjectThreads(project.id);
      state.globalThreadPage = { ids: [...state.threads.values()].flatMap((threads) => threads.map((thread) => thread.id)), nextCursor: null, order };
      renderThreads();
      renderRunStrip();
      return;
    }
    const query = new URLSearchParams({ limit: "50", order });
    if (cursor) query.set("cursor", cursor);
    let result;
    do {
      result = await api(`/api/workspace/threads?${query}`);
      if (!result.pageThreadIds?.length && result.nextCursor) query.set("cursor", result.nextCursor);
    } while (!result.pageThreadIds?.length && result.nextCursor);
    if (state.sidebarOrder !== order) return;
    for (const project of state.projects) {
      const listed = (result.threads || []).filter((thread) => thread.projectId === project.id);
      state.threads.set(project.id, mergeThreadSummaryPage(baseline.get(project.id), state.threads.get(project.id), listed));
    }
    state.globalThreadPage = mergeThreadListPage(state.globalThreadPage, result.pageThreadIds || [], result.nextCursor, { order, append, baselineIds });
    renderProjects();
    renderThreads();
    renderRunStrip();
  })();
  state.globalThreadRefresh = refresh;
  if (state.sidebarView === "recent") renderThreads();
  try { await refresh; }
  finally {
    if (state.globalThreadRefresh === refresh) state.globalThreadRefresh = null;
    renderThreads();
    if (state.sidebarOrder !== order && state.sidebarView === "recent") void refreshGlobalThreads().catch(showError);
  }
}

async function refreshProjectThreads(projectId, { cursor = null, append = false } = {}) {
  const project = state.projects.find((entry) => entry.id === projectId);
  if (project?.available === false) {
    state.threads.set(projectId, []);
    if (projectId === state.selectedProjectId || state.sidebarView === "recent") renderThreads();
    else if (state.sidebarOrder === "recent") renderProjects();
    return [];
  }
  const order = state.sidebarOrder;
  const existing = state.threadPages.get(projectId);
  if (existing?.loading && existing.order === order) return existing.loading;
  const page = { ...(existing?.order === order ? existing : {}), ids: existing?.order === order ? existing.ids : [], order, loading: null };
  state.threadPages.set(projectId, page);
  const baselineThreads = [...(state.threads.get(projectId) || [])];
  const baselineIds = [...page.ids];
  const load = (async () => {
    const query = new URLSearchParams({ limit: "50", order });
    if (cursor) query.set("cursor", cursor);
    let result;
    do {
      result = await api(`/api/projects/${encodeURIComponent(projectId)}/threads${state.workspaceSyncVersion >= 2 ? `?${query}` : ""}`);
      if (!result.threads?.length && result.nextCursor) query.set("cursor", result.nextCursor);
    } while (!result.threads?.length && result.nextCursor);
    if (state.threadPages.get(projectId) !== page) return state.threads.get(projectId) || [];
    const currentThreads = state.threads.get(projectId) || [];
    const listed = [...(result.threads || []), ...(result.preferredThread ? [result.preferredThread] : [])];
    const threads = mergeThreadSummaryPage(baselineThreads, currentThreads, listed).map((thread) => {
      const snapshot = state.queueSnapshots.get(thread.id);
      if (!snapshot || snapshot.revision === null || snapshot.revision === undefined || !Number.isInteger(thread.queueRevision)) return thread;
      if (thread.queueRevision >= snapshot.revision) return thread;
      return { ...thread, queueCount: snapshot.queue.length, queueRevision: snapshot.revision };
    });
    Object.assign(page, mergeThreadListPage(page, (result.threads || []).map((thread) => thread.id), result.nextCursor, { order, append, baselineIds }));
    state.threads.set(projectId, threads);
    if (projectId === state.selectedProjectId || state.sidebarView === "recent") renderThreads();
    else if (state.sidebarOrder === "recent") renderProjects();
    renderRunStrip();
    return threads;
  })();
  page.loading = load;
  if (projectId === state.selectedProjectId) renderThreads();
  try { return await load; }
  finally {
    page.loading = null;
    if (state.threadPages.get(projectId) === page) renderThreads();
  }
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
  if (threadId && findThread(project.id, threadId)) {
    await selectThread(threadId, { closeNavigation: !keepSidebarOpen, preserveFollowLatest });
    return;
  }
  if (state.threadPages.get(project.id)?.order !== state.sidebarOrder) {
    const selectionId = state.threadSelectionId;
    await refreshProjectThreads(project.id);
    if (state.selectedProjectId !== project.id || state.threadSelectionId !== selectionId) return;
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
  const canShowHistory = Boolean(listedThread?.history && Array.isArray(listedThread.turns));
  if (threadId === state.selectedThreadId && hasCachedHistory && !mergeHistory) {
    if (state.threadSelectionController || state.threadSelectionTargetId) {
      cancelThreadSelection();
      renderThreads();
      updateComposer();
    }
    ui.prompt.focus();
    return;
  }
  cancelThreadSelection();
  const controller = new AbortController();
  const selectionId = ++state.threadSelectionId;
  state.threadSelectionController = controller;
  if (listedThread) {
    updateThreadInState(project.id, { ...listedThread, accessedAt: new Date().toISOString() });
    // Show the last snapshot immediately, even when it needs reconciliation.
    // Only a current snapshot may skip the full history request below.
    if (canShowHistory && !mergeHistory) {
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
      const activeTurnId = isActiveThreadRuntime(listedThread?.runtime) ? listedThread.runtime.activeTurnId : null;
      const activeMetrics = activeTurnId ? `&activeTurnId=${encodeURIComponent(activeTurnId)}` : "";
      const result = await api(`/api/threads/${encodeURIComponent(threadId)}?projectId=${encodeURIComponent(project.id)}&history=none${activeMetrics}`, { signal: controller.signal });
      ingestTurnMetrics(result.metrics);
      for (const itemId of result.answeredAsyncUserInputIds || []) markAsyncQuestionAnswered(threadId, itemId);
      if (selectionId === state.threadSelectionId && result.accessedAt) {
        updateThreadInState(project.id, { ...findThread(project.id, threadId), accessedAt: result.accessedAt });
      }
      if (selectionId === state.threadSelectionId && state.selectedThreadId === threadId && activeTurnId) {
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
  state.eventDetailRevisions.set(threadId, result.eventRevision || 0);
  ingestTurnMetrics(result.metrics);
  if (result.tokenUsage) rememberThreadTokenUsage(threadId, result.tokenUsage);
  const selected = currentThread();
  const previous = selected?.id === threadId ? selected : null;
  const turns = mergeHistory && previous
    ? mergeTurnPages(previous.turns || [], result.thread.turns || [])
    : mergeConversationTurns(previous?.turns || [], result.thread.turns || [], { canonical: true });
  const history = mergeHistory && previous?.history
    ? { ...result.history, hasMore: previous.history.hasMore, before: previous.history.before }
    : result.history;
  updateThreadInState(project.id, {
    ...result.thread,
    turns,
    history,
    historyRevision: result.eventRevision || 0,
    historySnapshotId: selectionId,
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
  ui.forkThread.disabled = true;
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

function queuedItem(threadId, itemId) {
  return state.queueSnapshots.get(threadId)?.queue?.find((item) => item.id === itemId || item.clientId === itemId) || null;
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
  const runtime = currentRuntime();
  const activeTurnId = isActiveThreadStatus(runtime.status) ? runtime.activeTurnId : null;
  if (activeTurnId) {
    const activity = state.messageElements.get(turnActivityId(activeTurnId));
    if (activity) renderTurnActivityMessage(activeTurnId, activity);
  }
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
    if (timed[key] == null && metric[key] != null) timed[key] = metric[key];
  }
  const items = turn.items || [];
  timed.items = items.map((item) => {
    const itemMetric = metric.items?.[item.id] || metric.items?.[item.clientId];
    return itemMetric ? mergeHistoricalExecutionItem(item, itemMetric, turn.status) : item;
  });
  return timed;
}

function renderProjects() {
  ui.projectList.replaceChildren();
  for (const project of sidebarProjectEntries(state.projects, state.threads, state.sidebarOrder)) {
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
  const previous = new Map([...ui.threadList.querySelectorAll(".thread-item")].map((button) => [button.dataset.threadId, button]));
  const nodes = [];
  renderSidebarControls();
  if (state.sidebarOrder === "recent") renderProjects();
  const project = currentProject();
  if (!project) { ui.threadList.replaceChildren(); return; }
  const crossProject = state.sidebarView === "recent";
  ui.projectsSection.hidden = crossProject;
  ui.sidebarThreadHeading.textContent = crossProject ? "最近对话" : "聊天";
  if (!crossProject && project.available === false) {
    const unavailable = document.createElement("p");
    unavailable.className = "sidebar-empty error";
    unavailable.textContent = "项目目录当前不可用";
    ui.threadList.replaceChildren(unavailable);
    return;
  }
  const page = crossProject ? state.globalThreadPage : state.threadPages.get(project.id);
  const pageIds = new Set(page?.ids || []);
  const visibleThreads = new Map([...state.threads].map(([id, threads]) => {
    const byId = new Map(threads.map((thread) => [thread.id, thread]));
    const ordered = (page?.ids || []).flatMap((threadId) => byId.has(threadId) ? [byId.get(threadId)] : []);
    const pinned = !crossProject && id === project.id ? threads.filter((thread) => !pageIds.has(thread.id)
      && (isLocalThreadId(thread.id) || thread.id === state.selectedThreadId)) : [];
    return [id, [...pinned, ...ordered]];
  }));
  const entries = sidebarThreadEntries(state.projects, visibleThreads, {
    view: state.sidebarView,
    order: state.sidebarOrder,
    projectId: project.id,
  });
  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "sidebar-empty";
    empty.textContent = page?.loading || crossProject && state.globalThreadRefresh ? "正在加载对话…" : crossProject ? "还没有可显示的对话" : "这个项目还没有聊天";
    ui.threadList.replaceChildren(empty);
    appendThreadLoadMore(page, crossProject, project.id);
    renderRecentThreads();
    return;
  }
  for (const { project: threadProject, thread } of entries) {
    const button = previous.get(thread.id) || document.createElement("button");
    button.type = "button";
    button.className = "thread-item";
    button.dataset.threadId = thread.id;
    if (crossProject) button.classList.add("cross-project");
    if (thread.id === state.selectedThreadId) button.classList.add("active");
    if (thread.id === state.threadSelectionTargetId) button.classList.add("loading");
    if (isActiveThreadRuntime(thread.runtime)) button.classList.add("running");
    else if (isActiveGoal(thread.goal)) button.classList.add("goal-active");
    const title = button.querySelector("strong") || document.createElement("strong");
    if (title.textContent !== threadDisplayName(thread)) title.textContent = threadDisplayName(thread);
    const details = button.querySelector("small") || document.createElement("small");
    for (const key of ["elapsedPrefix", "elapsedStartedAt", "elapsedCompletedAt", "elapsedDurationMs", "elapsedFinal"]) delete details.dataset[key];
    const queueCount = thread.queueCount || 0;
    if (crossProject) details.textContent = thread.id === state.threadSelectionTargetId ? `${threadProject.name} · 打开中…` : threadProject.name;
    else if (thread.id === state.threadSelectionTargetId) details.textContent = "打开中…";
    else if (isActiveThreadRuntime(thread.runtime)) setElapsedDisplay(details, "执行中", thread.runtime);
    else if (isActiveGoal(thread.goal)) details.textContent = "目标续跑中";
    else details.textContent = queueCount ? `队列 ${queueCount}` : "空闲";
    if (!title.parentNode) button.append(title, details);
    button.onclick = () => {
      if (threadProject.id === state.selectedProjectId) return selectThread(thread.id).catch(showError);
      return selectProject(threadProject.id, { threadId: thread.id }).catch(showError);
    };
    nodes.push(button);
  }
  appendThreadLoadMore(page, crossProject, project.id, nodes);
  reconcileSidebarChildren(ui.threadList, nodes);
  renderRecentThreads();
}

function appendThreadLoadMore(page, crossProject, projectId, nodes = null) {
  if (!page?.nextCursor || page.order !== state.sidebarOrder) return;
  const loading = Boolean(page.loading) || crossProject && Boolean(state.globalThreadRefresh);
  const more = document.createElement("button");
  more.type = "button";
  more.className = "thread-load-more";
  more.disabled = loading;
  more.setAttribute("aria-busy", String(loading));
  more.innerHTML = '<span></span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>';
  more.firstChild.textContent = loading ? "正在加载…" : "显示更多对话";
  more.addEventListener("click", async (event) => {
    const scroller = ui.threadList.closest(".sidebar-navigation-body");
    const scrollTop = scroller?.scrollTop;
    const options = { cursor: page.nextCursor, append: true };
    try {
      if (crossProject) await refreshGlobalThreads(options);
      else await refreshProjectThreads(projectId, options);
      if ((state.sidebarView === "recent") !== crossProject || !crossProject && state.selectedProjectId !== projectId) return;
      if (scroller) scroller.scrollTop = scrollTop;
      if (event.detail === 0) {
        const known = new Set(page.ids);
        const firstNew = [...ui.threadList.querySelectorAll(".thread-item")].find((button) => !known.has(button.dataset.threadId));
        firstNew?.focus({ preventScroll: true });
      }
    } catch (error) { showError(error); }
  });
  if (nodes) nodes.push(more);
  else ui.threadList.append(more);
}

function renderSidebarControls() {
  ui.sidebarViewProjects.setAttribute("aria-pressed", String(state.sidebarView === "projects"));
  ui.sidebarViewRecent.setAttribute("aria-pressed", String(state.sidebarView === "recent"));
  ui.sidebarOrderOriginal.setAttribute("aria-checked", String(state.sidebarOrder === "original"));
  ui.sidebarOrderRecent.setAttribute("aria-checked", String(state.sidebarOrder === "recent"));
  ui.sidebarSortTrigger.setAttribute("aria-label", `排序方式：${state.sidebarOrder === "recent" ? "最近使用" : "原始顺序"}`);
}

function closeSidebarSortMenu() {
  ui.sidebarSortMenu.hidden = true;
  ui.sidebarSortTrigger.setAttribute("aria-expanded", "false");
}

function toggleSidebarSortMenu() {
  const opening = ui.sidebarSortMenu.hidden;
  closeAccountMenu();
  ui.sidebarSortMenu.hidden = !opening;
  ui.sidebarSortTrigger.setAttribute("aria-expanded", String(opening));
}

function setSidebarNavigation(view, order) {
  if (view) state.sidebarView = view;
  if (order) state.sidebarOrder = order;
  closeSidebarSortMenu();
  localStorage.setItem(userStorageKey("sidebar-view"), state.sidebarView);
  localStorage.setItem(userStorageKey("sidebar-order"), state.sidebarOrder);
  renderProjects();
  renderThreads();
  if (state.sidebarView === "recent") void refreshGlobalThreads().catch(showError);
  else if (state.selectedProjectId && (order || state.threadPages.get(state.selectedProjectId)?.order !== state.sidebarOrder)) void refreshProjectThreads(state.selectedProjectId).catch(showError);
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
  const previous = new Map([...ui.recentThreadMenu.children].map((button) => [button.dataset.threadId, button]));
  const nodes = [];
  for (const { project, thread } of entries) {
    const button = previous.get(thread.id) || document.createElement("button");
    button.type = "button";
    button.dataset.threadId = thread.id;
    button.className = "recent-thread-item";
    if (thread.id === state.selectedThreadId) button.classList.add("active");
    if (thread.id === state.threadSelectionTargetId) button.classList.add("loading");
    if (isActiveThreadRuntime(thread.runtime)) button.classList.add("running");
    else if (isActiveGoal(thread.goal)) button.classList.add("goal-active");
    const title = button.querySelector("strong") || document.createElement("strong");
    if (title.textContent !== threadDisplayName(thread)) title.textContent = threadDisplayName(thread);
    const projectName = button.querySelector("small") || document.createElement("small");
    projectName.textContent = thread.id === state.threadSelectionTargetId ? `${project.name} · 打开中…` : project.name;
    if (!title.parentNode) button.append(title, projectName);
    button.onclick = async () => {
      closeRecentThreads();
      await selectProject(project.id, { threadId: thread.id });
    };
    nodes.push(button);
  }
  reconcileSidebarChildren(ui.recentThreadMenu, nodes);
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
    if (isActiveThreadRuntime(thread.runtime)) {
      const diagnostic = deriveRunDiagnostic({ runtime: thread.runtime });
      if (diagnostic.state === "unexplained") detail.textContent = `${diagnostic.label} · ${formatElapsed(diagnostic.ageMs || 0)}`;
      else setElapsedDisplay(detail, diagnostic.label, thread.runtime);
    }
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
  const models = selectedModel && !state.models.some((model) => model.id === selectedModel.id)
    ? [selectedModel, ...state.models] : state.models;
  fillOptions(ui.composerModel, models, compactModelLabel, selectedModel?.id, "没有可用模型");
  const efforts = selectedModel?.supportedReasoningEfforts || [];
  const selectedEffort = settings.effort || selectedModel?.defaultReasoningEffort || efforts[0]?.reasoningEffort;
  fillCompactEffortOptions(ui.composerEffort, efforts, selectedEffort);
  const selectedTier = settings.serviceTier || "";
  const tiers = visibleServiceTiers(selectedModel?.serviceTiers, selectedTier);
  fillCompactTierOptions(ui.composerTier, tiers, selectedTier);
  ui.summary.value = ["auto", "concise", "detailed", "none"].includes(settings.summary) ? settings.summary : "detailed";
  const planAvailable = state.collaborationModes.some((entry) => entry.mode === "plan");
  const planActive = settings.collaborationMode === "plan";
  ui.planMode.hidden = !planAvailable;
  ui.planMode.classList.toggle("active", planActive);
  ui.planMode.setAttribute("aria-pressed", String(planActive));
  ui.planMode.setAttribute("aria-label", planActive ? "退出规划模式" : "进入规划模式");
  ui.planMode.title = planActive ? "退出规划模式" : "进入规划模式；也可输入 /plan";
  const disabled = !thread || !state.models.length;
  ui.composerModel.disabled = disabled;
  ui.composerEffort.disabled = disabled || !efforts.length;
  ui.composerTier.disabled = disabled || !tiers.length;
  compactSelects.refresh();
  ui.summary.disabled = !thread;
  ui.planMode.disabled = !thread || isActiveThreadRuntime(currentRuntime());
  ui.configThreadName.textContent = thread ? threadDisplayName(thread) : "请先选择聊天。";
}

function selectedModelForThread(thread) {
  const modelId = thread?.settings?.model;
  return state.models.find((model) => model.id === modelId)
    || (modelId ? { id: modelId, displayName: `${modelId}（当前不可用）` } : null)
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
  const value = String(tier?.name || tier?.id || "").toLowerCase();
  return ({ standard: "标准", fast: "快速", priority: "快速", ultrafast: "超快", flex: "弹性" })[value] || "服务档";
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
  const forking = thread && state.forkingThreads.has(thread.id);
  const submitting = state.submittingMessage || (thread && state.submittingThreadIds.has(thread.id));
  const switching = Boolean(state.threadSelectionTargetId);
  ui.openThreadMenu.disabled = !thread || switching || submitting || forking;
  ui.renameThread.disabled = !thread || switching || submitting || forking;
  ui.forkThread.disabled = !thread || local || active || compacting || submitting || forking || !state.codexReady || switching;
  ui.forkThread.textContent = forking ? "正在分叉…" : "分叉聊天";
  ui.compactThread.disabled = !thread || local || active || goalActive || compacting || submitting || forking || !state.codexReady || switching;
  ui.compactThread.textContent = compacting ? "正在压缩上下文…" : "压缩上下文";
  ui.deleteThread.disabled = !thread || active || goalActive || compacting || submitting || forking || switching;
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

function scheduleConversationRender(threadId) {
  if (state.conversationFrame) return;
  state.conversationFrame = requestAnimationFrame(() => {
    state.conversationFrame = null;
    // Render the currently selected model, not a closure over a previous tab.
    renderConversation(currentThread()?.turns || []);
  });
}

function renderConversation(turns) {
  return renderConversationProfiled(turns);
}

function renderConversationProfiled(turns) {
  const finishProfile = profileSpan("renderConversation", { threadId: state.selectedThreadId });
  const shouldFollow = state.followLatest;
  state.renderingConversation = true;
  try {
    if (state.renderedThreadId !== state.selectedThreadId) {
      state.messageElements.clear();
      state.executionGroups.clear();
      ui.conversation.replaceChildren();
      pendingArea().replaceChildren();
      state.renderedThreadId = state.selectedThreadId;
    }
    const thread = currentThread();
    if (thread) thread.answeredAsyncUserInputIds = [...new Set([
      ...(thread.answeredAsyncUserInputIds || []), ...answeredAsyncRequestIds(turns || [], currentQueue()),
    ])];
    const roots = [];
    if (thread?.history?.hasMore) {
      const loader = ui.conversation.querySelector(".history-loader") || document.createElement("button");
      loader.className = "history-loader";
      loader.type = "button";
      loader.disabled = state.loadingHistory;
      loader.textContent = state.loadingHistory ? "正在加载…" : "加载更早记录";
      loader.onclick = () => void loadOlderTurns().catch(showError);
      roots.push(loader);
    }
    const visibleTurns = new Set();
    let dateKey = null;
    for (const rawTurn of turns || []) {
      const turn = reconcileStaleExecutionTurn(turnWithMetrics(rawTurn), currentRuntime());
      visibleTurns.add(turn.id);
      const group = ensureExecutionGroup(turn.id, turn.status, turn);
      const time = turnTimestamp(turn);
      const key = conversationDateKey(time);
      if (key && key !== dateKey) {
        if (!group.date) {
          group.date = document.createElement("div");
          group.date.className = "conversation-date";
        }
        group.date.textContent = formatConversationDate(time);
        roots.push(group.date);
        dateKey = key;
      }
      const nodes = [];
      const itemIds = new Set();
      for (const item of turn.items || []) {
        if (queuedItem(state.selectedThreadId, userMessageClientId(item) || item.id)) continue;
        itemIds.add(item.id);
        let message;
        if (isExecutionItem(item)) {
          const metric = state.turnMetrics.get(turn.id)?.items?.[item.id];
          const raw = rawTurn.items?.find((entry) => entry.id === item.id);
          const rendered = group.rendered.get(item.id);
          if (!rendered || rendered.raw !== raw || rendered.metric !== metric || rendered.status !== item.status) {
            upsertExecutionItem(turn.id, item, { turnStatus: turn.status, timing: turn });
            group.rendered.set(item.id, { raw, metric, status: item.status });
          }
          message = group.items.get(item.id);
        } else message = renderHistoryItem(item, { turnId: turn.id, guide: item.inputKind === "guide" });
        if (message?.root) {
          message.root.dataset.itemId = item.id;
          message.root.dataset.turnId = turn.id;
          nodes.push(message.root);
        }
      }
      for (const [id, entry] of group.items) if (!itemIds.has(id)) {
        entry.root.remove();
        group.items.delete(id);
        group.rendered.delete(id);
      }
      reconcileTimelineChildren(group.list, nodes);
      group.planValue = turn.task?.plan || state.turnMetrics.get(turn.id)?.plan;
      group.changes = turn.task?.diff ? unifiedDiffChanges(turn.task.diff) : (turn.items || []).filter((item) => item.type === "fileChange").flatMap((item) => item.changes || []);
      group.recovered = recoveryItems(turn.items, state.turnMetrics.get(turn.id)?.items);
      updateExecutionGroup(group, turn.status);
      roots.push(group.root);
    }
    for (const [id, group] of state.executionGroups) if (!visibleTurns.has(id)) {
      group.root.remove();
      state.executionGroups.delete(id);
    }
    reconcileTimelineChildren(ui.conversation, roots);
    if (!roots.length) renderEmptyConversation();
    renderPendingRequests();
    const activeTurnId = currentRuntime().activeTurnId;
    if (activeTurnId) scheduleTurnActivity(activeTurnId, 300);
  } finally {
    state.renderingConversation = false;
    syncElapsedTimer();
    finishProfile();
  }
  if (shouldFollow) scrollToLatest(false);
  else updateJumpLatest();
}

// Controls are current obligations, not chronological transcript entries.
function pendingArea() {
  if (!ui.pendingRequests) {
    const dock = document.createElement("details");
    dock.className = "conversation-pending";
    dock.hidden = true;
    const heading = document.createElement("summary");
    heading.textContent = "待处理";
    const list = document.createElement("div");
    list.className = "pending-request-list";
    dock.append(heading, list);
    ui.conversationStage.prepend(dock);
    ui.pendingRequests = dock;
    ui.pendingRequestList = list;
  }
  return ui.pendingRequestList;
}

function renderPendingRequests() {
  const parent = pendingArea();
  const roots = [];
  const requests = [
    ...[...state.userInputRequests.values()].map((request) => ({ request, kind: "input" })),
    ...[...state.approvalRequests.values()].map((request) => ({ request, kind: "approval" })),
  ].filter(({ request }) => request.threadId === state.selectedThreadId);
  for (const { request, kind } of requests) {
    const key = kind + ":" + request.requestId;
    let entry = state.pendingCards.get(key);
    const ready = kind === "input" ? Array.isArray(request.questions) : request.detailsAvailable !== false;
    if (!entry || (!entry.ready && ready)) {
      if (!ready) {
        const root = document.createElement("p");
        root.setAttribute("role", "status");
        root.textContent = "正在获取待处理请求详情…";
        entry = { root, ready: false };
        state.pendingCards.set(key, entry);
        roots.push(root);
        continue;
      }
      const root = kind === "input" ? renderUserInputRequest(request) : renderApprovalRequest(request);
      if (!root) continue;
      entry = { root, ready: true };
      state.pendingCards.set(key, entry);
    }
    roots.push(entry.root);
  }
  const alive = new Set([
    ...[...state.userInputRequests.values()].map((request) => "input:" + request.requestId),
    ...[...state.approvalRequests.values()].map((request) => "approval:" + request.requestId),
  ]);
  for (const key of state.pendingCards.keys()) if (!alive.has(key)) state.pendingCards.delete(key);
  reconcileTimelineChildren(parent, roots);
  const wasHidden = ui.pendingRequests.hidden;
  ui.pendingRequests.hidden = !roots.length;
  ui.pendingRequests.firstElementChild.textContent = `待处理 · ${roots.length}`;
  if (roots.length && wasHidden) ui.pendingRequests.open = true;
  for (const group of state.executionGroups.values()) {
    for (const entry of group.items.values()) {
      const linked = requests.find(({ request }) => request.itemId === entry.item.id);
      let link = entry.root.querySelector(".pending-request-link");
      if (!linked) { link?.remove(); continue; }
      if (!link) {
        link = document.createElement("button");
        link.className = "quiet-button pending-request-link";
        link.type = "button";
        link.textContent = "处理请求";
        entry.root.querySelector("summary").append(link);
      }
      link.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        ui.pendingRequests.open = true;
        state.pendingCards.get(linked.kind + ":" + linked.request.requestId)?.root.querySelector("input,button")?.focus();
      };
    }
  }
}

function renderUserInputRequest(request, { inlineAsync = false } = {}) {
  if (!request?.requestId || request.threadId !== state.selectedThreadId) return;

  ui.conversation.querySelector(".empty-state")?.remove();
  const form = document.createElement("form");
  form.className = inlineAsync ? "user-input-card async-question-form" : "user-input-card";
  form.dataset.requestId = request.requestId;
  const heading = document.createElement("div");
  heading.className = "user-input-heading";
  const title = document.createElement("strong");
  title.textContent = inlineAsync ? "待回答" : "需要你确认";
  const note = document.createElement("span");
  note.textContent = request.isBlocking === false ? "你可以稍后回答，Codex 会继续执行" : "回答后 Codex 会继续当前任务";
  heading.append(title, note);
  const controls = [];
  form.append(heading);
  for (const [index, question] of request.questions.entries()) {
    const field = document.createElement("fieldset");
    field.className = "user-input-question";
    const legend = document.createElement("legend");
    const header = document.createElement("span");
    header.textContent = question.header;
    header.hidden = inlineAsync || !question.header;
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
        otherText.setAttribute("aria-label", `${question.header}：其他回答`);
        otherText.disabled = true;
        otherText.hidden = true;
        other.append(otherText);
        field.append(other);
      }
      const radios = [...field.querySelectorAll('input[type="radio"]')];
      if (inlineAsync && radios.length) radios[0].checked = true;
      for (const radio of radios) {
        radio.required = true;
        radio.addEventListener("change", () => {
          if (!otherText) return;
          const selectedOther = radio.checked && radio.dataset.other === "true";
          if (selectedOther) {
            otherText.hidden = false;
            otherText.disabled = false;
            otherText.required = true;
            otherText.focus();
          } else if (radio.checked) {
            otherText.required = false;
            otherText.disabled = true;
            otherText.hidden = true;
          }
        });
      }
      controls.push({ question, field, otherText });
    } else {
      const input = document.createElement("input");
      input.className = "user-input-text";
      input.type = question.isSecret ? "password" : "text";
      input.autocomplete = "off";
      input.setAttribute("aria-label", question.question);
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
  if (inlineAsync) {
    const later = document.createElement("button");
    later.className = "quiet-button";
    later.type = "button";
    later.textContent = "稍后回答";
    later.dataset.action = "defer";
    footer.prepend(later);
  }
  form.append(footer);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitUserInputRequest(request, form, controls, error, submit);
  });
  return form;
}

function renderAsyncUserInput(item, turnId) {
  const request = asyncUserInputRequest(item, { threadId: state.selectedThreadId, turnId });
  if (!request) return null;
  const key = `${request.threadId}:${request.requestId}`;
  const answered = currentThread()?.answeredAsyncUserInputIds?.includes(request.requestId);
  let view = state.asyncInputCards.get(key);
  if (!view) {
    view = createAsyncQuestionView(request, renderUserInputRequest(request, { inlineAsync: true }));
    state.asyncInputCards.set(key, view);
    view.form.querySelector('[data-action="defer"]').addEventListener("click", () => {
      collapseAsyncQuestion(view, true);
      view.resume.focus({ preventScroll: true });
    });
    view.resume.addEventListener("click", () => {
      collapseAsyncQuestion(view, false);
      view.form.querySelector("input")?.focus({ preventScroll: true });
    });
    collapseAsyncQuestion(view, asyncQuestionDeferred(localStorage, userStorageKey("deferred-async-questions"), key), { persist: false });
  }
  if (answered) {
    const text = asyncAnswerText(request.requestId, currentThread()?.turns || [], currentQueue()) || view.answerText || "";
    if (!view.answered || view.answerText !== text) showAnsweredAsyncQuestion(view, request, text);
  } else updateAsyncQuestionNote(view);
  return view;
}

function collapseAsyncQuestion(view, collapsed, { persist = true } = {}) {
  setAsyncQuestionCollapsed(view, collapsed);
  if (persist) setAsyncQuestionDeferred(localStorage, userStorageKey("deferred-async-questions"), `${view.request.threadId}:${view.request.requestId}`, collapsed);
  updateAsyncQuestionNote(view);
}

function updateAsyncQuestionNote(view) {
  if (view.answered) return;
  const thread = findThread(findProjectForThread(view.request.threadId), view.request.threadId);
  view.form.querySelector(".user-input-heading span").textContent = isActiveThreadRuntime(thread?.runtime)
    ? "可稍后回答，不影响当前任务"
    : "任务已结束，回答后开始下一轮";
}

function markAsyncQuestionAnswered(threadId, requestId, answerText = "") {
  if (!requestId) return;
  const projectId = findProjectForThread(threadId);
  const thread = findThread(projectId, threadId);
  if (thread) updateThreadInState(projectId, { id: threadId,
    answeredAsyncUserInputIds: [...new Set([...(thread.answeredAsyncUserInputIds || []), requestId])] });
  const view = state.asyncInputCards.get(`${threadId}:${requestId}`);
  if (view) {
    const text = answerText || asyncAnswerText(requestId, thread?.turns || [], state.queueSnapshots.get(threadId)?.queue || []) || view.answerText || "";
    if (!view.answered || view.answerText !== text) showAnsweredAsyncQuestion(view, view.request, text);
  }
  setAsyncQuestionDeferred(localStorage, userStorageKey("deferred-async-questions"), `${threadId}:${requestId}`, false);
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
  detail.hidden = !description;
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
  const hadFocus = form.contains(document.activeElement);
  error.textContent = "";
  submit.textContent = "正在提交…";
  for (const element of form.elements) element.disabled = true;
  try {
    if (request.delivery === "async") {
      const result = await deliverAsyncUserInput({ request, answers, projectId: project.id, api });
      markAsyncQuestionAnswered(request.threadId, request.requestId, displayUserInputText(asyncAnswerMessage(request, answers)).replace(/^回答你的提问：\n/, ""));
      // Disabling the submitted control releases focus to body. Keep keyboard
      // users at this question, unless they moved elsewhere while awaiting it.
      if (hadFocus && document.activeElement === document.body) {
        state.asyncInputCards.get(`${request.threadId}:${request.requestId}`)?.root.querySelector("summary")?.focus({ preventScroll: true });
      }
      if (result.delivery === "guide") acceptGuideMessage(request.threadId, result.turnId, result.item);
      else {
        applyQueueSnapshot(request.threadId, result.queue, result.queueRevision);
        if (state.selectedThreadId === request.threadId) renderQueue();
      }
      showActivity("回答已送达。", false);
      return;
    }
    await api(`/api/threads/${encodeURIComponent(request.threadId)}/user-input/${encodeURIComponent(request.requestId)}`, {
      method: "POST",
      body: { projectId: project.id, answers },
    });
    state.userInputRequests.delete(request.requestId);
    removeUserInputCard(request.requestId);
    renderPendingRequests();
    scheduleTurnActivity(request.turnId, 0);
  } catch (submitError) {
    for (const element of form.elements) element.disabled = false;
    for (const control of controls) {
      if (control.otherText) control.otherText.disabled = !control.field.querySelector('input[data-other="true"]:checked');
    }
    submit.textContent = "提交回答";
    error.textContent = submitError.message;
  }
}

function removeUserInputCard(requestId) {
  state.pendingCards.get("input:" + requestId)?.root.remove();
  state.pendingCards.delete("input:" + requestId);
}

function removeUserInputRequest(requestId) {
  state.userInputRequests.delete(String(requestId));
  removeUserInputCard(String(requestId));
  renderPendingRequests();
}

function syncUserInputRequests(threadId, requests) {
  const previous = new Map(state.userInputRequests);
  for (const [id, request] of state.userInputRequests) if (request.threadId === threadId) state.userInputRequests.delete(id);
  for (const request of requests || []) state.userInputRequests.set(String(request.requestId), { ...previous.get(String(request.requestId)), ...request });
  if (state.selectedThreadId === threadId) renderPendingRequests();
}

function renderApprovalRequest(request) {
  if (!request?.requestId || request.threadId !== state.selectedThreadId) return;

  ui.conversation.querySelector(".empty-state")?.remove();
  const card = document.createElement("section");
  card.className = "user-input-card approval-card";
  card.dataset.requestId = request.requestId;
  const heading = document.createElement("div");
  heading.className = "user-input-heading";
  const title = document.createElement("strong");
  title.textContent = approvalRequestTitle(request.method);
  const note = document.createElement("span");
  note.textContent = request.method === "codexlan/browser/requestApproval"
    ? "允许后可重试浏览器操作；重启服务后需要重新确认"
    : "确认后 Codex 会继续当前任务";
  heading.append(title, note);
  card.append(heading);
  if (request.reason) {
    const reason = document.createElement("p");
    reason.className = "approval-reason";
    reason.textContent = request.reason;
    card.append(reason);
  }
  const detail = approvalRequestDetail(request);
  if (detail) {
    const pre = document.createElement("pre");
    pre.className = "approval-detail";
    pre.textContent = detail;
    card.append(pre);
  }
  const footer = document.createElement("div");
  footer.className = "approval-actions";
  const error = document.createElement("p");
  error.className = "form-error";
  footer.append(error);
  if (approvalDecisionAvailable(request, "cancel")) footer.append(approvalButton("取消任务", "cancel", "danger-button"));
  else if (approvalDecisionAvailable(request, "decline")) footer.append(approvalButton("拒绝", "decline", "danger-button"));
  if (approvalDecisionAvailable(request, "accept")) footer.append(approvalButton("允许一次", "accept", "quiet-button"));
  if (approvalDecisionAvailable(request, "acceptForSession")) {
    footer.append(approvalButton("本次会话允许", "acceptForSession", "primary-button"));
  }
  card.append(footer);
  for (const button of footer.querySelectorAll("button")) {
    button.addEventListener("click", () => void submitApprovalRequest(request, button.dataset.decision, card, error));
  }
  return card;
}

function approvalButton(label, decision, className) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.dataset.decision = decision;
  button.textContent = label;
  return button;
}

function approvalRequestTitle(method) {
  if (method === "codexlan/browser/requestApproval") return "允许此会话使用本机浏览器？";
  if (method === "item/fileChange/requestApproval") return "需要批准文件修改";
  if (method === "item/permissions/requestApproval") return "需要授予额外权限";
  return "需要批准命令执行";
}

function approvalRequestDetail(request) {
  const lines = [];
  if (request.command) lines.push(Array.isArray(request.command) ? request.command.join(" ") : String(request.command));
  if (request.cwd) lines.push("目录：" + request.cwd);
  if (request.grantRoot) lines.push("授权目录：" + request.grantRoot);
  const permissions = request.additionalPermissions || request.permissions;
  if (permissions) lines.push("额外权限：" + JSON.stringify(permissions, null, 2));
  if (request.networkApprovalContext) lines.push("网络访问：" + JSON.stringify(request.networkApprovalContext, null, 2));
  return lines.join("\n");
}

function approvalDecisionAvailable(request, decision) {
  if (!Array.isArray(request.availableDecisions) || !request.availableDecisions.length) return decision !== "cancel";
  return request.availableDecisions.some((entry) => entry === decision || entry?.decision === decision);
}

async function submitApprovalRequest(request, decision, card, error) {
  const project = currentProject();
  if (!project || request.threadId !== state.selectedThreadId) return;
  error.textContent = "";
  for (const button of card.querySelectorAll("button")) button.disabled = true;
  try {
    await api("/api/threads/" + encodeURIComponent(request.threadId) + "/approval/" + encodeURIComponent(request.requestId), {
      method: "POST",
      body: { projectId: project.id, decision },
    });
    state.approvalRequests.delete(String(request.requestId));
    card.remove();
    scheduleTurnActivity(request.turnId, 0);
  } catch (submitError) {
    for (const button of card.querySelectorAll("button")) button.disabled = false;
    error.textContent = submitError.message;
  }
}

function removeApprovalCard(requestId) {
  state.pendingCards.get("approval:" + requestId)?.root.remove();
  state.pendingCards.delete("approval:" + requestId);
}

function removeApprovalRequest(requestId) {
  state.approvalRequests.delete(String(requestId));
  removeApprovalCard(String(requestId));
  renderPendingRequests();
}

function syncApprovalRequests(threadId, requests) {
  const previous = new Map(state.approvalRequests);
  for (const [id, request] of state.approvalRequests) if (request.threadId === threadId) state.approvalRequests.delete(id);
  for (const request of requests || []) {
    const old = previous.get(String(request.requestId));
    state.approvalRequests.set(String(request.requestId), old?.detailsAvailable !== false && request.detailsAvailable === false ? { ...request, ...old } : request);
  }
  if (state.selectedThreadId === threadId) renderPendingRequests();
}

function mergeTurnPages(existing, incoming) {
  return mergeConversationTurns(existing, incoming, { canonical: true });
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
    const turns = mergeConversationTurns(selected.turns || [], result.thread.turns || [], { canonical: true });
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
    const clientId = userMessageClientId(item);
    if (clientId) message.root.dataset.clientId = clientId;
    if (item.clientPending) message.root.dataset.clientPending = "true";
    else message.root.removeAttribute("data-client-pending");
    return message;
  }
  if (item.type === "agentMessage" || item.type === "plan") {
    if (item.delivery === "async") {
      removeRenderedMessage(item.id);
      return renderAsyncUserInput(item, turnId);
    }
    return item.type === "agentMessage" && item.phase === "commentary"
      ? addProgressMessage(item.id, item.text || "")
      : addMessage(item.id, "Codex", item.text || "", "assistant", messageTimestamp(item, turnId));
  }
  return null;
}

// Only ephemeral diagnostics use this slot. Transcript order belongs to the model.
function placeTurnContent(turnId, message) {
  const group = state.executionGroups.get(turnId);
  if (message?.root && group) {
    group.footer.diagnostics.append(message.root);
    group.footer.toggle.disabled = false;
    group.footer.toggle.hidden = false;
  }
}

function userMessageText(item) {
  return displayUserInputText((item.content || []).filter((part) => part.type === "text").map((part) => part.text).join("\n"));
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
    entry = { root, kind, title, status, body, item: {}, autoOpened: false, pendingBody: null };

    summary.addEventListener("click", (event) => {
      if (entry.item.type === "fileChange") {
        event.preventDefault();
        openFileChangePreview(entry.item);
      } else if (entry.item.type === "imageView" && entry.item.path) {
        event.preventDefault();
        openImagePreview(entry.item.path);
      }
    });
    root.addEventListener("toggle", () => {
      if (root.open) renderDeferredExecutionBody(entry);
    });
    group.items.set(item.id, entry);
  }
  const previousItem = entry.item;
  entry.item = { ...previousItem, ...item };
  entry.root.classList.toggle("image-preview-entry", entry.item.type === "imageView" && Boolean(entry.item.path));
  for (const key of ["startedAt", "completedAt", "durationMs"]) {
    if ((entry.item[key] === null || entry.item[key] === undefined) && previousItem[key] !== null && previousItem[key] !== undefined) {
      entry.item[key] = previousItem[key];
    }
  }
  const presentation = executionPresentation(entry.item);
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
    entry.pendingBody = presentation.body || "";
    entry.body.replaceChildren();
    entry.ansiStream = null;
  } else {
    entry.ansiStream = renderAnsiOutput(entry.body, presentation.body || "");
    entry.pendingBody = null;
    entry.body.classList.toggle("live-output-truncated", Boolean(entry.item.outputTruncated));
  }
  const isFileChange = entry.item.type === "fileChange";
  const hasBody = Boolean(presentation.body);
  entry.body.hidden = isFileChange || !hasBody;
  entry.root.classList.toggle("empty", !isFileChange && !hasBody);
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
  if (!state.renderingConversation) followNewContent();
}

function renderDeferredExecutionBody(entry) {
  if (entry.pendingBody === null) return;
  entry.ansiStream = renderAnsiOutput(entry.body, entry.pendingBody);
  entry.pendingBody = null;
  entry.body.classList.remove("live-output-truncated");
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
  const root = document.createElement("section");
  root.className = "execution-group";
  root.dataset.turnId = turnId;
  const list = document.createElement("div");
  list.className = "execution-list";
  group = { turnId, root, list, rendered: new Map(), items: new Map(), turnStatus, planValue: null, changes: [], recovered: [] };
  group.footer = createTurnFooter({
    id: turnId,
    onDiff: () => openFileChangePreview({ type: "fileChange", changes: group.changes }),
    onCopy: (button) => copyWithFeedback(button, processMarkdownForGroup(group)),
  });
  root.append(list, group.footer.root);
  ui.conversation.append(root);
  state.executionGroups.set(turnId, group);
  mergeExecutionTiming(group, timing);
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
  const runtime = currentRuntime();
  const running = (isActiveThreadRuntime(runtime) && runtime.activeTurnId === group.turnId) || isActiveThreadStatus(group.turnStatus);
  const failed = ["failed", "error"].includes(group.turnStatus);
  const stopped = ["interrupted", "cancelled"].includes(group.turnStatus);
  const diagnostic = running ? deriveRunDiagnostic({
    runtime, turnMetric: state.turnMetrics.get(group.turnId),
    activeItems: [...group.items.values()].map((entry) => entry.item),
    approvalRequests: [...state.approvalRequests.values()].filter((request) => request.threadId === state.selectedThreadId && request.turnId === group.turnId),
    userInputRequests: [...state.userInputRequests.values()].filter((request) => request.threadId === state.selectedThreadId && request.turnId === group.turnId),
  }) : null;
  const label = running ? diagnostic.label : failed ? "失败" : stopped ? "已停止" : "已完成";
  const tone = running ? "running" : failed ? "failed" : stopped ? "stopped" : "complete";
  for (const name of ["running", "failed", "stopped", "complete"]) group.root.classList.toggle(name, tone === name);
  const turn = currentThread()?.turns?.find((entry) => entry.id === group.turnId);
  const executionItems = [...group.items.values()].map((entry) => entry.item);
  // Decide action visibility from metadata, without serializing tool output
  // into Markdown on every streamed update. Copy still uses the full source.
  const copyable = Boolean(group.items.size || group.recovered.length || group.planValue?.plan?.length || group.planValue?.explanation?.trim()
    || turn?.items?.some((item) => item.type === "agentMessage" && item.phase === "commentary" && item.text?.trim()));
  updateTurnFooter(group.footer, {
    label, tone, running, plan: group.planValue, copyable,
    timing: running ? null : summarizeExecutionTiming(group, [...executionItems, ...group.recovered]),
    changes: group.changes, recovered: group.recovered,
  });
  setElapsedDisplay(group.footer.elapsed, "", group);
  group.footer.elapsed.title = "本轮总耗时";
}

function completeExecutionGroup(turnId, turnStatus, timing) {
  const group = state.executionGroups.get(turnId);
  if (!group) return;
  mergeExecutionTiming(group, timing);
  updateExecutionGroup(group, turnStatus || "completed");
  scheduleConversationRender(state.selectedThreadId);
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
  const message = addProgressMessage(turnActivityId(turnId), "正在生成");
  message.root.classList.add("running", "waiting");
  if (!message.action) {
    const action = document.createElement("button");
    action.type = "button";
    action.className = "progress-message-action quiet-button";
    action.textContent = "检查状态";
    action.hidden = true;
    action.addEventListener("click", () => void probeCurrentRuntime(turnId, action));
    message.root.append(action);
    message.action = action;
  }
  renderTurnActivityMessage(turnId, message);
  placeTurnContent(turnId, message);
}

function renderTurnActivityMessage(turnId, message) {
  const runtime = currentRuntime();
  if (!message || runtime.activeTurnId !== turnId) return;
  const diagnostic = deriveRunDiagnostic({
    runtime,
    turnMetric: state.turnMetrics.get(turnId),
    activeItems: [...(state.executionGroups.get(turnId)?.items.values() || [])].map((entry) => entry.item),
    approvalRequests: [...state.approvalRequests.values()].filter((request) => request.threadId === state.selectedThreadId && request.turnId === turnId),
    userInputRequests: [...state.userInputRequests.values()].filter((request) => request.threadId === state.selectedThreadId && request.turnId === turnId),
  });
  const silence = diagnostic.state === "unexplained";
  const prefix = silence ? "无可观察活动" : diagnostic.label;
  setElapsedDisplay(message.body, prefix, {
    startedAt: silence ? diagnostic.observedAt : runtime.startedAt,
    status: "running",
  });
  message.body.setAttribute("aria-label", diagnostic.label);
  if (message.action) {
    message.action.hidden = !silence;
    message.action.disabled = state.runtimeProbes.has(state.selectedThreadId);
    message.action.title = silence ? "读取一次 App Server 线程状态" : "当前无需核验";
  }
  message.root.classList.toggle("stale", silence);
  const group = state.executionGroups.get(turnId);
  if (group) {
    group.footer.headline.textContent = prefix;
    group.footer.headline.title = prefix;
  }
}

async function probeCurrentRuntime(turnId, button) {
  const thread = currentThread();
  const project = currentProject();
  if (!thread || !project || thread.id !== state.selectedThreadId || currentRuntime().activeTurnId !== turnId) return;
  const existing = state.runtimeProbes.get(thread.id);
  if (existing) return existing;
  button.disabled = true;
  const probe = (async () => {
    try {
      const result = await api(`/api/threads/${encodeURIComponent(thread.id)}/runtime?projectId=${encodeURIComponent(project.id)}`, { timeoutMs: 7_000 });
      updateThreadInState(project.id, { ...thread, runtime: result.runtime });
      renderThreads();
      renderRunStrip();
      if (!isActiveThreadRuntime(result.runtime)) {
        clearTurnActivity(turnId);
        await reconcileInterruptedThread(thread.id);
        showActivity("已核验：这个任务已经结束。", false);
      } else {
        showActivity("已核验：App Server 仍报告任务运行中。", false);
        renderTurnActivityMessage(turnId, state.messageElements.get(turnActivityId(turnId)));
      }
    } catch (error) {
      showActivity(`无法核验运行状态：${error.message}`, true);
    } finally {
      state.runtimeProbes.delete(thread.id);
      const activity = state.messageElements.get(turnActivityId(turnId));
      if (activity) renderTurnActivityMessage(turnId, activity);
    }
  })();
  state.runtimeProbes.set(thread.id, probe);
  return probe;
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
    plan: storedTurn?.task?.plan || state.turnMetrics.get(group.turnId)?.plan,
    items,
    recovered: group.recovered,
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
  return copyTextToClipboard(text);
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
    if (entry.kind !== kind) {
      entry.root.remove();
      state.messageElements.delete(id);
    } else {
      if (text !== undefined) renderMessageContent(entry, text);
      setMessageTimestamp(entry, timestamp);
      return entry;
    }
  }
  ui.conversation.querySelector(".empty-state")?.remove();
  const root = ui.messageTemplate.content.firstElementChild.cloneNode(true);
  root.classList.add(kind);
  const meta = root.querySelector(".message-meta");
  const body = root.querySelector(".message-body");
  const name = document.createElement("span");
  name.className = "message-role";
  name.textContent = label;
  const time = document.createElement("time");
  time.className = "message-time";
  time.hidden = true;
  meta.replaceChildren(name, time);
  const entry = { root, body, kind, time, files: null, rawText: "", actions: null, copyButton: null };
  if (kind === "assistant") {
    const actions = document.createElement("div");
    actions.className = "message-actions";
    const pdfButton = messageActionButton("PDF", "将回答转为 PDF");
    pdfButton.classList.add("mobile-message-action");
    pdfButton.addEventListener("click", () => {
      try {
        printAnswer(entry);
      } catch (error) {
        showError(error);
      }
    });
    const shareButton = messageActionButton("分享", "分享到其他应用");
    shareButton.classList.add("mobile-message-action");
    shareButton.addEventListener("click", () => shareAnswer(entry).catch(showError));
    const copyButton = document.createElement("button");
    copyButton.className = "copy-text-button icon-copy-button";
    copyButton.type = "button";
    copyButton.textContent = "复制原文";
    copyButton.title = "复制原文";
    copyButton.setAttribute("aria-label", "复制最终回答的 Markdown 原文");
    copyButton.addEventListener("click", () => copyWithFeedback(copyButton, entry.rawText));
    actions.append(pdfButton, shareButton, copyButton);
    meta.append(actions);
    entry.actions = actions;
    entry.copyButton = copyButton;
  }
  setMessageTimestamp(entry, timestamp);
  renderMessageContent(entry, text);
  state.messageElements.set(id, entry);
  return entry;
}

function messageActionButton(label, ariaLabel) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "message-action-button";
  button.textContent = label;
  button.setAttribute("aria-label", ariaLabel);
  button.title = ariaLabel;
  return button;
}

function answerDocumentTitle() {
  const name = threadDisplayName(currentThread());
  return name === "未命名聊天" ? "CodexLAN 回答" : name;
}

function printAnswer(entry) {
  const title = answerDocumentTitle();
  const html = printableMarkdownHtml(title, entry.body.innerHTML);
  if (typeof window.CodexAndroid?.printMarkdown === "function") {
    window.CodexAndroid.printMarkdown(title, html);
    showActivity("已打开 PDF 保存界面。", false);
    return;
  }
  const printable = window.open("", "_blank");
  if (!printable) throw new Error("浏览器阻止了 PDF 窗口，请允许弹出窗口后重试。");
  printable.opener = null;
  printable.document.open();
  printable.document.write(html);
  printable.document.close();
  window.setTimeout(() => {
    printable.focus();
    printable.print();
  }, 50);
}

async function shareAnswer(entry) {
  const title = answerDocumentTitle();
  const route = await shareMarkdown({ title, text: entry.rawText, documentHtml: printableMarkdownHtml(title, entry.body.innerHTML) });
  if (route) {
    showActivity(route === "android-choice" ? "请选择分享格式。" : route === "android-pdf" ? "正在生成 PDF…" : "已打开系统分享面板。", false);
    return;
  }
  await navigator.clipboard.writeText(entry.rawText);
  showActivity("当前浏览器不支持系统分享，回答已复制。", false);
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
  if (existing?.kind === "progress") {
    existing.text = String(text || "");
    existing.body.textContent = existing.text;
    return existing;
  }
  if (existing) {
    existing.root.remove();
    state.messageElements.delete(id);
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
  state.messageElements.set(id, entry);
  followNewContent();
  return entry;
}

function removeRenderedMessage(id) {
  const entry = state.messageElements.get(id);
  entry?.root.remove();
  state.messageElements.delete(id);
}

function renderLiveUserMessage() {
  renderConversation(currentThread()?.turns || []);
}

function acceptGuideMessage(threadId, turnId, item) {
  const projectId = findProjectForThread(threadId);
  if (!projectId || !turnId || !item?.id) return;
  const stored = rememberThreadItem(projectId, threadId, turnId, {
    ...item,
    inputKind: "guide",
    createdAt: timestampMilliseconds(item.createdAt) || Date.now(),
  });
  if (stored && state.selectedThreadId === threadId) renderLiveUserMessage(stored, turnId, true);
}

function renderMessageContent(entry, value) {
  const text = String(value || "");
  if (entry.contentRendered && entry.rawText === text) return;
  entry.contentRendered = true;
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
  entry.visualizations?.remove();
  entry.visualizations = null;
  if (presentation.visualizations.length && currentProject()) {
    const list = document.createElement("div");
    list.className = "message-visualizations";
    list.setAttribute("aria-label", "交互图表");
    for (const visualization of presentation.visualizations) list.append(visualizationCard(visualization));
    entry.root.append(list);
    entry.visualizations = list;
  }
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

function visualizationCard(visualization) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "visualization-card";
  button.setAttribute("aria-label", `打开交互图表：${visualization.title}`);
  const mark = document.createElement("span");
  mark.className = "visualization-mark";
  mark.setAttribute("aria-hidden", "true");
  mark.innerHTML = '<svg viewBox="0 0 32 32"><path d="M5 24V14m7 10V8m7 16V12m7 12V5"/><path d="m5 10 7-4 7 3 7-6"/></svg>';
  const copy = document.createElement("span");
  copy.className = "visualization-card-copy";
  const title = document.createElement("strong");
  title.textContent = visualization.title;
  const meta = document.createElement("small");
  meta.textContent = "可缩放、可悬停查看数据";
  copy.append(title, meta);
  const action = document.createElement("span");
  action.className = "visualization-card-action";
  action.textContent = "打开 ↗";
  button.append(mark, copy, action);
  button.addEventListener("click", () => openVisualization(visualization).catch(showError));
  return button;
}

let visualizationRequest = 0;

async function openVisualization(visualization) {
  const request = ++visualizationRequest;
  const url = new URL(visualizationUrl(visualization.path), location.href).href;
  ui.visualizationName.textContent = visualization.title;
  ui.visualizationUrl.href = url;
  ui.visualizationUrl.textContent = url;
  ui.visualizationUrl.title = url;
  ui.visualizationStatus.textContent = "正在载入图表…";
  ui.visualizationStatus.className = "visualization-status";
  ui.visualizationStatus.hidden = false;
  ui.visualizationFrame.hidden = true;
  ui.visualizationFrame.removeAttribute("src");
  ui.visualizationDialog.classList.toggle("wide", visualization.mode === "wide");
  if (!ui.visualizationDialog.open) ui.visualizationDialog.showModal();
  ui.visualizationFrame.onload = () => {
    if (request !== visualizationRequest || !ui.visualizationDialog.open) return;
    ui.visualizationFrame.hidden = false;
    ui.visualizationStatus.hidden = true;
  };
  ui.visualizationFrame.src = url;
}

function visualizationUrl(path) {
  return `/api/threads/${encodeURIComponent(state.selectedThreadId)}/visualization?projectId=${encodeURIComponent(state.selectedProjectId)}&path=${encodeURIComponent(path)}`;
}

function downloadCard(file) {
  const url = localFileUrl(file.path, file.name);
  const previewKind = textPreviewKind(file.name);
  if (isPreviewableImage(file.name)) return imageFileCard(file, url);
  if (previewKind) return previewFileCard(file, url, previewKind);
  const link = document.createElement("a");
  link.className = "file-download";
  link.href = url;
  link.setAttribute("aria-label", `下载 ${file.name}`);
  link.append(fileCardContent(file, "下载 ↓"));
  bindDownloadLink(link, file.name);
  return link;
}

function imageFileCard(file, url) {
  const card = document.createElement("div");
  card.className = "markdown-file-card";
  const preview = document.createElement("button");
  preview.type = "button";
  preview.className = "file-download file-preview-trigger";
  preview.setAttribute("aria-label", `预览 ${file.name}`);
  preview.append(fileCardContent(file, "预览"));
  preview.addEventListener("click", () => openImagePreview(file.path, file.name, url));
  const download = document.createElement("a");
  download.className = "file-download-direct";
  download.href = url;
  download.setAttribute("aria-label", `下载 ${file.name}`);
  download.title = "下载原文件";
  download.textContent = "↓";
  bindDownloadLink(download, file.name);
  card.append(preview, download);
  return card;
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
  bindDownloadLink(download, file.name);
  card.append(preview, download);
  return card;
}

function bindDownloadLink(link, fileName, feedback) {
  let pending = false;
  const report = (message, error = false) => {
    if (feedback) {
      feedback.textContent = message;
      feedback.classList.toggle("error", error);
      feedback.hidden = false;
    }
    showActivity(message, error);
  };
  link.addEventListener("click", async (event) => {
    event.preventDefault();
    if (pending) return;
    pending = true;
    const url = new URL(link.href, location.href).href;
    const name = fileName || new URL(url).searchParams.get("name") || "文件";
    link.setAttribute("aria-busy", "true");
    report(`正在准备下载 ${name}…`);
    try {
      await downloadLocalFile(url);
      report(`已发起下载 ${name}，请查看系统下载通知。`);
    } catch (error) {
      report(error.message, true);
    } finally {
      pending = false;
      link.removeAttribute("aria-busy");
    }
  });
}

function openImagePreview(path, name = "", url = "") {
  const fileName = name || String(path || "").split(/[\\/]/).filter(Boolean).pop() || "图片";
  const source = url || localFileUrl(path, fileName);
  ui.imagePreviewName.textContent = fileName;
  $("#image-download-status").hidden = true;
  ui.imagePreviewPath.textContent = path;
  ui.imagePreviewImage.src = source;
  ui.imagePreviewImage.alt = fileName;
  ui.imagePreviewDownload.href = source;
  if (!ui.imagePreviewDialog.open) ui.imagePreviewDialog.showModal();
}

function openMermaidPreview(svg) {
  if (!svg || !ui.mermaidPreviewStage) return;
  ui.mermaidPreviewName.textContent = "图表预览";
  ui.mermaidPreviewStage.innerHTML = svg;
  if (!ui.mermaidPreviewDialog.open) ui.mermaidPreviewDialog.showModal();
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

function localFileUrl(path, name) {
  return localFileDownloadUrl({ projects: state.projects, projectId: currentProject()?.id, role: state.user?.role, path, name });
}

let markdownPreviewRequest = 0;
let markdownPreviewValue = null;

function setMarkdownPreviewValue(title, text, bodyHtml = "") {
  const documentTitle = String(title || "文件预览");
  markdownPreviewValue = text ? {
    title: documentTitle,
    text: String(text),
    documentHtml: printableMarkdownHtml(documentTitle, bodyHtml),
  } : null;
  ui.copyMarkdownPreview.disabled = !markdownPreviewValue;
  ui.shareMarkdownPreview.disabled = !markdownPreviewValue;
}

async function openTextPreview(file, url, previewKind) {
  const request = ++markdownPreviewRequest;
  setMarkdownPreviewValue("", "");
  ui.filePreviewKicker.textContent = previewKind === "markdown" ? "Markdown 预览" : previewKind === "json" ? "JSON 预览" : previewKind === "code" ? "代码预览" : "文本预览";
  ui.markdownPreviewName.textContent = file.name;
  $("#markdown-download-status").hidden = true;
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
    setMarkdownPreviewValue(file.name, contents, ui.markdownPreviewBody.innerHTML);
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
  const title = count ? `${count} 个文件的修改` : "文件修改";
  ui.filePreviewKicker.textContent = "Diff 预览";
  ui.markdownPreviewName.textContent = title;
  ui.markdownPreviewPath.textContent = changes.map((change) => change.path).filter(Boolean).join(" · ") || "完整 diff";
  ui.markdownPreviewDownload.hidden = true;
  $("#markdown-download-status").hidden = true;
  ui.markdownPreviewStatus.hidden = true;
  ui.markdownPreviewBody.hidden = false;
  ui.markdownPreviewBody.className = "diff-document";
  renderFileChanges(ui.markdownPreviewBody, changes);
  setMarkdownPreviewValue(title, fileChangesText(changes), ui.markdownPreviewBody.innerHTML);
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
    row.querySelector(".queue-text").textContent = displayUserInputText(item.text);
    const guideButton = row.querySelector('[data-action="guide"]');
    const guiding = state.queueGuiding.has(item.id);
    row.classList.toggle("guiding", guiding);
    if (guiding) row.setAttribute("aria-busy", "true");
    if (guiding) queueIndex.replaceChildren(iconElement("guide"));
    if (guiding) row.querySelector(".queue-text").dataset.status = "正在转入信息流";
    guideButton.disabled = !(runtime.activeTurnId && isActiveThreadStatus(runtime.status)) || guiding;
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
  const activeTurnReady = Boolean(runtime.activeTurnId && isActiveThreadStatus(runtime.status));
  const hasInput = Boolean(ui.prompt.value.trim() || state.composerAttachments.length);
  const projectAvailable = currentProject()?.available !== false;
  const showStop = activeTurnReady && !hasInput && !state.materializingThread;
  const guideAvailable = hasThread && activeTurnReady;
  if (state.mode === "guide" && !activeTurnReady) state.mode = "queue";
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
  const selected = findThread(project.id, state.threadSelectionTargetId) || currentThread();
  cancelThreadSelection();
  if (isLocalThreadId(selected?.id) && selected.runtime?.projectId === project.id && currentThreadIsEmpty()) {
    closeSidebar();
    if (focusPrompt) ui.prompt.focus();
    return selected;
  }
  const existingDraft = (state.threads.get(project.id) || []).find((thread) => isLocalThreadId(thread.id));
  const effectiveModel = selected && selectedModelForThread(selected);
  const inheritedThread = selected && {
    ...selected,
    // selected was looked up in this project's thread list; runtime updates
    // must not decide whether its saved settings belong to the project.
    runtime: { ...selected.runtime, projectId: project.id },
    settings: {
      ...selected.settings,
      model: selected.settings?.model || effectiveModel?.id,
      effort: selected.settings?.effort || effectiveModel?.defaultReasoningEffort || effectiveModel?.supportedReasoningEfforts?.[0]?.reasoningEffort,
    },
  };
  const settings = newThreadSettings({
    projectSettings: project.settings,
    currentThread: inheritedThread,
    projectId: project.id,
    models: state.models,
    defaultModel: localStorage.getItem(userStorageKey("default-model")) || "",
  });
  const thread = existingDraft ? { ...existingDraft, settings } : {
    id: nextLocalThreadId(),
    name: null,
    preview: "",
    turns: [],
    settings,
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

async function materializeThread(project, draft) {
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
      },
    });
    const created = {
      ...result.thread,
      turns: result.thread.turns || [],
      history: result.history || { hasMore: false, before: null, totalTurns: 0 },
      runtime: result.runtime || result.thread.runtime || { projectId: project.id, activeTurnId: null, status: "idle" },
    };
    // SSE can discover and update this identity before the HTTP response.
    // Retire the local alias, then upsert into that same entity; never leave
    // a second copy for list renderers to read instead of the live one.
    const observed = findThread(project.id, created.id);
    const thread = updateThreadInState(project.id, {
      ...created, ...observed,
      turns: mergeConversationTurns(created.turns, observed?.turns || []),
    });
    state.threads.set(project.id, state.threads.get(project.id).filter((entry) => entry.id !== draft.id));
    includeThreadInPages(project.id, thread.id);
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
  const sourcePrompt = ui.prompt.value;
  const attachments = [...state.composerAttachments];
  ui.prompt.value = "";
  resizePrompt();
  state.submittingMessage = true;
  updateComposer();
  scrollToLatest(false);
  let submittedThreadId = null;
  let submissionAccepted = false;
  try {
    let project = currentProject();
    let thread = currentThread() || await createThread();
    if (!project || !thread) return;
    const runtime = thread.runtime || {};
    const activeTurnId = isActiveThreadStatus(runtime.status) ? runtime.activeTurnId || null : null;
    const selectedMode = ui.guide.getAttribute("aria-checked") === "true" ? "guide" : "queue";
    const mode = selectedMode === "guide" && activeTurnId ? "guide" : "queue";
    let prompt = sourcePrompt;
    const goalCommand = goalShortcut(sourcePrompt);
    if (goalCommand) {
      if (attachments.length) throw new Error("目标不能包含附件；请在目标文字中引用项目里的文件路径。");
      await executeGoalCommand(goalCommand, project, thread);
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
        showActivity(targetMode === "plan" ? "已进入规划模式。" : "已退出规划模式。", false);
        return;
      }
    }
    if (isLocalThreadId(thread.id)) {
      thread = await materializeThread(project, thread);
    }
    submittedThreadId = thread.id;
    state.submittingThreadIds.add(thread.id);
    ensureEventStream();
    await uploadComposerAttachments(project, thread, attachments);
    const text = messageWithAttachments(prompt, attachments.map((attachment) => attachment.uploaded).filter(Boolean));
    const latestRuntime = currentThread()?.runtime || {};
    const latestTurnId = isActiveThreadStatus(latestRuntime.status) ? latestRuntime.activeTurnId || null : null;
    if (mode === "guide" && latestTurnId === activeTurnId && latestTurnId) {
      const result = await api(`/api/threads/${encodeURIComponent(thread.id)}/steer`, { method: "POST", body: { projectId: project.id, expectedTurnId: activeTurnId, text } });
      submissionAccepted = true;
      acceptGuideMessage(thread.id, result.turnId, result.item);
      showActivity("引导已送达；正在运行的命令结束后会处理。", false);
    } else {
      const result = await api(`/api/threads/${encodeURIComponent(thread.id)}/queue`, { method: "POST", body: { projectId: project.id, text } });
      submissionAccepted = true;
      state.turnDiagnostics.set(thread.id, { submittedAt: Date.now(), textLength: text.length });
      applyQueueSnapshot(thread.id, result.queue, result.queueRevision);
      renderQueue();
      renderThreads();
      renderRunStrip();
      showActivity(state.eventStream?.readyState === EventSource.OPEN ? "已发送 · 等待 Codex 开始执行…" : "已发送 · 实时更新正在重连…", false);
    }
    if (state.eventStream?.readyState !== EventSource.OPEN) {
      scheduleDisconnectedRefresh();
      // HTTP acknowledgement is authoritative. Recover anything produced
      // before the stream reconnects without submitting the prompt again.
      void reconcileInterruptedThread(thread.id).catch((error) => showActivity(`任务已发送，读取执行状态失败：${error.message}`, true));
    }
    const sentAttachments = new Set(attachments);
    state.composerAttachments = state.composerAttachments.filter((attachment) => !sentAttachments.has(attachment));
    for (const attachment of attachments) if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    renderComposerAttachments();
    resizePrompt();
  } catch (error) {
    // Preserve the unsent prompt without overwriting text typed meanwhile.
    if (!submissionAccepted) {
      ui.prompt.value = ui.prompt.value ? `${sourcePrompt}\n${ui.prompt.value}` : sourcePrompt;
      resizePrompt();
      showError(error);
    } else showActivity(`任务已发送，更新界面失败：${error.message}`, true);
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
  state.mode = "queue";
  updateComposer();
  try {
    const activeTurnId = thread.runtime?.activeTurnId;
    if (!activeTurnId) {
      showActivity("当前任务已经结束。", false);
      return;
    }
    const result = await api(`/api/threads/${encodeURIComponent(thread.id)}/interrupt`, {
      method: "POST",
      body: { projectId: project.id, turnId: activeTurnId },
      timeoutMs: 10000,
    });
    showActivity(result.goalPauseRequested ? "停止命令已送达，正在停止任务并暂停目标…" : "停止命令已送达，正在等待任务退出…", false);
    const stopped = await waitForTurnToStop(project.id, thread.id, activeTurnId);
    showActivity(stopped ? "当前任务已停止。" : "停止命令已送达，但任务仍显示运行；请再次停止。", !stopped);
  } catch (error) {
    showError(error);
  } finally {
    state.stoppingTurn = false;
    if (state.selectedThreadId === thread.id) updateComposer();
  }
}

async function waitForTurnToStop(projectId, threadId, turnId) {
  for (const delay of [0, 300, 700, 1200, 2000, 3000]) {
    if (delay) await new Promise((resolveWait) => setTimeout(resolveWait, delay));
    try {
      await refreshProjectThreads(projectId);
    } catch {}
    const runtime = findThread(projectId, threadId)?.runtime;
    if (!isActiveThreadRuntime(runtime) || runtime.activeTurnId !== turnId) return true;
  }
  return false;
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

async function forkCurrentThread() {
  const project = currentProject();
  const thread = currentThread();
  if (!project || !thread || isLocalThreadId(thread.id) || isActiveThreadRuntime(currentRuntime()) || state.forkingThreads.has(thread.id)) return;
  closeThreadMenu();
  state.forkingThreads.add(thread.id);
  renderThreadActions();
  showActivity("正在创建聊天分支…", false);
  try {
    const result = await api(`/api/threads/${encodeURIComponent(thread.id)}/fork`, {
      method: "POST",
      body: { projectId: project.id },
      timeoutMs: 60_000,
    });
    const forked = updateThreadInState(project.id, {
      ...result.thread,
      turns: [],
      settings: result.thread.settings || thread.settings,
      runtime: result.runtime || result.thread.runtime,
    });
    applyQueueSnapshot(forked.id, result.queue || [], result.queueRevision ?? 0);
    renderThreads();
    await selectThread(forked.id, { closeNavigation: false });
    showActivity("已创建并打开聊天分支。", false);
  } catch (error) {
    showError(error);
  } finally {
    state.forkingThreads.delete(thread.id);
    renderThreadActions();
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

async function suggestThreadName() {
  const project = currentProject();
  const thread = currentThread();
  if (!thread || !project) return;
  if (isLocalThreadId(thread.id)) {
    ui.threadFormError.textContent = "先发送一条消息，才能自动生成聊天名称。";
    return;
  }
  const save = ui.threadForm.querySelector('button[value="default"]');
  ui.suggestThreadName.disabled = true;
  save.disabled = true;
  ui.threadFormError.textContent = "正在生成聊天名称…";
  try {
    const result = await api(`/api/threads/${encodeURIComponent(thread.id)}/name/suggest`, {
      method: "POST",
      body: { projectId: project.id },
    });
    ui.threadNameInput.value = result.name;
    ui.threadFormError.textContent = "名称已生成，确认后保存。";
    ui.threadNameInput.focus();
    ui.threadNameInput.select();
  } catch (error) {
    ui.threadFormError.textContent = error.message;
  } finally {
    ui.suggestThreadName.disabled = false;
    save.disabled = false;
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
  const runtime = currentRuntime();
  const activeTurnId = isActiveThreadStatus(runtime.status) ? runtime.activeTurnId : null;
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
    showActivity("引导已送达；正在运行的命令结束后会处理。", false);
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

function markEventStreamActivity(stream) {
  if (state.eventStream === stream) state.eventStreamLastActivityAt = Date.now();
}

function scheduleDisconnectedRefresh() {
  if (state.eventStreamRecoveryTimer || state.eventStreamRecoveryRunning || !state.user || document.hidden) return;
  state.eventStreamRecoveryTimer = setTimeout(async () => {
    state.eventStreamRecoveryTimer = null;
    if (!state.user || document.hidden || state.eventStream?.readyState === EventSource.OPEN) return;
    state.eventStreamRecoveryRunning = true;
    try {
      const threadId = state.selectedThreadId;
      if (threadId && !isLocalThreadId(threadId) && !state.threadSelectionController && !state.threadSelectionTargetId) {
        await reconcileInterruptedThread(threadId);
      }
    } catch {
      // Keep retrying reads while disconnected; never replay a submitted task.
    } finally {
      state.eventStreamRecoveryRunning = false;
      if (state.eventStream?.readyState !== EventSource.OPEN) scheduleDisconnectedRefresh();
    }
  }, 2000);
}

function stopEventStream({ interrupted = false } = {}) {
  const stream = state.eventStream;
  if (interrupted) {
    if (!state.eventStreamInterrupted) invalidateCachedThreadHistories();
    state.eventStreamInterrupted = true;
  }
  state.eventStream = null;
  state.eventStreamLastActivityAt = 0;
  stream?.close();
}

function scheduleEventStreamWatchdog() {
  clearTimeout(state.eventStreamWatchdogTimer);
  state.eventStreamWatchdogTimer = null;
  if (!state.user) return;
  state.eventStreamWatchdogTimer = setTimeout(() => {
    state.eventStreamWatchdogTimer = null;
    if (!document.hidden && eventStreamNeedsRestart({
      readyState: state.eventStream?.readyState,
      openState: EventSource.OPEN,
      closedState: EventSource.CLOSED,
      lastActivityAt: state.eventStreamLastActivityAt,
    })) {
      restartEventStream();
    }
    scheduleEventStreamWatchdog();
  }, EVENT_STREAM_WATCHDOG_INTERVAL_MS);
}

function restartEventStream() {
  if (!state.user || document.hidden) return null;
  stopEventStream({ interrupted: true });
  return openEventStream();
}

async function reconcileEventStreamInterruption() {
  if (!state.eventStreamInterrupted) return;
  const threadId = state.selectedThreadId;
  state.eventStreamInterrupted = false;
  if (!threadId || isLocalThreadId(threadId)) return;
  try {
    await reconcileInterruptedThread(threadId);
  } catch (error) {
    state.eventStreamInterrupted = true;
    throw error;
  }
}

function openEventStream() {
  const existing = state.eventStream;
  const scoped = state.workspaceSyncVersion >= 2;
  const threadId = scoped && state.selectedThreadId && !isLocalThreadId(state.selectedThreadId) ? state.selectedThreadId : null;
  const thread = threadId ? currentThread() : null;
  const snapshotId = thread?.historySnapshotId || 0;
  if (existing && existing.readyState !== EventSource.CLOSED && existing.codexlanThreadId === threadId && existing.codexlanScoped === scoped && existing.codexlanSnapshotId === snapshotId) return existing;
  existing?.close();
  clearTimeout(state.eventStreamReconnectTimer);
  state.eventStream = null;
  const query = new URLSearchParams({ scope: "workspace" });
  if (threadId) query.set("threadId", threadId);
  if (threadId) query.set("afterRevision", String(Math.max(thread?.historyRevision || 0, state.eventDetailRevisions.get(threadId) || 0)));
  const stream = new EventSource(scoped ? `/api/events?${query}` : "/api/events");
  stream.codexlanThreadId = threadId;
  stream.codexlanScoped = scoped;
  stream.codexlanSnapshotId = snapshotId;
  state.eventStream = stream;
  markEventStreamActivity(stream);
  stream.addEventListener("open", () => {
    if (state.eventStream !== stream) return;
    markEventStreamActivity(stream);
    clearTimeout(state.eventStreamRecoveryTimer);
    state.eventStreamRecoveryTimer = null;
    profileMark("eventStream", { event: "open" });
    if (state.eventStreamInterrupted) void loadAccountRateLimits();
    reconcileEventStreamInterruption().catch(showError);
  });
  stream.addEventListener("error", () => {
    if (state.eventStream !== stream) return;
    profileMark("eventStream", { event: "error", readyState: stream.readyState });
    if (!state.eventStreamInterrupted) invalidateCachedThreadHistories();
    state.eventStreamInterrupted = true;
    stream.close();
    state.eventStream = null;
    scheduleDisconnectedRefresh();
    state.eventStreamReconnectTimer = setTimeout(() => {
      if (state.user && !document.hidden) ensureEventStream();
    }, 2000);
  });
  stream.addEventListener("heartbeat", () => markEventStreamActivity(stream));
  stream.addEventListener("server", (event) => {
    if (state.eventStream !== stream) return;
    markEventStreamActivity(stream);
    const data = safeJson(event.data);
    if (data?.epoch && data.epoch !== state.eventEpoch) {
      if (state.eventEpoch) invalidateCachedThreadHistories({ resetVersions: true });
      state.eventEpoch = data.epoch;
      state.eventRevisions.clear();
      state.eventDetailRevisions.clear();
    }
    if (data?.rateLimits) {
      applyAccountRateLimitsSnapshot(data.rateLimits);
      return;
    }
    if (data?.rateLimitsChanged) {
      scheduleAccountRateLimitsRefresh();
      return;
    }
    profileMark("serverEvent", { status: data?.status });
    const wasReady = state.codexReady;
    applyCodexStatus(data);
    if (data?.status === "ready" && !wasReady) scheduleResume(0);
  });
  stream.addEventListener("codex", (event) => {
    if (state.eventStream !== stream) return;
    markEventStreamActivity(stream);
    const data = safeJson(event.data);
    const threadId = data?.params?.threadId;
    if (threadId && stream.codexlanThreadId === threadId && Number.isInteger(data.revision)) state.eventDetailRevisions.set(threadId, data.revision);
    profileMark("codexEventReceived", { method: data?.method, threadId });
    if (threadId) handleCodexEvent(threadId, data);
  });
  scheduleEventStreamWatchdog();
  return stream;
}

function invalidateCachedThreadHistories({ resetVersions = false } = {}) {
  for (const [projectId, threads] of state.threads) {
    state.threads.set(projectId, threads.map((thread) => (
      isLocalThreadId(thread.id) ? thread : invalidateThreadHistory(resetVersions ? { ...thread, turns: resetConversationVersions(thread.turns) } : thread)
    )));
  }
}

function ensureEventStream() {
  if (state.user) openEventStream();
}

function handleCodexEvent(threadId, event) {
  const finishProfile = profileSpan("handleCodexEvent", { method: event?.method, threadId });
  try {
    return handleCodexEventImpl(threadId, event);
  } finally {
    finishProfile({ selected: state.selectedThreadId === threadId });
  }
}

function handleCodexEventImpl(threadId, event) {
  if (!event) return;
  const params = event.params || {};
  const projectId = params.projectId || params.runtime?.projectId || findProjectForThread(threadId);
  if (!projectId || !state.projects.some((project) => project.id === projectId)) return;
  const previousRevision = state.eventRevisions.get(threadId) || 0;
  if (Number.isInteger(event.revision)) {
    if (event.revision < previousRevision || (event.revision === previousRevision && state.eventRevisions.has(threadId)
      && !["workspace/state", "workspace/summary"].includes(event.method))) return;
    state.eventRevisions.set(threadId, event.revision);
  }
  if (event.method === "thread/deleted") {
    state.threads.set(projectId, (state.threads.get(projectId) || []).filter((thread) => thread.id !== threadId));
    forgetClientThread(threadId);
    if (state.selectedThreadId === threadId) clearThread();
    renderThreads();
    renderRunStrip();
    return;
  }
  let thread = findThread(projectId, threadId);
  if (!thread) {
    thread = updateThreadInState(projectId, { id: threadId, name: params.name || null });
    includeThreadInPages(projectId, threadId);
  }
  if (event.method === "workspace/thread") {
    updateThreadInState(projectId, { ...thread, name: params.name || thread.name, runtime: params.runtime });
    renderThreads();
    renderRunStrip();
    return;
  }
  const previousRuntime = thread.runtime;
  // All transcript changes pass through the same model, whether delivered as
  // a versioned server projection or adapted from an older service event.
  const beforeTurns = thread.turns || [];
  if (params.conversation && conversationNeedsSnapshot(beforeTurns, params.conversation)
    && state.selectedThreadId === threadId && !state.recoveringConversation) {
    state.recoveringConversation = true;
    void reconcileInterruptedThread(threadId).catch(showError).finally(() => { state.recoveringConversation = false; });
  }
  const turns = params.conversation
    ? mergeConversationTurns(beforeTurns, params.conversation.turns || [])
    : reduceConversationEvent(beforeTurns, event, event.revision || 0);
  if (turns !== beforeTurns) {
    thread = updateThreadInState(projectId, { ...thread, turns, historyLive: true });
    if (state.selectedThreadId === threadId) scheduleConversationRender(threadId);
  }
  if (event.method === "workspace/summary") {
    thread = updateThreadInState(projectId, {
      ...thread, ...(params.name ? { name: params.name } : {}), runtime: params.runtime,
      ...(Object.hasOwn(params, "goal") ? { goal: params.goal && thread.goal ? { ...thread.goal, ...params.goal } : params.goal } : {}),
      queueCount: params.queueCount, queueRevision: params.queueRevision, historyLive: false, syncedUpdatedAt: null,
    });
    syncUserInputRequests(threadId, params.userInputRequests);
    syncApprovalRequests(threadId, params.approvalRequests);
    renderThreads();
    renderRunStrip();
    return;
  }
  if (params.summaryOnly) thread = updateThreadInState(projectId, { ...thread, historyLive: false, syncedUpdatedAt: null });
  if (params.runtime) {
    thread = updateThreadInState(projectId, { ...thread, runtime: params.runtime });
    for (const view of state.asyncInputCards.values()) {
      if (view.request.threadId === threadId) updateAsyncQuestionNote(view);
    }
  }
  if (event.method === "thread/replaced") {
    applyThreadReplacement(projectId, threadId, params);
    return;
  }
  if (event.method === "thread/goal/updated") {
    applyThreadGoal(threadId, params.goal);
    return;
  }
  if (event.method === "thread/goal/cleared") {
    applyThreadGoal(threadId, null);
    return;
  }
  if (!params.summaryOnly && ((event.method === "workspace/state" && (isActiveThreadRuntime(params.runtime) || params.activeItems?.length))
    || event.method === "turn/started"
    || event.method === "turn/completed"
    || event.method === "turn/plan/updated"
    || event.method.startsWith("item/"))) {
    thread = updateThreadInState(projectId, { id: threadId, historyLive: true });
  }
  if (event.method === "item/tool/requestUserInput") {
    const request = { ...params, requestId: String(params.requestId) };
    state.userInputRequests.set(request.requestId, request);
    if (state.selectedThreadId === threadId) renderPendingRequests();
    if (request.isBlocking !== false) clearTurnActivity(params.turnId);
    return;
  }
  if (event.method === "workspace/asyncUserInput/resolved") {
    markAsyncQuestionAnswered(threadId, params.itemId);
    return;
  }
  if ([
    "item/commandExecution/requestApproval",
    "item/fileChange/requestApproval",
    "item/permissions/requestApproval",
    "codexlan/browser/requestApproval",
  ].includes(event.method)) {
    const request = { ...params, method: event.method, requestId: String(params.requestId) };
    state.approvalRequests.set(request.requestId, request);
    if (state.selectedThreadId === threadId) renderPendingRequests();
    clearTurnActivity(params.turnId);
    return;
  }
  if (event.method === "serverRequest/resolved") {
    removeUserInputRequest(params.requestId);
    removeApprovalRequest(params.requestId);
    if (state.selectedThreadId === threadId && currentRuntime().activeTurnId === params.turnId) scheduleTurnActivity(params.turnId);
    return;
  }
  if (event.method === "mcpServerStatusUpdated") {
    renderThreads();
    renderRunStrip();
    if (state.selectedThreadId === threadId && params.status === "failed") {
      showActivity(`${params.name || "MCP"} 启动失败：${params.error || "请检查配置。"}`, true);
    }
    return;
  }
  if (event.method === "thread/tokenUsage/updated") {
    rememberThreadTokenUsage(threadId, params.tokenUsage);
    return;
  }
  if (event.method === "workspace/state") {
    const runtime = Object.hasOwn(params, "runtime") ? params.runtime : thread.runtime;
    updateThreadInState(projectId, {
      ...thread,
      runtime,
      ...(Object.hasOwn(params, "goal") ? { goal: params.goal || null } : {}),
    });
    const changed = applyQueueSnapshot(threadId, params.queue, params.queueRevision);
    for (const itemId of params.answeredAsyncUserInputIds || []) markAsyncQuestionAnswered(threadId, itemId);
    syncUserInputRequests(threadId, params.userInputRequests);
    syncApprovalRequests(threadId, params.approvalRequests);
    if (state.selectedThreadId === threadId) {
      if (changed) renderQueue();

      renderGoalButton();
      updateComposer();
      renderThreadActions();
      renderConversation(currentThread()?.turns || []);
      if (previousRuntime?.activeTurnId && previousRuntime.activeTurnId !== runtime?.activeTurnId) {
        void selectThread(threadId, { closeNavigation: false, preserveFollowLatest: true, mergeHistory: true }).catch(showError);
      }
    }
    renderThreads();
    renderRunStrip();
    return;
  }
  if (event.method === "turn/started") {
    const startedAt = timestampMilliseconds(params.turn?.startedAt);
    mergeTurnMetric(params.turn?.id, { startedAt });
    const runtime = params.runtime;
    const diagnostic = state.turnDiagnostics.get(params.turn?.id) || state.turnDiagnostics.get(threadId);
    if (diagnostic && !diagnostic.turnStartedAt) {
      state.turnDiagnostics.delete(threadId);
      state.turnDiagnostics.set(params.turn?.id, diagnostic);
      diagnostic.turnStartedAt = Date.now();
      showActivity(`已开始执行 · 等待首字（排队 ${Math.max(0, diagnostic.turnStartedAt - diagnostic.submittedAt)} ms）`, false);
    }

    updateThreadInState(projectId, { ...thread, runtime });
    if (state.selectedThreadId === threadId) {

      updateComposer();
      renderQueue();
    }
    renderThreads();
    renderRunStrip();
    if (state.selectedThreadId === threadId) scheduleTurnActivity(params.turn?.id, 0);
    return;
  }
  if (event.method === "thread/name/updated") {
    const rawName = typeof params.threadName === "string" ? params.threadName : params.name;
    const name = typeof rawName === "string" ? rawName.trim() : "";
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
    state.turnDiagnostics.delete(params.turn?.id);
    const completedAt = timestampMilliseconds(params.turn?.completedAt);
    mergeTurnMetric(params.turn?.id, {
      startedAt: params.turn?.startedAt,
      completedAt,
      durationMs: params.turn?.durationMs,
    });

    updateThreadInState(projectId, { ...thread, runtime: params.runtime });
    if (state.selectedThreadId === threadId) {
      state.compactingThreads.delete(threadId);
      clearTurnActivity(params.turn?.id, { removeEmpty: true });
      completeExecutionGroup(params.turn?.id, params.turn?.status || "completed", params.turn);
      updateComposer();
    }
    notifyTurnCompletion(projectId, threadId, params.turn);
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
  if (event.method.startsWith("item/") || event.method.startsWith("turn/")) {
    const turnId = params.turnId || params.turn?.id;
    if (turnId) clearTurnActivity(turnId);
    if (event.method === "item/agentMessage/delta") {
      const diagnostic = state.turnDiagnostics.get(turnId);
      if (diagnostic && !diagnostic.firstDeltaAt) {
        diagnostic.firstDeltaAt = Date.now();
        const transportMs = Number.isFinite(Number(params.serverReceivedAt)) ? Math.max(0, diagnostic.firstDeltaAt - Number(params.serverReceivedAt)) : null;
        showActivity(`已收到首字 · 发送到首字 ${Math.max(0, diagnostic.firstDeltaAt - diagnostic.submittedAt)} ms${transportMs === null ? "" : `，服务端到界面 ${transportMs} ms`}`, false);
      }
    }
    if (event.method === "item/completed" && params.item?.type === "userMessage") {
      markAsyncQuestionAnswered(threadId, asyncAnswerRequestId(userMessageText(params.item)));
    }
    if (params.item?.type === "contextCompaction") {
      if (event.method === "item/started") state.compactingThreads.add(threadId);
      else state.compactingThreads.delete(threadId);
      if (state.selectedThreadId === threadId) renderThreadActions();
    }
    return;
  }
  if (event.method === "error" && state.selectedThreadId === threadId) showActivity(params.error?.message || params.message || "Codex 返回错误。", true);
}

async function reconcileCompletedThread(projectId, threadId) {
  const thread = findThread(projectId, threadId);
  if (thread) updateThreadInState(projectId, { ...thread, updatedAt: Date.now(), historyLive: false, syncedUpdatedAt: null });
  renderThreads();
  ensureEventStream();
}

async function reconcileInterruptedThread(threadId) {
  const projectId = findProjectForThread(threadId);
  if (!projectId) return;
  if (state.selectedThreadId === threadId) {
    await selectThread(threadId, { closeNavigation: false, preserveFollowLatest: true, mergeHistory: true });
  } else {
    await refreshProjectThreads(projectId);
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

function includeThreadInPages(projectId, threadId) {
  for (const page of [state.threadPages.get(projectId), state.globalThreadPage]) {
    if (!page || page.order !== state.sidebarOrder) continue;
    page.ids = [threadId, ...page.ids.filter((id) => id !== threadId)];
  }
}

function applyThreadReplacement(projectId, oldThreadId, params) {
  const replacement = params.replacementThread;
  if (!replacement?.id) return;
  const threads = state.threads.get(projectId) || [];
  const oldThread = threads.find((thread) => thread.id === oldThreadId) || {};
  const nextThread = { ...oldThread, ...replacement };
  state.threads.set(projectId, [
    nextThread,
    ...threads.filter((thread) => thread.id !== oldThreadId && thread.id !== replacement.id),
  ]);
  const wasSelected = state.selectedThreadId === oldThreadId;
  forgetClientThread(oldThreadId);
  applyQueueSnapshot(replacement.id, params.queue || [], params.queueRevision ?? 0);
  if (wasSelected) state.selectedThreadId = replacement.id;
  renderThreads();
  renderRunStrip();
  if (wasSelected) {
    renderCurrentThread();
    showActivity("原聊天记录已丢失；排队消息已迁移到新的聊天并继续执行。", false);
  }
}

function rememberThreadItem(projectId, threadId, turnId, item) {
  if (!item?.id || !turnId) return null;
  const thread = findThread(projectId, threadId);
  if (!thread) return null;
  thread.turns = mergeConversationTurns(thread.turns || [], [{ id: turnId, items: [item] }]);
  return thread.turns.find((turn) => turn.id === turnId)?.items.find((entry) => entry.id === item.id) || null;
}

function applyQueueSnapshot(threadId, queue, queueRevision) {
  const revision = Number.isInteger(queueRevision) && queueRevision >= 0 ? queueRevision : null;
  const previous = state.queueSnapshots.get(threadId);
  if (revision !== null && previous?.revision !== null && previous?.revision !== undefined) {
    if (revision < previous.revision) return false;
  }
  const next = Array.isArray(queue) ? queue : [];
  state.queueSnapshots.set(threadId, { queue: next, revision });
  if (state.selectedThreadId === threadId) scheduleConversationRender(threadId);
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
  const currentSettings = thread.settings || {};
  const modelId = Object.hasOwn(overrides, "model")
    ? overrides.model
    : currentSettings.model || selectedModelForThread(thread)?.id || null;
  const model = state.models.find((entry) => entry.id === modelId);
  const efforts = model?.supportedReasoningEfforts || [];
  const effortValue = Object.hasOwn(overrides, "effort") ? overrides.effort : currentSettings.effort;
  const tierValue = Object.hasOwn(overrides, "serviceTier") ? overrides.serviceTier : currentSettings.serviceTier;
  const tiers = visibleServiceTiers(model?.serviceTiers, tierValue);
  const effort = efforts.some((entry) => entry.reasoningEffort === effortValue) ? effortValue : (model?.defaultReasoningEffort || efforts[0]?.reasoningEffort);
  const serviceTier = tiers.some((entry) => entry.id === tierValue) ? tierValue : "";
  const settings = {
    model: modelId || null,
    effort: effort || null,
    serviceTier: serviceTier || null,
    summary: (Object.hasOwn(overrides, "summary") ? overrides.summary : currentSettings.summary) || "detailed",
    collaborationMode: Object.hasOwn(overrides, "collaborationMode")
      ? overrides.collaborationMode
      : currentSettings.collaborationMode || "default",
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
      state.workspaceSyncVersion = status.workspaceSyncVersion || 0;
      applyCodexStatus(status);
      await loadProjects();
      if (state.codexReady) {
        void loadAccountRateLimits();
        await Promise.all([
          loadModels(),
          loadCollaborationModes(),
          refreshAllThreads({ foregroundProjectId: state.selectedProjectId }),
        ]);
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
      return selectThread(target.id, {
        closeNavigation: false,
        preserveFollowLatest: true,
        mergeHistory: true,
      });
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
  state.workspaceSyncVersion = status.workspaceSyncVersion || 0;
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
  renderLocalPreferences();
  ui.globalConfigDialog.showModal();
}

function initializeLocalPreferences() {
  state.sendShortcut = localStorage.getItem(userStorageKey("send-shortcut")) === "ctrl-enter" ? "ctrl-enter" : "enter";
  state.completionNotificationsEnabled = localStorage.getItem(userStorageKey("completion-notifications")) === "true";
  renderLocalPreferences();
}

function renderLocalPreferences() {
  ui.sendShortcut.value = state.sendShortcut;
  const defaultModel = localStorage.getItem(userStorageKey("default-model")) || "";
  ui.defaultModel.replaceChildren(new Option("自动", "", false, !defaultModel));
  if (defaultModel && !state.models.some((model) => model.id === defaultModel)) {
    ui.defaultModel.append(new Option(`${defaultModel}（当前不可用）`, defaultModel, false, true));
  }
  for (const model of state.models) {
    ui.defaultModel.append(new Option(compactModelLabel(model), model.id, false, model.id === defaultModel));
  }
  ui.completionNotifications.checked = state.completionNotificationsEnabled;
  ui.changeConnectionAddress.hidden = !window.CodexAndroid?.openConnectionSettings;
  const systemNotificationsReady = "Notification" in window && Notification.permission === "granted";
  ui.completionNotificationDescription.textContent = !state.completionNotificationsEnabled
    ? "任务在后台结束时提醒我。"
    : systemNotificationsReady
      ? "发送系统通知，并在页签标题标出完成任务。"
      : "系统通知不可用时，仍会在页签标题标出完成任务。";
}

function saveSendShortcut() {
  state.sendShortcut = ui.sendShortcut.value === "ctrl-enter" ? "ctrl-enter" : "enter";
  localStorage.setItem(userStorageKey("send-shortcut"), state.sendShortcut);
}

async function saveCompletionNotificationPreference() {
  state.completionNotificationsEnabled = ui.completionNotifications.checked;
  localStorage.setItem(userStorageKey("completion-notifications"), String(state.completionNotificationsEnabled));
  if (state.completionNotificationsEnabled
    && window.isSecureContext
    && "Notification" in window
    && Notification.permission === "default") {
    try {
      await Notification.requestPermission();
    } catch {
      // The tab-title reminder remains available when the browser rejects system notifications.
    }
  }
  renderLocalPreferences();
}

function notifyTurnCompletion(projectId, threadId, turn) {
  if (!state.completionNotificationsEnabled || !document.hidden) return;
  state.backgroundCompletionCount += 1;
  document.title = `(${state.backgroundCompletionCount}) CodexLAN`;
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const project = state.projects.find((entry) => entry.id === projectId);
  const thread = findThread(projectId, threadId);
  const status = turn?.status || "completed";
  const title = status === "failed" ? "任务执行失败" : status === "interrupted" ? "任务已停止" : "任务已完成";
  const body = [project?.name, thread ? threadDisplayName(thread) : null].filter(Boolean).join(" · ");
  try {
    const notification = new Notification(title, {
      body,
      tag: `codexlan-turn-${turn?.id || threadId}`,
    });
    notification.addEventListener("click", () => {
      window.focus();
      notification.close();
    });
  } catch {
    // Browser and WebView support varies; the tab-title reminder is the fallback.
  }
}

function clearBackgroundCompletionIndicator() {
  if (!state.backgroundCompletionCount) return;
  state.backgroundCompletionCount = 0;
  document.title = "CodexLAN";
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
    state.threadPages.delete(project.id);
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
  if (codexState !== "ready") {
    state.approvalRequests.clear();
    renderPendingRequests();
  }
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
  ui.serverStatus.textContent = "";
  ui.serverStatus.setAttribute("aria-label", text);
  ui.serverStatus.title = text;
  ui.serverStatusLabel.textContent = text;
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

function openDisplayNameDialog() {
  closeAccountMenu();
  closeSidebar();
  ui.displayNameForm.reset();
  ui.profileDisplayName.value = state.user?.displayName || "";
  ui.displayNameError.textContent = "";
  ui.displayNameDialog.showModal();
  setTimeout(() => {
    ui.profileDisplayName.focus();
    ui.profileDisplayName.select();
  }, 0);
}

async function saveDisplayName(event) {
  event.preventDefault();
  ui.displayNameError.textContent = "";
  ui.saveDisplayName.disabled = true;
  ui.saveDisplayName.textContent = "保存中…";
  try {
    const result = await api("/api/auth/profile", {
      method: "PATCH",
      body: { displayName: ui.profileDisplayName.value.trim() },
    });
    state.user = result.user;
    renderAccount();
    ui.displayNameDialog.close();
    showActivity("显示名称已更新。", false);
  } catch (error) {
    ui.displayNameError.textContent = error.message;
  } finally {
    ui.saveDisplayName.disabled = false;
    ui.saveDisplayName.textContent = "保存名称";
  }
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
  for (const [key, view] of state.asyncInputCards) {
    if (view.request.threadId !== threadId) continue;
    view.root.remove();
    state.asyncInputCards.delete(key);
    setAsyncQuestionDeferred(localStorage, userStorageKey("deferred-async-questions"), key, false);
  }
  state.queueSnapshots.delete(threadId);
  state.threadTokenUsage.delete(threadId);
  for (const [requestId, request] of state.userInputRequests) {
    if (request.threadId === threadId) state.userInputRequests.delete(requestId);
  }
  for (const [requestId, request] of state.approvalRequests) {
    if (request.threadId === threadId) state.approvalRequests.delete(requestId);
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
  const finishProfile = profileSpan("api", { path, method });
  let profileStatus = "completed";
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
    profileStatus = error?.name === "AbortError" ? "aborted" : "error";
    if (error?.name === "AbortError" && options.signal?.aborted) throw error;
    if (error?.name === "AbortError") throw new Error("请求超时，请检查连接后重试。");
    throw error;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abortFromCaller);
    finishProfile({ status: profileStatus });
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
ui.changeDisplayName.addEventListener("click", openDisplayNameDialog);
ui.changePassword.addEventListener("click", () => openPasswordDialog(false));
ui.logout.addEventListener("click", async () => {
  try {
    await api("/api/auth/logout", { method: "POST" });
  } finally {
    location.reload();
  }
});
ui.passwordForm.addEventListener("submit", saveMyPassword);
ui.displayNameForm.addEventListener("submit", saveDisplayName);
ui.closeDisplayNameDialog.addEventListener("click", () => ui.displayNameDialog.close());
ui.cancelDisplayName.addEventListener("click", () => ui.displayNameDialog.close());
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
ui.sidebarViewProjects.addEventListener("click", () => setSidebarNavigation("projects"));
ui.sidebarViewRecent.addEventListener("click", () => setSidebarNavigation("recent"));
ui.sidebarSortTrigger.addEventListener("click", toggleSidebarSortMenu);
ui.sidebarOrderOriginal.addEventListener("click", () => setSidebarNavigation(null, "original"));
ui.sidebarOrderRecent.addEventListener("click", () => setSidebarNavigation(null, "recent"));
ui.renameThread.addEventListener("click", () => { closeThreadMenu(); openThreadDialog(); });
ui.suggestThreadName.addEventListener("click", suggestThreadName);
ui.forkThread.addEventListener("click", forkCurrentThread);
ui.compactThread.addEventListener("click", compactCurrentThread);
ui.deleteThread.addEventListener("click", () => { closeThreadMenu(); deleteCurrentThread(); });
ui.threadForm.addEventListener("submit", saveThreadName);
ui.queueEditForm.addEventListener("submit", saveQueueEdit);
ui.jumpLatest.addEventListener("click", () => scrollToLatest());
ui.closeMarkdownPreview.addEventListener("click", () => ui.markdownPreviewDialog.close());
ui.copyMarkdownPreview.addEventListener("click", () => {
  copyWithFeedback(ui.copyMarkdownPreview, markdownPreviewValue?.text || "");
});
ui.shareMarkdownPreview.addEventListener("click", () => {
  if (!markdownPreviewValue) return;
  shareMarkdown(markdownPreviewValue).then((route) => {
    if (route) showActivity(route === "android-choice" ? "请选择分享格式。" : route === "android-pdf" ? "正在生成 PDF…" : "已打开系统分享面板。", false);
    else showActivity("当前浏览器不支持系统分享，请使用复制。", true);
  }).catch(showError);
});
ui.markdownPreviewDialog.addEventListener("close", () => {
  markdownPreviewRequest += 1;
  setMarkdownPreviewValue("", "");
  ui.markdownPreviewBody.replaceChildren();
});
ui.markdownPreviewDialog.addEventListener("click", (event) => {
  if (event.target === ui.markdownPreviewDialog) ui.markdownPreviewDialog.close();
});
bindDownloadLink(ui.markdownPreviewDownload, null, $("#markdown-download-status"));
bindDownloadLink(ui.imagePreviewDownload, null, $("#image-download-status"));
ui.closeImagePreview.addEventListener("click", () => ui.imagePreviewDialog.close());
ui.imagePreviewDialog.addEventListener("close", () => {
  ui.imagePreviewImage.removeAttribute("src");
  ui.imagePreviewImage.alt = "";
});
ui.imagePreviewDialog.addEventListener("click", (event) => {
  if (event.target === ui.imagePreviewDialog) ui.imagePreviewDialog.close();
});
document.addEventListener("markdown-mermaid-open", (event) => openMermaidPreview(event.detail?.svg));
ui.closeMermaidPreview.addEventListener("click", () => ui.mermaidPreviewDialog.close());
ui.mermaidPreviewDialog.addEventListener("close", () => ui.mermaidPreviewStage.replaceChildren());
ui.mermaidPreviewDialog.addEventListener("click", (event) => {
  if (event.target === ui.mermaidPreviewDialog) ui.mermaidPreviewDialog.close();
});
ui.closeVisualization.addEventListener("click", () => ui.visualizationDialog.close());
ui.visualizationDialog.addEventListener("close", () => {
  visualizationRequest += 1;
  ui.visualizationUrl.removeAttribute("href");
  ui.visualizationUrl.textContent = "";
  ui.visualizationUrl.removeAttribute("title");
  ui.visualizationFrame.onload = null;
  ui.visualizationFrame.removeAttribute("src");
  ui.visualizationFrame.hidden = true;
});
ui.visualizationDialog.addEventListener("click", (event) => {
  if (event.target === ui.visualizationDialog) ui.visualizationDialog.close();
});
ui.conversation.addEventListener("scroll", updateJumpLatest, { passive: true });
ui.summary.addEventListener("change", () => saveSettings({ summary: ui.summary.value }));
ui.composerModel.addEventListener("change", () => saveSettings({ model: ui.composerModel.value }));
ui.defaultModel.addEventListener("change", () => localStorage.setItem(userStorageKey("default-model"), ui.defaultModel.value));
ui.composerEffort.addEventListener("change", () => saveSettings({ effort: ui.composerEffort.value }));
ui.composerTier.addEventListener("change", () => saveSettings({ serviceTier: ui.composerTier.value }));
ui.copyConnectionAddress.addEventListener("click", () => copyWithFeedback(ui.copyConnectionAddress, location.origin));
ui.changeConnectionAddress.addEventListener("click", () => window.CodexAndroid?.openConnectionSettings?.());
ui.completionNotifications.addEventListener("change", () => { void saveCompletionNotificationPreference(); });
ui.sendShortcut.addEventListener("change", saveSendShortcut);
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
  if (document.visibilityState === "hidden") return;
  clearBackgroundCompletionIndicator();
  ensureEventStream();
  scheduleResume(0);
});
window.addEventListener("pageshow", (event) => {
  if (event.persisted) {
    restartEventStream();
    scheduleResume(0);
  }
});
window.addEventListener("online", () => {
  restartEventStream();
  scheduleResume(0);
});
window.addEventListener("focus", () => {
  clearBackgroundCompletionIndicator();
  if (eventStreamNeedsRestart({
    readyState: state.eventStream?.readyState,
    openState: EventSource.OPEN,
    closedState: EventSource.CLOSED,
    lastActivityAt: state.eventStreamLastActivityAt,
  })) restartEventStream();
  scheduleResume();
});
window.addEventListener("codex-native-resume", () => {
  restartEventStream();
  scheduleResume(0);
});
document.addEventListener("click", (event) => {
  if (!ui.sidebarSortWrap.contains(event.target)) closeSidebarSortMenu();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeSidebarSortMenu();
});
layout.bind();
