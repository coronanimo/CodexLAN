import { randomUUID } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { tmpdir } from "node:os";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import { MAX_SAVED_COMMAND_OUTPUT, activeExecutionSnapshots, commandExecutionSnapshot, commandOutputTail, executionItemText } from "../public/execution-events.js";
import { timestampMilliseconds } from "../public/elapsed-time.js";
import { isActiveThreadStatus } from "../public/workspace.js";
import { turnPlanSnapshot } from "../public/plan.js";
import { isActiveGoal } from "../public/goal.js";
import { activityFromNotification, mergeRuntimeActivity } from "../public/run-diagnostics.js";
import { json, readJson, validateId, validateText } from "./http.mjs";
import { createThreadTitleService, isMiniModel, shouldGenerateThreadTitle } from "./thread-titles.mjs";
import {
  SESSION_TIMER_MAX_MS,
  cleanSettings,
  cleanTimingPatch,
  httpError,
  mergeSettings,
} from "./workspace-store.mjs";

const COMMAND_OUTPUT_FLUSH_DELAY = 100;
const MAX_LIVE_COMMAND_OUTPUT = 16 * 1024;
const MAX_HISTORY_TOOL_DETAIL = 16 * 1024;
const MAX_VISUALIZATION_BYTES = 5 * 1024 * 1024;
const MAX_EVENT_STREAM_BUFFER = 1024 * 1024;
const MODEL_CACHE_TTL_MS = 30 * 60_000;
const MODEL_FAILURE_RETRY_MS = 60_000;
const FALLBACK_MODEL_ID = "gpt-5.6-terra";
const FALLBACK_REASONING_EFFORT = "low";
const FALLBACK_MODEL = {
  id: FALLBACK_MODEL_ID,
  displayName: "GPT-5.6 Terra",
  hidden: false,
  isDefault: true,
  defaultReasoningEffort: FALLBACK_REASONING_EFFORT,
  supportedReasoningEfforts: [{ reasoningEffort: FALLBACK_REASONING_EFFORT }],
  serviceTiers: [],
};

export function createConversations({ store, codex, autoApprove = false }) {
  const threadTitles = createThreadTitleService({ codex });
  const eventClients = new Set();
  const commandOutputBatches = new Map();
  const commandOutputTails = new Map();
  const threadState = new Map();
  const queueAdvances = new Map();
  const queueSteerJobs = new Map();
  const threadTokenUsage = new Map();
  const threadGoals = new Map();
  const effectiveThreadNames = new Map();
  const resolvedLegacyThreadNames = new Set();
  const userInputRequests = new Map();
  const approvalRequests = new Map();
  const MAX_THREAD_TOKEN_USAGE = 300;
  const DEFAULT_REASONING_SUMMARY = "detailed";
  const REASONING_SUMMARIES = new Set(["auto", "concise", "detailed", "none"]);
  const COLLABORATION_MODES = new Set(["default", "plan"]);
  const USER_GOAL_STATUSES = new Set(["active", "paused"]);
  const DEFAULT_HISTORY_PAGE_SIZE = 12;
  const MAX_HISTORY_PAGE_SIZE = 40;
  let modelCache = { expiresAt: 0, data: [] };
  let modelRefreshPromise = null;
  let collaborationModeCache = { expiresAt: 0, data: [] };
  let accountRateLimitsCache = { expiresAt: 0, data: null };
  codex.events.on("notification", (message) => {
    if (message.method === "account/rateLimits/updated") accountRateLimitsCache.expiresAt = 0;
    if (message.method === "serverRequest/resolved") {
      const requestId = String(message.params?.requestId ?? "");
      userInputRequests.delete(requestId);
      const threadId = message.params?.threadId;
      if (threadId) approvalRequests.delete(threadId + ":" + requestId);
    }
    const threadId = message.params?.threadId;
    if (!threadId) return;
    if (message.method === "item/commandExecution/outputDelta") {
      queueCommandOutput(message);
      return;
    }
    if (message.method === "turn/started") {
      logTurnTiming(message.params?.threadId, "turn/started-notification", null, {
        turnId: message.params?.turn?.id || message.params?.turnId || null,
      });
    }
    flushCommandOutputBatches(threadId);
    dispatchCodexNotification(message);
  });

  codex.events.on("serverRequest", (message) => {
    void handleServerRequest(message).catch((error) => {
      try {
        codex.respondError(message.id, -32603, error.message);
      } catch {}
      process.stderr.write(`[web] 无法处理 Codex 客户端请求：${error.message}\n`);
    });
  });

  async function handleServerRequest(message) {
    if ([
      "item/commandExecution/requestApproval",
      "item/fileChange/requestApproval",
      "item/permissions/requestApproval",
    ].includes(message.method)) {
      await store.ready;
      const params = message.params || {};
      const threadId = validateId(params.threadId, "threadId");
      const requestId = String(message.id);
      const projectId = store.threadProjects[threadId];
      if (!projectId) throw new Error("Codex 审批来自未登记的聊天。");
      if (autoApprove) {
        codex.respond(message.id, approvalResponse({ method: message.method, params }, "acceptForSession"));
        return;
      }
      const key = threadId + ":" + requestId;
      if (approvalRequests.has(key)) throw new Error("Codex 审批编号重复。");
      approvalRequests.set(key, {
        requestId,
        codexRequestId: message.id,
        threadId,
        turnId: params.turnId || null,
        itemId: params.itemId || null,
        method: message.method,
        params,
      });
      broadcast(threadId, { method: message.method, params: { ...params, requestId } });
      return;
    }
    if (message.method !== "item/tool/requestUserInput") {
      codex.respondError(message.id, -32601, `CodexLAN 尚未实现客户端请求 ${message.method}。`);
      return;
    }
    await store.ready;
    const params = message.params || {};
    const threadId = validateId(params.threadId, "threadId");
    const requestId = String(message.id);
    if (!store.threadProjects[threadId]) throw new Error("Codex 提问来自未登记的聊天。");
    if (userInputRequests.has(requestId)) throw new Error("Codex 提问编号重复。");
    const request = {
      requestId,
      codexRequestId: message.id,
      threadId,
      turnId: validateId(params.turnId, "turnId"),
      itemId: validateId(params.itemId, "itemId"),
      autoResolutionMs: Number.isInteger(params.autoResolutionMs) && params.autoResolutionMs >= 0 ? params.autoResolutionMs : null,
      questions: normalizeUserInputQuestions(params.questions),
      resolving: false,
    };
    userInputRequests.set(requestId, request);
    broadcast(threadId, { method: message.method, params: publicUserInputRequest(request) });
  }

  function dispatchCodexNotification(message, receivedAt = Date.now()) {
    void handleCodexNotification(message, receivedAt).catch((error) => {
      process.stderr.write(`[web] 无法处理 Codex 通知：${error.message}\n`);
    });
  }

  function queueCommandOutput(message) {
    const params = message.params || {};
    const key = commandOutputKey(params);
    let batch = commandOutputBatches.get(key);
    if (!batch) {
      batch = { threadId: params.threadId, message, receivedAt: Date.now(), delta: "", replaceOutput: false, timer: null };
      commandOutputBatches.set(key, batch);
    }
    const delta = typeof params.delta === "string" ? params.delta : String(params.delta || "");
    if (!delta) return;
    const previous = commandOutputTails.get(key) || { text: "", truncated: false };
    const output = commandOutputTail(previous.text, delta, MAX_SAVED_COMMAND_OUTPUT);
    commandOutputTails.set(key, { text: output.text, truncated: previous.truncated || output.truncated });
    const live = commandOutputTail(batch.delta, delta, MAX_LIVE_COMMAND_OUTPUT);
    batch.delta = live.text;
    batch.replaceOutput ||= live.truncated;
    if (!batch.timer) {
      batch.timer = setTimeout(() => flushCommandOutputBatch(key), COMMAND_OUTPUT_FLUSH_DELAY);
      batch.timer.unref?.();
    }
  }

  function flushCommandOutputBatch(key) {
    const batch = commandOutputBatches.get(key);
    if (!batch) return;
    if (batch.timer) clearTimeout(batch.timer);
    commandOutputBatches.delete(key);
    if (!batch.delta) return;
    dispatchCodexNotification({
      ...batch.message,
      params: { ...batch.message.params, delta: batch.delta, replaceOutput: batch.replaceOutput },
    }, batch.receivedAt);
  }

  function flushCommandOutputBatches(threadId) {
    for (const [key, batch] of commandOutputBatches) {
      if (batch.threadId === threadId) flushCommandOutputBatch(key);
    }
  }

  function discardCommandOutputBatches(threadId) {
    for (const [key, batch] of commandOutputBatches) {
      if (threadId && batch.threadId !== threadId) continue;
      if (batch.timer) clearTimeout(batch.timer);
      commandOutputBatches.delete(key);
    }
    for (const key of commandOutputTails.keys()) {
      if (threadId && !key.startsWith(`${threadId}\u0000`)) continue;
      commandOutputTails.delete(key);
    }
  }

  function commandOutputKey(params = {}) {
    return `${params.threadId || ""}\u0000${params.turnId || ""}\u0000${params.itemId || params.item?.id || ""}`;
  }
  
  async function handleCodexNotification(message, receivedAt) {
    await store.ready;
    message = timestampCodexNotification(message, receivedAt);
    const threadId = message.params.threadId;
    const projectId = store.threadProjects[threadId];
    if (!projectId) return;
    if (message.method === "thread/goal/updated") threadGoals.set(threadId, message.params.goal);
    if (message.method === "thread/goal/cleared") threadGoals.set(threadId, null);
    if (message.method === "thread/name/updated") {
      const name = normalizedThreadName(message.params.threadName ?? message.params.name);
      if (name) effectiveThreadNames.set(threadId, name);
      resolvedLegacyThreadNames.add(threadId);
    }
    if (message.method === "thread/tokenUsage/updated" && message.params.tokenUsage) {
      threadTokenUsage.delete(threadId);
      threadTokenUsage.set(threadId, message.params.tokenUsage);
      while (threadTokenUsage.size > MAX_THREAD_TOKEN_USAGE) threadTokenUsage.delete(threadTokenUsage.keys().next().value);
    }
    void persistNotificationTiming(message).catch((error) => {
      process.stderr.write(`[web] 无法保存执行耗时：${error.message}\n`);
    });
    let runtime;
    if (message.method === "turn/started") {
      runtime = updateThreadRuntime(threadId, {
        projectId,
        activeTurnId: message.params.turn?.id,
        status: "running",
        startedAt: timestampMilliseconds(message.params.turn?.startedAt) || Date.now(),
        activity: activityFromNotification(message.method, message.params, receivedAt),
      });
    }
    if (message.method === "turn/completed") {
      runtime = updateThreadRuntime(threadId, { projectId, activeTurnId: null, status: "idle", startedAt: null });
      void advanceQueue(threadId);
      void scheduleThreadTitle(threadId, [], { fullLegacyCheck: true }).catch((error) => {
        process.stderr.write(`[web] 无法自动生成聊天名称 (${threadId})：${error.message}\n`);
      });
    }
    if (message.method === "thread/status/changed") {
      runtime = updateThreadRuntime(threadId, {
        projectId,
        status: message.params.status,
        activity: mergeRuntimeActivity(
          threadState.get(threadId)?.activity,
          activityFromNotification(message.method, message.params, receivedAt),
        ),
      });
      if (!isActiveThreadStatus(message.params.status)) void advanceQueue(threadId);
    }
    if (!runtime && threadState.has(threadId)) {
      runtime = updateThreadRuntime(threadId, {
        projectId,
        activity: mergeRuntimeActivity(
          threadState.get(threadId)?.activity,
          activityFromNotification(message.method, message.params, receivedAt),
        ),
      });
    }
    if (runtime) {
      message = { ...message, params: { ...message.params, runtime } };
    }
    broadcast(threadId, compactNotification(message));
    if (message.method === "thread/goal/cleared"
      || (message.method === "thread/goal/updated" && !isActiveGoal(message.params.goal))) {
      void advanceQueue(threadId);
    }
  }
  
  codex.events.on("offline", (details) => {
    userInputRequests.clear();
    approvalRequests.clear();
    broadcastServer({ status: codex.state, ...details });
  });
  
  codex.events.on("online", (details) => {
    broadcastServer(details);
    if (codex.state === "ready") {
      void recoverPersistedQueues().catch((error) => {
        process.stderr.write(`[web] 无法恢复持久化队列：${error.message}\n`);
      });
    }
  });

  function registerRoutes(application) {
    application.get("/api/account/rate-limits", async (request, response) => {
      try {
        json(response, 200, { available: true, ...await readAccountRateLimits() });
      } catch {
        json(response, 200, { available: false });
      }
    });
  
    application.get("/api/models", async (request, response) => {
      json(response, 200, { models: await listModels() });
    });

    application.get("/api/collaboration-modes", async (request, response) => {
      json(response, 200, { modes: await listCollaborationModes() });
    });
  
    application.post("/api/threads", async (request, response) => {
      const user = request.identity.user;
      const body = await readJson(request);
      const project = await store.getProject(body.projectId, user.id);
      const settings = await validateSettings(body.settings);
      const requestedName = typeof body.name === "string" && body.name.trim()
        ? body.name.trim().slice(0, 100)
        : null;
      const result = await startCodexThread(project, settings);
      codex.markThreadLoaded(result.thread.id);
      if (requestedName) {
        await codex.request("thread/name/set", { threadId: result.thread.id, name: requestedName });
      }
      await store.setThreadProject(result.thread.id, project.id);
      const accessedAt = await store.recordThreadAccess(user.id, result.thread.id);
      await store.setThreadSettings(result.thread.id, settings);
      const runtime = { projectId: project.id, activeTurnId: null, status: "idle" };
      const thread = { ...result.thread, accessedAt, status: result.thread.status || "idle", turns: result.thread.turns || [], settings, goal: null, runtime, ...(requestedName ? { name: requestedName } : {}) };
      json(response, 201, {
        thread,
        runtime,
        queue: [],
        queueRevision: 0,
        history: { hasMore: false, before: null, totalTurns: 0 },
      });
    });

    application.post("/api/threads/:threadId/fork", async (request, response) => {
      const user = request.identity.user;
      const threadId = validateId(request.params.threadId, "threadId");
      const body = await readJson(request);
      const project = await store.getProject(body.projectId, user.id);
      await store.requireThreadOwner(threadId, user.id, project.id);
      const source = (await codex.request("thread/read", { threadId, includeTurns: false })).thread;
      const runtime = threadState.get(threadId);
      if (runtime?.activeTurnId || isActiveThreadStatus(runtime?.status) || isActiveThreadStatus(source?.status)) {
        throw httpError(409, "聊天仍在执行中，请先停止任务再分叉。");
      }
      const settings = cleanSettings(await store.getThreadSettings(threadId, project.settings));
      const params = {
        threadId,
        cwd: project.path,
        excludeTurns: true,
        config: { model_reasoning_summary: settings.summary || DEFAULT_REASONING_SUMMARY },
      };
      if (settings.model) params.model = settings.model;
      if (settings.serviceTier) params.serviceTier = settings.serviceTier;
      const result = await codex.request("thread/fork", params);
      const forkedThreadId = validateId(result?.thread?.id, "forkedThreadId");
      if (forkedThreadId === threadId) throw new Error("Codex 返回了无效的分叉聊天编号。");
      const sourceName = normalizedThreadName(source?.name);
      const forkedName = sourceName ? `${sourceName.slice(0, 96)}（分支）` : null;
      try {
        codex.markThreadLoaded(forkedThreadId);
        if (forkedName) await codex.request("thread/name/set", { threadId: forkedThreadId, name: forkedName });
        await store.setThreadProject(forkedThreadId, project.id);
        await store.setThreadSettings(forkedThreadId, settings);
        const accessedAt = await store.recordThreadAccess(user.id, forkedThreadId);
        const forkRuntime = updateThreadRuntime(forkedThreadId, {
          projectId: project.id,
          activeTurnId: null,
          status: "idle",
        });
        const thread = {
          ...result.thread,
          ...(forkedName ? { name: forkedName } : {}),
          turns: [],
          accessedAt,
          settings,
          goal: null,
          runtime: forkRuntime,
        };
        json(response, 201, { thread, runtime: forkRuntime, queue: [], queueRevision: 0 });
      } catch (error) {
        codex.loadedThreads.delete(forkedThreadId);
        forgetThreadRuntime(forkedThreadId);
        await codex.request("thread/delete", { threadId: forkedThreadId }, { timeoutMs: 10_000 }).catch(() => {});
        await store.removeThread(forkedThreadId).catch(() => {});
        throw error;
      }
    });
  
    application.get("/api/threads/:threadId", async (request, response) => {
      const user = request.identity.user;
      const threadId = request.params.threadId;
      const project = await projectFromQuery(request.codexUrl, user.id);
      await store.requireThreadOwner(threadId, user.id, project.id);
      if (request.codexUrl.searchParams.get("history") === "none") {
        const accessedAt = await store.recordThreadAccess(user.id, threadId, { deferred: true });
        const requestedActiveTurnId = request.codexUrl.searchParams.get("activeTurnId");
        let metrics = {};
        if (requestedActiveTurnId) {
          const activeTurnId = validateId(requestedActiveTurnId, "activeTurnId");
          const storedMetrics = await store.getTurnMetrics(threadId);
          if (storedMetrics[activeTurnId]) metrics = { [activeTurnId]: storedMetrics[activeTurnId] };
        }
        return json(response, 200, { accessedAt, metrics });
      }
      const page = await loadThreadPage(threadId, request.codexUrl.searchParams);
      let thread = page.thread;
      const history = page.history;
      const activeTurn = activeTurnFromThread(thread);
      const storedMetrics = await store.getTurnMetrics(threadId);
      const recoveredActiveTurn = activeTurn || activeTurnFromMetrics(storedMetrics);
      const runtime = updateThreadRuntime(threadId, {
        projectId: project.id,
        status: thread.status || "idle",
        ...(recoveredActiveTurn ? {
          activeTurnId: recoveredActiveTurn.id,
          startedAt: timestampMilliseconds(recoveredActiveTurn.startedAt) || threadState.get(threadId)?.startedAt || Date.now(),
        } : {}),
      });
      const [settings, queueSnapshot, goal] = await Promise.all([
        store.getThreadSettings(threadId, project.settings),
        store.getQueueSnapshot(threadId),
        readThreadGoal(threadId),
      ]);
      const metrics = Object.fromEntries(history.turns.flatMap((turn) => storedMetrics[turn.id] ? [[turn.id, storedMetrics[turn.id]]] : []));
      const accessedAt = await store.recordThreadAccess(user.id, threadId, { deferred: true });
      json(response, 200, {
        thread: { ...thread, settings, goal, accessedAt },
        ...queueSnapshot,
        runtime,
        metrics,
        tokenUsage: threadTokenUsage.get(threadId) || null,
        history: { hasMore: history.hasMore, before: history.before, totalTurns: history.totalTurns },
      });
      if (history.turns.length) {
        void scheduleThreadTitle(threadId, page.allTurns).catch((error) => {
          process.stderr.write(`[web] 无法补全聊天名称 (${threadId})：${error.message}\n`);
        });
      }
    });

    application.get("/api/threads/:threadId/runtime", async (request, response) => {
      const user = request.identity.user;
      const threadId = validateId(request.params.threadId, "threadId");
      const project = await projectFromQuery(request.codexUrl, user.id);
      await store.requireThreadOwner(threadId, user.id, project.id);
      const result = await codex.request("thread/read", { threadId, includeTurns: false }, { timeoutMs: 5_000 });
      const thread = result?.thread || {};
      const activeTurn = activeTurnFromThread(thread);
      const active = isActiveThreadStatus(thread.status);
      const previous = threadState.get(threadId);
      const runtime = updateThreadRuntime(threadId, {
        projectId: project.id,
        status: thread.status || "idle",
        activeTurnId: activeTurn?.id || (active ? previous?.activeTurnId || null : null),
        ...(activeTurn ? { startedAt: timestampMilliseconds(activeTurn.startedAt) || Date.now() } : {}),
        ...(active && previous?.activity ? { activity: previous.activity } : {}),
      });
      if (!active) void advanceQueue(threadId);
      json(response, 200, {
        threadId,
        runtime,
        status: thread.status || { type: "idle" },
        probedAt: new Date().toISOString(),
      });
    });

    application.get("/api/threads/:threadId/visualization", async (request, response) => {
      const user = request.identity.user;
      const threadId = validateId(request.params.threadId, "threadId");
      const projectId = validateId(request.codexUrl.searchParams.get("projectId"), "项目 ID");
      const project = await store.getProject(projectId, user.id);
      await store.requireThreadOwner(threadId, user.id, projectId);
      const filePath = await visualizationFilePath(request.codexUrl.searchParams.get("path"), {
        projectRoot: project.path,
        allowAnyLocalFile: user.role === "admin",
      });
      const details = await stat(filePath);
      if (!details.isFile()) throw httpError(400, "可视化路径不是文件。");
      if (details.size > MAX_VISUALIZATION_BYTES) throw httpError(413, "可视化文件不能超过 5 MB。");
      const contents = await readFile(filePath);
      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src data: blob: https:; font-src data: https:; connect-src https://cdn.jsdelivr.net; frame-ancestors 'self'; base-uri 'none'; form-action 'none'",
      });
      response.end(visualizationDocument(contents.toString("utf8")));
    });
  
    application.patch("/api/threads/:threadId", async (request, response) => {
      const user = request.identity.user;
      const body = await readJson(request);
      const project = await store.getProject(body.projectId, user.id);
      await store.requireThreadOwner(request.params.threadId, user.id, project.id);
      let changed = false;
      let name;
      let settings;
      if (Object.hasOwn(body, "name")) {
        if (typeof body.name !== "string" || !body.name.trim()) throw httpError(400, "聊天名称不能为空。");
        name = body.name.trim().slice(0, 100);
        await codex.request("thread/name/set", { threadId: request.params.threadId, name });
        changed = true;
      }
      if (Object.hasOwn(body, "settings")) {
        settings = await validateSettings(mergeSettings(await store.getThreadSettings(request.params.threadId), body.settings));
        await ensureThreadLoaded(request.params.threadId, project, settings);
        await codex.request("thread/settings/update", {
          threadId: request.params.threadId,
          collaborationMode: await collaborationModeForSettings(settings),
        });
        await store.setThreadSettings(request.params.threadId, settings);
        changed = true;
      }
      if (!changed) throw httpError(400, "没有需要修改的聊天内容。");
      json(response, 200, { ok: true, ...(name ? { name } : {}), ...(settings ? { settings } : {}) });
    });

    application.post("/api/threads/:threadId/name/suggest", async (request, response) => {
      const user = request.identity.user;
      const threadId = request.params.threadId;
      const body = await readJson(request);
      const project = await store.getProject(body.projectId, user.id);
      await store.requireThreadOwner(threadId, user.id, project.id);
      await ensureThreadLoaded(threadId, project);
      const thread = (await codex.request("thread/read", { threadId, includeTurns: true })).thread;
      const settings = await validateSettings(await store.getThreadSettings(threadId, project.settings));
      const name = await threadTitles.suggest({
        cwd: project.path,
        turns: thread.turns || [],
        settings,
        latest: true,
      });
      json(response, 200, { name });
    });

    application.get("/api/threads/:threadId/goal", async (request, response) => {
      const user = request.identity.user;
      const threadId = request.params.threadId;
      const project = await projectFromQuery(request.codexUrl, user.id);
      await store.requireThreadOwner(threadId, user.id, project.id);
      json(response, 200, { goal: await readThreadGoal(threadId) });
    });

    application.patch("/api/threads/:threadId/goal", async (request, response) => {
      const user = request.identity.user;
      const threadId = request.params.threadId;
      const body = await readJson(request);
      const project = await store.getProject(body.projectId, user.id);
      await store.requireThreadOwner(threadId, user.id, project.id);
      const params = validateGoalPatch(threadId, body);
      const result = await codex.request("thread/goal/set", params);
      threadGoals.set(threadId, result.goal);
      json(response, 200, { goal: result.goal });
    });

    application.delete("/api/threads/:threadId/goal", async (request, response) => {
      const user = request.identity.user;
      const threadId = request.params.threadId;
      const project = await projectFromQuery(request.codexUrl, user.id);
      await store.requireThreadOwner(threadId, user.id, project.id);
      const result = await codex.request("thread/goal/clear", { threadId });
      threadGoals.set(threadId, null);
      json(response, 200, { cleared: result.cleared === true, goal: null });
    });
  
    application.delete("/api/threads/:threadId", async (request, response) => {
      const user = request.identity.user;
      const threadId = request.params.threadId;
      const project = await projectFromQuery(request.codexUrl, user.id);
      await store.requireThreadOwner(threadId, user.id, project.id);
      const runtime = threadState.get(threadId);
      if (runtime?.activeTurnId || isActiveThreadStatus(runtime?.status)) throw httpError(409, "聊天仍在执行中，请先停止任务再删除。");
      const goal = threadGoals.has(threadId) ? threadGoals.get(threadId) : await readThreadGoal(threadId);
      if (isActiveGoal(goal)) throw httpError(409, "Goal 仍在运行，请先暂停或清除 Goal 再删除聊天。");
      if (queueAdvances.has(threadId) || [...queueSteerJobs.keys()].some((key) => key.startsWith(threadId + ":"))) {
        throw httpError(409, "聊天队列正在处理，请完成后再删除。");
      }
      await codex.request("thread/delete", { threadId });
      await store.removeThread(threadId);
      effectiveThreadNames.delete(threadId);
      resolvedLegacyThreadNames.delete(threadId);
      forgetThreadRuntime(threadId);
      json(response, 200, { ok: true });
    });
  
    application.get("/api/threads/:threadId/queue", async (request, response) => {
      const user = request.identity.user;
      const project = await projectFromQuery(request.codexUrl, user.id);
      await store.requireThreadOwner(request.params.threadId, user.id, project.id);
      json(response, 200, await store.getQueueSnapshot(request.params.threadId));
    });
  
    application.post("/api/threads/:threadId/queue", async (request, response) => {
      const user = request.identity.user;
      const body = await readJson(request);
      const project = await store.getProject(body.projectId, user.id);
      await store.requireThreadOwner(request.params.threadId, user.id, project.id);
      const item = await store.enqueue(request.params.threadId, project.id, validateText(body.text));
      logTurnTiming(request.params.threadId, "queue-received", null, { itemId: item.id });
      broadcastQueue(request.params.threadId);
      void advanceQueue(request.params.threadId);
      json(response, 202, { item, ...await store.getQueueSnapshot(request.params.threadId) });
    });
  
    application.delete("/api/threads/:threadId/queue/:itemId", async (request, response) => {
      const user = request.identity.user;
      const { threadId, itemId } = request.params;
      const project = await projectFromQuery(request.codexUrl, user.id);
      await store.requireThreadOwner(threadId, user.id, project.id);
      if (queueSteerJobs.has(threadId + ":" + itemId)) throw httpError(409, "排队任务正在转入当前信息流。");
      await store.removeQueueItem(threadId, itemId);
      broadcastQueue(threadId);
      json(response, 200, await store.getQueueSnapshot(threadId));
    });
  
    application.patch("/api/threads/:threadId/queue/:itemId", async (request, response) => {
      const user = request.identity.user;
      const { threadId, itemId } = request.params;
      const body = await readJson(request);
      const project = await store.getProject(body.projectId, user.id);
      await store.requireThreadOwner(threadId, user.id, project.id);
      if (Object.hasOwn(body, "text")) {
        await store.updateQueueItem(threadId, itemId, validateText(body.text));
      } else {
        if (body.direction !== "up" && body.direction !== "down") throw httpError(400, "请提供新的任务内容，或使用 up/down 调整顺序。");
        await store.moveQueueItem(threadId, itemId, body.direction);
      }
      broadcastQueue(threadId);
      json(response, 200, await store.getQueueSnapshot(threadId));
    });
  
    application.post("/api/threads/:threadId/queue/:itemId/steer", async (request, response) => {
      const user = request.identity.user;
      const { threadId, itemId } = request.params;
      const body = await readJson(request);
      const project = await store.getProject(body.projectId, user.id);
      await store.requireThreadOwner(threadId, user.id, project.id);
      const result = await steerQueuedItem({
        threadId,
        itemId,
        expectedTurnId: validateId(body.expectedTurnId, "expectedTurnId"),
        project,
      });
      json(response, 200, result);
    });
  
    application.post("/api/threads/:threadId/steer", async (request, response) => {
      const user = request.identity.user;
      const threadId = request.params.threadId;
      const body = await readJson(request);
      const project = await store.getProject(body.projectId, user.id);
      await store.requireThreadOwner(threadId, user.id, project.id);
      await ensureThreadLoaded(threadId, project);
      const text = validateText(body.text);
      const messageId = randomUUID();
      const result = await codex.request("turn/steer", {
        threadId,
        clientUserMessageId: messageId,
        expectedTurnId: validateId(body.expectedTurnId, "expectedTurnId"),
        input: [{ type: "text", text }],
      }, { timeoutMs: 10_000 });
      json(response, 202, {
        turnId: result.turnId || body.expectedTurnId,
        item: { id: messageId, clientId: messageId, type: "userMessage", content: [{ type: "text", text }], clientPending: true },
      });
    });
  
    application.post("/api/threads/:threadId/interrupt", async (request, response) => {
      const user = request.identity.user;
      const threadId = request.params.threadId;
      const body = await readJson(request);
      const project = await store.getProject(body.projectId, user.id);
      await store.requireThreadOwner(threadId, user.id, project.id);
      const turnId = validateId(body.turnId, "turnId");
      const runtime = threadState.get(threadId);
      if (runtime?.activeTurnId && runtime.activeTurnId !== turnId) {
        throw httpError(409, "当前执行任务已经变化，请刷新后重试。");
      }
      const goal = threadGoals.has(threadId) ? threadGoals.get(threadId) : await readThreadGoal(threadId);
      const goalPauseRequested = isActiveGoal(goal);
      const interruptRequest = codex.request("turn/interrupt", { threadId, turnId }, { timeoutMs: 8_000 });
      const goalPauseRequest = goalPauseRequested
        ? codex.request("thread/goal/set", { threadId, status: "paused" }, { timeoutMs: 8_000 }).then((result) => {
            threadGoals.set(threadId, result.goal);
            return result.goal;
          }).catch((error) => {
            process.stderr.write(`[web] 当前任务已请求停止，但目标暂停失败 (${threadId})：${error.message}\n`);
            broadcast(threadId, { method: "error", params: { threadId, message: `当前任务已请求停止，但目标暂停失败：${error.message}` } });
            return null;
          })
        : Promise.resolve(null);
      await interruptRequest;
      void goalPauseRequest.finally(() => {
        void advanceQueue(threadId).catch((error) => {
          process.stderr.write(`[web] 停止任务后的队列恢复失败 (${threadId})：${error.message}\n`);
        });
      });
      json(response, 202, { ok: true, turnId, goalPauseRequested });
    });

    application.post("/api/threads/:threadId/compact", async (request, response) => {
      const user = request.identity.user;
      const threadId = request.params.threadId;
      const body = await readJson(request);
      const project = await store.getProject(body.projectId, user.id);
      await store.requireThreadOwner(threadId, user.id, project.id);
      const loaded = await ensureThreadLoaded(threadId, project);
      const runtime = threadState.get(threadId);
      const activeTurn = activeTurnFromThread(loaded?.thread);
      if (runtime?.activeTurnId || isActiveThreadStatus(runtime?.status) || activeTurn) {
        throw httpError(409, "聊天正在执行，完成后才能压缩上下文。");
      }
      await codex.request("thread/compact/start", { threadId });
      json(response, 202, { ok: true });
    });

    application.post("/api/threads/:threadId/user-input/:requestId", async (request, response) => {
      const user = request.identity.user;
      const threadId = request.params.threadId;
      const body = await readJson(request);
      const project = await store.getProject(body.projectId, user.id);
      await store.requireThreadOwner(threadId, user.id, project.id);
      const pending = userInputRequests.get(request.params.requestId);
      if (!pending || pending.threadId !== threadId || pending.resolving) throw httpError(409, "这个问题已经结束。");
      const answers = validateUserInputAnswers(pending.questions, body.answers);
      pending.resolving = true;
      try {
        codex.respond(pending.codexRequestId, { answers });
        userInputRequests.delete(pending.requestId);
      } catch (error) {
        pending.resolving = false;
        throw error;
      }
      json(response, 200, { ok: true });
    });

    application.post("/api/threads/:threadId/approval/:requestId", async (request, response) => {
      const user = request.identity.user;
      const threadId = validateId(request.params.threadId, "threadId");
      const requestId = String(request.params.requestId || "");
      if (!requestId || requestId.length > 200) throw httpError(400, "requestId 无效。");
      const body = await readJson(request);
      const project = await store.getProject(body.projectId, user.id);
      await store.requireThreadOwner(threadId, user.id, project.id);
      const key = threadId + ":" + requestId;
      const pending = approvalRequests.get(key);
      if (!pending) throw httpError(409, "这个审批请求已经结束。");
      codex.respond(pending.codexRequestId, approvalResponse(pending, body.decision));
      approvalRequests.delete(key);
      json(response, 200, { ok: true });
    });
  
    application.get("/api/events", (request, response) => {
      return openEventStream(response, request.identity);
    });
  }
  
  async function listModels() {
    if (modelCache.expiresAt > Date.now()) return modelCache.data;
    if (modelRefreshPromise) return modelRefreshPromise;
    modelRefreshPromise = (async () => {
      try {
        const result = await codex.request("model/list", { includeHidden: true }, { timeoutMs: 15_000 });
        const data = (result?.data || []).filter((model) => !model.hidden || isMiniModel(model.id));
        if (!data.length) throw new Error("Codex App Server 返回了空模型目录。");
        modelCache = { expiresAt: Date.now() + MODEL_CACHE_TTL_MS, data };
        return data;
      } catch (error) {
        const usingFallback = !modelCache.data.length;
        const data = usingFallback ? [FALLBACK_MODEL] : modelCache.data;
        modelCache = { expiresAt: Date.now() + MODEL_FAILURE_RETRY_MS, data };
        process.stderr.write(`[web] 模型目录刷新失败，暂时使用${usingFallback ? " Terra Low" : "缓存"}：${error.message}\n`);
        return data;
      } finally {
        modelRefreshPromise = null;
      }
    })();
    return modelRefreshPromise;
  }
  
  async function readAccountRateLimits() {
    if (accountRateLimitsCache.expiresAt > Date.now() && accountRateLimitsCache.data) return accountRateLimitsCache.data;
    const data = await codex.request("account/rateLimits/read", undefined);
    accountRateLimitsCache = { expiresAt: Date.now() + 15_000, data };
    return data;
  }

  async function readThreadGoal(threadId) {
    const result = await codex.request("thread/goal/get", { threadId });
    const goal = result?.goal || null;
    threadGoals.set(threadId, goal);
    return goal;
  }

  function validateGoalPatch(threadId, candidate) {
    const params = { threadId };
    let changed = false;
    if (Object.hasOwn(candidate, "objective")) {
      params.objective = validateText(candidate.objective);
      changed = true;
    }
    if (Object.hasOwn(candidate, "status")) {
      if (!USER_GOAL_STATUSES.has(candidate.status)) throw httpError(400, "Goal 状态只能设为运行中或已暂停。");
      params.status = candidate.status;
      changed = true;
    }
    if (Object.hasOwn(candidate, "tokenBudget")) {
      const budget = candidate.tokenBudget;
      if (budget !== null && (!Number.isSafeInteger(budget) || budget <= 0)) {
        throw httpError(400, "Goal token 预算必须是正整数，或留空表示不限制。");
      }
      params.tokenBudget = budget;
      changed = true;
    }
    if (!changed) throw httpError(400, "没有需要修改的 Goal 内容。");
    return params;
  }
  
  async function listCodexThreadsAtPath(cwd) {
    const threads = [];
    let cursor;
    do {
      const result = await codex.request("thread/list", { cwd, limit: 100, ...(cursor ? { cursor } : {}) });
      threads.push(...(result.data || []));
      cursor = result.nextCursor || null;
    } while (cursor);
    return Promise.all(threads.map(resolveListedThreadName));
  }

  async function resolveListedThreadName(thread) {
    const listedName = normalizedThreadName(thread?.name);
    if (listedName) {
      effectiveThreadNames.set(thread.id, listedName);
      resolvedLegacyThreadNames.add(thread.id);
      return thread;
    }
    const cachedName = effectiveThreadNames.get(thread?.id);
    if (cachedName) return { ...thread, name: cachedName };
    if (thread?.historyMode !== "legacy" || resolvedLegacyThreadNames.has(thread.id)) return thread;
    resolvedLegacyThreadNames.add(thread.id);
    try {
      const canonical = (await codex.request("thread/read", { threadId: thread.id, includeTurns: false })).thread;
      const canonicalName = normalizedThreadName(canonical?.name);
      if (!canonicalName) return thread;
      effectiveThreadNames.set(thread.id, canonicalName);
      return { ...thread, name: canonicalName };
    } catch {
      resolvedLegacyThreadNames.delete(thread.id);
      return thread;
    }
  }

  function normalizedThreadName(value) {
    return typeof value === "string" ? value.trim() : "";
  }
  
  async function listProjectThreads(project, user) {
    const listedThreads = await listCodexThreadsAtPath(project.path);
    const ownedThreads = await store.bindProjectThreads(listedThreads, user.id, project.id);
    const listedIds = new Set(ownedThreads.map((thread) => thread.id));
    const relocatedThreads = await Promise.all(store.threadIdsForProject(project.id)
      .filter((threadId) => !listedIds.has(threadId))
      .map(async (threadId) => {
        try {
          return (await codex.request("thread/read", { threadId, includeTurns: false })).thread || null;
        } catch {
          return null;
        }
      }));
    ownedThreads.push(...relocatedThreads.filter(Boolean));
    return Promise.all(ownedThreads.map(async (thread) => {
      const [queueSnapshot, settings, goal] = await Promise.all([
        store.getQueueSnapshot(thread.id),
        store.getThreadSettings(thread.id, project.settings),
        readThreadGoal(thread.id),
      ]);
      const knownRuntime = threadState.get(thread.id);
      const storedActiveTurn = !knownRuntime?.activeTurnId && isActiveThreadStatus(thread.status)
        ? activeTurnFromMetrics(await store.getTurnMetrics(thread.id))
        : null;
      const runtime = updateThreadRuntime(thread.id, {
        projectId: project.id,
        status: thread.status || "idle",
        ...(storedActiveTurn ? { activeTurnId: storedActiveTurn.id, startedAt: storedActiveTurn.startedAt } : {}),
      });
      return {
        ...thread,
        accessedAt: store.threadAccess(user.id, thread.id),
        runtime,
        goal,
        queueCount: queueSnapshot.queue.length,
        queueRevision: queueSnapshot.queueRevision,
        settings,
      };
    }));
  }
  
  async function validateSettings(candidate = {}) {
    const requested = cleanSettings(candidate);
    if (requested.summary && !REASONING_SUMMARIES.has(requested.summary)) {
      throw httpError(400, "思路摘要档位无效。");
    }
    if (requested.collaborationMode && !COLLABORATION_MODES.has(requested.collaborationMode)) {
      throw httpError(400, "协作模式无效。");
    }
    if (requested.collaborationMode && !(await listCollaborationModes()).some((entry) => entry.mode === requested.collaborationMode)) {
      throw httpError(400, "当前 Codex 不支持所选协作模式。");
    }
    if (!requested.model) return requested;
    if (!modelCache.data.length) {
      // A model selected by the client does not need a catalog round-trip to
      // create a new thread. Validate against the catalog when it is cached,
      // while allowing compatible providers without model/list support to
      // start immediately.
      void listModels();
      return requested;
    }
    const model = (await modelsForSettings()).find((entry) => entry.id === requested.model);
    if (!model) throw httpError(400, "所选模型当前不可用。");
    if (requested.effort && !(model.supportedReasoningEfforts || []).some((entry) => entry.reasoningEffort === requested.effort)) {
      throw httpError(400, "该模型不支持所选推理深度。");
    }
    if (requested.serviceTier && !(model.serviceTiers || []).some((entry) => entry.id === requested.serviceTier)) {
      throw httpError(400, "该模型不支持所选服务档位。");
    }
    return requested;
  }

  async function listCollaborationModes() {
    if (collaborationModeCache.expiresAt > Date.now()) return collaborationModeCache.data;
    const result = await codex.request("collaborationMode/list", {});
    const modes = (result?.data || []).flatMap((entry) => {
      const mode = typeof entry?.mode === "string" ? entry.mode : "";
      if (!COLLABORATION_MODES.has(mode)) return [];
      return [{
        mode,
        model: typeof entry.model === "string" ? entry.model : null,
        reasoningEffort: typeof entry.reasoning_effort === "string" ? entry.reasoning_effort : null,
      }];
    });
    collaborationModeCache = { expiresAt: Date.now() + 30_000, data: modes };
    return modes;
  }

  async function collaborationModeForSettings(settings) {
    const requested = settings.collaborationMode || "default";
    const mode = (await listCollaborationModes()).find((entry) => entry.mode === requested);
    if (!mode) throw httpError(400, "当前 Codex 不支持所选协作模式。");
    const model = mode.model || settings.model;
    if (!model) throw httpError(400, "当前聊天没有可用模型。");
    return {
      mode: mode.mode,
      settings: {
        model,
        reasoning_effort: mode.reasoningEffort || settings.effort || null,
        developer_instructions: null,
      },
    };
  }

  async function scheduleThreadTitle(threadId, turns, { fullLegacyCheck = false } = {}) {
    const projectId = store.threadProjects[threadId];
    if (!projectId) return null;
    let titleTurns = turns;
    let legacyTurns = turns;
    if (fullLegacyCheck) {
      const canonical = (await codex.request("thread/read", { threadId, includeTurns: true })).thread;
      legacyTurns = canonical.turns || turns;
      if (!shouldGenerateThreadTitle(canonical, legacyTurns)) return null;
      titleTurns = legacyTurns;
    }
    const project = await store.getProject(projectId);
    const settings = await validateSettings(await store.getThreadSettings(threadId, project.settings));
    return threadTitles.schedule({
      threadId,
      cwd: project.path,
      turns: titleTurns,
      legacyTurns,
      settings,
    });
  }

  async function effectiveResumeSettings(threadId, project, requestedSettings = null) {
    const settings = cleanSettings(requestedSettings
      || await store.getThreadSettings(threadId, project.settings));
    if (settings.model && !modelCache.data.length) {
      // A configured model can be sent directly. Do not delay turn/start on
      // a catalog refresh that may be unsupported by a compatible provider.
      void listModels();
      return settings;
    }
    const resolved = resolveModelSettings(settings, await modelsForSettings());
    if (resolved.changed) await store.setThreadSettings(threadId, resolved.settings);
    return resolved.settings;
  }

  async function modelsForSettings() {
    return modelCache.data.length ? modelCache.data : listModels();
  }

  async function ensureThreadLoaded(threadId, project, requestedSettings = null) {
    const settings = await effectiveResumeSettings(threadId, project, requestedSettings);
    return codex.ensureLoaded(threadId, project, settings);
  }

  async function startCodexThread(project, settings) {
    const params = {
      cwd: project.path,
      config: { model_reasoning_summary: settings.summary || DEFAULT_REASONING_SUMMARY },
    };
    if (settings.model) params.model = settings.model;
    if (settings.serviceTier) params.serviceTier = settings.serviceTier;
    params.collaborationMode = await collaborationModeForSettings(settings);
    return codex.request("thread/start", params);
  }

  async function replaceMissingQueuedThread(oldThreadId, project, settings) {
    const result = await startCodexThread(project, settings);
    const newThreadId = validateId(result?.thread?.id, "替代 threadId");
    codex.markThreadLoaded(newThreadId);
    let migrated;
    try {
      migrated = await store.replaceMissingThread(oldThreadId, newThreadId, project.id);
    } catch (error) {
      codex.loadedThreads.delete(newThreadId);
      await codex.request("thread/delete", { threadId: newThreadId }, { timeoutMs: 10_000 }).catch(() => {});
      throw error;
    }

    const cachedName = effectiveThreadNames.get(oldThreadId);
    if (cachedName) {
      await codex.request("thread/name/set", { threadId: newThreadId, name: cachedName }).catch(() => {});
      effectiveThreadNames.set(newThreadId, cachedName);
    }
    effectiveThreadNames.delete(oldThreadId);
    resolvedLegacyThreadNames.delete(oldThreadId);
    forgetThreadRuntime(oldThreadId);

    const thread = {
      ...result.thread,
      ...(cachedName ? { name: cachedName } : {}),
      settings: migrated.settings,
      queueCount: migrated.queue.length,
      queueRevision: migrated.queueRevision,
      runtime: { projectId: project.id, activeTurnId: null, status: "idle" },
    };
    broadcastOwner(project.ownerId, {
      method: "thread/replaced",
      params: {
        threadId: oldThreadId,
        replacementThread: thread,
        queue: migrated.queue,
        queueRevision: migrated.queueRevision,
      },
    });
    process.stderr.write(`[web] 聊天 rollout 已丢失，已将队列迁移到替代聊天 (${oldThreadId} -> ${newThreadId})。\n`);
    return newThreadId;
  }
  
  async function advanceQueue(threadId) {
    if (queueAdvances.has(threadId)) return queueAdvances.get(threadId);
    const runner = (async () => {
      const timingStarted = performance.now();
      logTurnTiming(threadId, "queue-advance-start", timingStarted);
      const next = (await store.listQueue(threadId))[0];
      if (!next || queueSteerJobs.has(`${threadId}:${next.id}`)) return;
      const project = await store.getProject(next.projectId);
      await store.requireThreadOwner(threadId, project.ownerId, project.id);
      let settings;
      try {
        settings = await effectiveResumeSettings(threadId, project);
        logTurnTiming(threadId, "settings-resolved", timingStarted, { model: settings.model || null });
        const resumed = await codex.ensureLoaded(threadId, project, settings);
        logTurnTiming(threadId, "thread-resume-complete", timingStarted);
        const goal = threadGoals.has(threadId) ? threadGoals.get(threadId) : await readThreadGoal(threadId);
        if (isActiveGoal(goal)) return;
        const canonicalThread = resumed?.thread
          || (await codex.request("thread/read", { threadId, includeTurns: false })).thread;
        logTurnTiming(threadId, "thread-state-ready", timingStarted);
        const activeTurn = activeTurnFromThread(canonicalThread);
        if (activeTurn || isActiveThreadStatus(canonicalThread?.status)) {
          updateThreadRuntime(threadId, {
            projectId: project.id,
            status: canonicalThread.status,
            activeTurnId: activeTurn?.id || null,
            startedAt: timestampMilliseconds(activeTurn?.startedAt) || Date.now(),
          });
          return;
        }
        updateThreadRuntime(threadId, { projectId: project.id, status: canonicalThread?.status || "idle" });
        const params = {
          threadId,
          clientUserMessageId: next.id,
          input: [{ type: "text", text: next.text }],
        };
        if (settings.model) params.model = settings.model;
        if (settings.effort) params.effort = settings.effort;
        if (settings.serviceTier) params.serviceTier = settings.serviceTier;
        params.summary = settings.summary || DEFAULT_REASONING_SUMMARY;
        params.collaborationMode = await collaborationModeForSettings(settings);
        const result = await codex.request("turn/start", params);
        logTurnTiming(threadId, "turn-start-response", timingStarted, { turnId: result.turn.id });
        updateThreadRuntime(threadId, {
          projectId: project.id,
          activeTurnId: result.turn.id,
          status: "running",
          startedAt: timestampMilliseconds(result.turn.startedAt) || Date.now(),
        });
        broadcast(threadId, {
          method: "item/completed",
          params: {
            threadId,
            turnId: result.turn.id,
            item: { id: next.id, type: "userMessage", content: [{ type: "text", text: next.text }], clientPending: true },
          },
        });
        if (typeof canonicalThread?.name !== "string" || !canonicalThread.name.trim()) {
          const titleTurn = {
            id: result.turn.id,
            items: [{ id: next.id, type: "userMessage", content: [{ type: "text", text: next.text }] }],
          };
          void scheduleThreadTitle(threadId, [titleTurn]).catch((error) => {
            process.stderr.write(`[web] 无法自动生成聊天名称 (${threadId})：${error.message}\n`);
          });
        }
        await store.completeQueueItem(threadId, next.id);
        broadcastQueue(threadId);
      } catch (error) {
        if (isMissingRolloutError(error)) {
          try {
            const replacementThreadId = await replaceMissingQueuedThread(threadId, project, settings || {});
            await advanceQueue(replacementThreadId);
          } catch (recoveryError) {
            process.stderr.write(`[web] 丢失聊天的队列恢复失败 (${threadId})：${recoveryError.message}\n`);
            broadcastOwner(project.ownerId, { method: "queue/error", params: { threadId, message: recoveryError.message } });
          }
          return;
        }
        process.stderr.write(`[web] 队列启动失败 (${threadId})：${error.message}\n`);
        broadcast(threadId, { method: "queue/error", params: { threadId, message: error.message } });
      }
    })();
    queueAdvances.set(threadId, runner);
    try {
      await runner;
    } finally {
      queueAdvances.delete(threadId);
    }
  }
  
  async function steerQueuedItem({ threadId, itemId, expectedTurnId, project }) {
    const key = `${threadId}:${itemId}`;
    if (queueSteerJobs.has(key)) return queueSteerJobs.get(key);
    const job = (async () => {
      const item = await store.getQueueItem(threadId, itemId);
      if (item.projectId !== project.id) throw httpError(409, "排队任务与当前项目不一致。");
      const runtime = threadState.get(threadId);
      if (runtime?.activeTurnId && runtime.activeTurnId !== expectedTurnId) {
        throw httpError(409, "当前执行任务已经变化，请刷新后重试。");
      }
      await ensureThreadLoaded(threadId, project);
      await codex.request("turn/steer", {
        threadId,
        clientUserMessageId: item.id,
        expectedTurnId,
        input: [{ type: "text", text: item.text }],
      }, { timeoutMs: 10_000 });
      await store.completeQueueItem(threadId, itemId);
      const snapshot = await store.getQueueSnapshot(threadId);
      broadcastQueue(threadId);
      return {
        ...snapshot,
        turnId: expectedTurnId,
        item: { id: item.id, clientId: item.id, type: "userMessage", content: [{ type: "text", text: item.text }], clientPending: true },
      };
    })();
    queueSteerJobs.set(key, job);
    try {
      return await job;
    } finally {
      queueSteerJobs.delete(key);
    }
  }
  
  async function recoverPersistedQueues() {
    const threadIds = await store.listQueuedThreadIds();
    if (!threadIds.length) return;
    process.stderr.write(`[web] 正在恢复 ${threadIds.length} 个聊天的持久化队列。\n`);
    await Promise.all(threadIds.map((threadId) => advanceQueue(threadId)));
  }

  function updateThreadRuntime(threadId, patch) {
    const next = { ...(threadState.get(threadId) || {}), ...patch };
    if (Object.hasOwn(patch, "status")) {
      if (isActiveThreadStatus(next.status)) {
        next.startedAt = timestampMilliseconds(next.startedAt) || Date.now();
        threadState.set(threadId, next);
      } else {
        next.activeTurnId = null;
        next.startedAt = null;
        threadState.delete(threadId);
      }
    } else if (threadState.has(threadId)) {
      threadState.set(threadId, next);
    }
    return next;
  }

  function logTurnTiming(threadId, phase, startedAt, details = {}) {
    if (!threadId) return;
    const elapsedMs = typeof startedAt === "number" ? Math.round(performance.now() - startedAt) : null;
    const fields = [`threadId=${threadId}`, `phase=${phase}`];
    if (elapsedMs !== null) fields.push(`elapsedMs=${elapsedMs}`);
    for (const [key, value] of Object.entries(details)) {
      if (value !== null && value !== undefined && value !== "") fields.push(`${key}=${String(value)}`);
    }
    process.stderr.write(`[timing] ${new Date().toISOString()} ${fields.join(" ")}\n`);
  }
  
  function projectHasActiveThread(projectId) {
    const hasActiveTurn = [...threadState.values()].some((runtime) => runtime.projectId === projectId
      && (runtime.activeTurnId || isActiveThreadStatus(runtime.status)));
    if (hasActiveTurn) return true;
    return [...threadGoals].some(([threadId, goal]) => isActiveGoal(goal)
      && store.threadProjects[threadId] === projectId);
  }
  
  function forgetProjectRuntime(projectId, boundThreadIds) {
    const threadIds = new Set(boundThreadIds);
    for (const [threadId, runtime] of threadState) if (runtime.projectId === projectId) threadIds.add(threadId);
    for (const threadId of threadIds) forgetThreadRuntime(threadId);
  }
  
  function forgetThreadRuntime(threadId) {
    discardCommandOutputBatches(threadId);
    threadState.delete(threadId);
    threadTokenUsage.delete(threadId);
    threadGoals.delete(threadId);
    codex.loadedThreads.delete(threadId);
  }
  
  function activeTurnFromThread(thread) {
    const turns = Array.isArray(thread?.turns) ? thread.turns : [];
    for (let index = turns.length - 1; index >= 0; index--) {
      if (isActiveThreadStatus(turns[index]?.status)) return turns[index];
    }
    return null;
  }
  
  function activeTurnFromMetrics(metrics) {
    const turns = Object.entries(metrics || {});
    for (let index = turns.length - 1; index >= 0; index--) {
      const [id, metric] = turns[index];
      const startedAt = timestampMilliseconds(metric?.startedAt);
      if (startedAt && !timestampMilliseconds(metric?.completedAt)) return { id, startedAt };
    }
    return null;
  }
  
  function timestampCodexNotification(message, receivedAt) {
    const params = { ...(message.params || {}), serverReceivedAt: receivedAt };
    if (message.method === "turn/started") {
      params.turn = { ...(params.turn || {}), startedAt: timestampMilliseconds(params.turn?.startedAt) || receivedAt };
    } else if (message.method === "turn/completed") {
      params.turn = { ...(params.turn || {}), completedAt: timestampMilliseconds(params.turn?.completedAt) || receivedAt };
    } else if (message.method === "item/started") {
      params.startedAtMs = timestampMilliseconds(params.startedAtMs) || timestampMilliseconds(params.item?.startedAt) || receivedAt;
    } else if (message.method === "item/completed") {
      params.completedAtMs = timestampMilliseconds(params.completedAtMs) || timestampMilliseconds(params.item?.completedAt) || receivedAt;
    } else if (["item/fileChange/patchUpdated", "item/commandExecution/outputDelta"].includes(message.method)) {
      params.startedAtMs = receivedAt;
    } else if (message.method === "thread/status/changed") {
      params.changedAtMs = receivedAt;
    }
    return { ...message, params };
  }
  
  async function persistNotificationTiming(message) {
    const params = message.params || {};
    const threadId = params.threadId;
    if (!threadId) return;
    if (message.method === "item/commandExecution/outputDelta") {
      const turnId = params.turnId;
      const itemId = params.itemId || params.item?.id;
      const output = commandOutputTails.get(commandOutputKey(params));
      if (!turnId || !itemId || !output) return;
      const storedMetrics = await store.getTurnMetrics(threadId, [turnId]);
      const current = storedMetrics?.[turnId]?.items?.[itemId]?.snapshot || {};
      await store.recordItemMetric(threadId, turnId, itemId, {
        type: "commandExecution",
        snapshot: {
          ...current,
          id: itemId,
          type: "commandExecution",
          aggregatedOutput: output.text,
          ...(output.truncated ? { outputTruncated: true } : {}),
        },
      });
      return;
    }
    if (message.method === "turn/started") {
      await store.recordTurnMetric(threadId, params.turn?.id, {
        startedAt: timestampMilliseconds(params.turn?.startedAt),
      });
      return;
    }
    if (message.method === "turn/plan/updated") {
      await store.recordTurnPlan(threadId, params.turnId, turnPlanSnapshot(params));
      return;
    }
    if (message.method === "turn/completed") {
      await store.recordTurnMetric(threadId, params.turn?.id, {
        startedAt: timestampMilliseconds(params.turn?.startedAt),
        completedAt: timestampMilliseconds(params.turn?.completedAt),
        durationMs: params.turn?.durationMs,
      });
      return;
    }
    if (message.method === "item/started") {
      await store.recordItemMetric(threadId, params.turnId, params.item?.id, {
        type: params.item?.type,
        startedAt: timestampMilliseconds(params.startedAtMs),
        snapshot: commandExecutionSnapshot(params.item),
      });
      return;
    }
    if (message.method === "item/completed") {
      const outputKey = commandOutputKey(params);
      const output = commandOutputTails.get(outputKey);
      const item = output && params.item?.type === "commandExecution"
        ? {
            ...params.item,
            aggregatedOutput: params.item.aggregatedOutput || output.text,
            outputTruncated: params.item.outputTruncated || output.truncated,
          }
        : params.item;
      await store.recordItemMetric(threadId, params.turnId, params.item?.id, {
        type: item?.type,
        completedAt: timestampMilliseconds(params.completedAtMs),
        durationMs: item?.durationMs,
        snapshot: commandExecutionSnapshot(item),
      });
      commandOutputTails.delete(outputKey);
    }
  }
  
  async function projectFromQuery(url, ownerId) {
    return store.getProject(validateId(url.searchParams.get("projectId"), "projectId"), ownerId);
  }
  
  function broadcastQueue(threadId) {
    void store.getQueueSnapshot(threadId).then((snapshot) => broadcast(threadId, { method: "queue/updated", params: { threadId, ...snapshot } }));
  }
  
  function broadcast(threadId, message, eventName = "codex") {
    const projectId = store.threadProjects[threadId];
    const ownerId = store.projects.find((project) => project.id === projectId)?.ownerId;
    if (!ownerId) return;
    for (const client of eventClients) {
      if (client.userId !== ownerId) continue;
      writeEvent(client, `event: ${eventName}\ndata: ${JSON.stringify(message)}\n\n`);
    }
  }

  function broadcastServer(message) {
    for (const client of eventClients) {
      writeEvent(client, `event: server\ndata: ${JSON.stringify(message)}\n\n`);
    }
  }

  function broadcastOwner(ownerId, message, eventName = "codex") {
    for (const client of eventClients) {
      if (client.userId !== ownerId) continue;
      writeEvent(client, `event: ${eventName}\ndata: ${JSON.stringify(message)}\n\n`);
    }
  }

  function writeEvent(client, payload) {
    const { response } = client;
    if (response.writableEnded || response.destroyed) {
      eventClients.delete(client);
      return false;
    }
    if (response.writableLength >= MAX_EVENT_STREAM_BUFFER) {
      eventClients.delete(client);
      response.destroy();
      return false;
    }
    response.write(payload);
    if (response.writableLength < MAX_EVENT_STREAM_BUFFER) return true;
    eventClients.delete(client);
    response.destroy();
    return false;
  }

  function publicUserInputRequest(request) {
    return {
      requestId: request.requestId,
      threadId: request.threadId,
      turnId: request.turnId,
      itemId: request.itemId,
      autoResolutionMs: request.autoResolutionMs,
      questions: request.questions,
    };
  }

  function publicApprovalRequest(request) {
    return {
      ...request.params,
      requestId: request.requestId,
      method: request.method,
    };
  }
  
  async function openEventStream(response, identity) {
    const user = identity.user;
    response.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    response.write("retry: 2000\n\n");
    const client = { response, userId: user.id };
    eventClients.add(client);
    const expiryTimer = setTimeout(
      () => response.end(),
      Math.max(1, Math.min(SESSION_TIMER_MAX_MS, identity.session.expiresAt - Date.now())),
    );
    writeEvent(client, `event: server\ndata: ${JSON.stringify({ status: codex.state })}\n\n`);
    void sendInitialWorkspaceState(client, user.id).catch((error) => {
      process.stderr.write(`[web] 无法同步实时工作区状态：${error.message}\n`);
    });
    const heartbeat = setInterval(() => {
      if (!response.writableEnded && !response.destroyed) {
        writeEvent(client, `event: heartbeat\ndata: ${Date.now()}\n\n`);
      }
    }, 25_000);
    response.on("close", () => {
      clearInterval(heartbeat);
      clearTimeout(expiryTimer);
      eventClients.delete(client);
    });
  }

  async function sendInitialWorkspaceState(client, userId) {
    const { response } = client;
    const threadIds = new Set([
      ...threadState.keys(),
      ...threadGoals.keys(),
      ...await store.listQueuedThreadIds(),
      ...[...userInputRequests.values()].map((request) => request.threadId),
    ]);
    for (const threadId of threadIds) {
      const projectId = store.threadProjects[threadId];
      const ownerId = store.projects.find((project) => project.id === projectId)?.ownerId;
      if (ownerId !== userId) continue;
      const [snapshot, metrics] = await Promise.all([store.getQueueSnapshot(threadId), store.getTurnMetrics(threadId)]);
      if (response.writableEnded || response.destroyed) return;
      const runtime = threadState.get(threadId) || null;
      const activeTurn = metrics?.[runtime?.activeTurnId];
      if (!writeEvent(client, `event: codex\ndata: ${JSON.stringify({
        method: "workspace/state",
        params: {
          threadId,
          ...snapshot,
          runtime,
          ...(threadGoals.has(threadId) ? { goal: threadGoals.get(threadId) } : {}),
          activeItems: activeExecutionSnapshots(activeTurn, runtime?.activeTurnId),
          activePlan: activeTurn?.plan || null,
          userInputRequests: [...userInputRequests.values()]
            .filter((entry) => entry.threadId === threadId)
            .map(publicUserInputRequest),
          approvalRequests: [...approvalRequests.values()]
            .filter((entry) => entry.threadId === threadId)
            .map(publicApprovalRequest),
        },
      })}\n\n`)) return;
    }
  }
  
  function closeUserEventStreams(userId) {
    for (const client of eventClients) {
      if (client.userId === userId) client.response.end();
    }
  }
  
  async function loadThreadPage(threadId, searchParams) {
    const limit = historyPageLimit(searchParams);
    const cursor = searchParams.get("before");
    try {
      const [metadata, page] = await Promise.all([
        codex.request("thread/read", { threadId, includeTurns: false }),
        codex.request("thread/turns/list", {
          threadId,
          limit,
          sortDirection: "desc",
          itemsView: "full",
          ...(cursor ? { cursor } : {}),
        }),
      ]);
      const turns = (Array.isArray(page?.data) ? page.data : [])
        .slice()
        .reverse()
        .map(compactHistoryTurn);
      return {
        thread: { ...metadata.thread, turns },
        history: {
          turns,
          hasMore: Boolean(page?.nextCursor),
          before: page?.nextCursor || null,
          totalTurns: null,
        },
        allTurns: turns,
      };
    } catch (error) {
      if (!isUnsupportedTurnsListError(error)) throw error;
      const result = await codex.request("thread/read", { threadId, includeTurns: true });
      const allTurns = result.thread.turns || [];
      const history = paginateTurns(allTurns, searchParams);
      return {
        thread: { ...result.thread, turns: history.turns.map(compactHistoryTurn) },
        history,
        allTurns,
      };
    }
  }

  function historyPageLimit(searchParams) {
    const rawLimit = Number(searchParams.get("limit") || DEFAULT_HISTORY_PAGE_SIZE);
    if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > MAX_HISTORY_PAGE_SIZE) {
      throw httpError(400, `聊天历史每页数量必须是 1 到 ${MAX_HISTORY_PAGE_SIZE}。`);
    }
    return rawLimit;
  }

  function isUnsupportedTurnsListError(error) {
    const message = String(error?.message || "").toLowerCase();
    return message.includes("unknown method thread/turns/list")
      || message.includes("thread/turns/list is not supported")
      || message.includes("method not found")
      || (message.includes("thread/turns/list") && (message.includes("unsupported") || message.includes("unavailable")));
  }

  function paginateTurns(turns, searchParams) {
    const rawLimit = historyPageLimit(searchParams);
    const before = searchParams.get("before");
    let end = turns.length;
    if (before) {
      end = turns.findIndex((turn) => turn.id === before);
      if (end < 0) throw httpError(409, "聊天历史位置已经变化，请重新打开聊天。");
    }
    const start = Math.max(0, end - rawLimit);
    const page = turns.slice(start, end);
    return {
      turns: page,
      hasMore: start > 0,
      before: page[0]?.id || null,
      totalTurns: turns.length,
    };
  }

  function compactNotification(message) {
    const item = compactHistoryItem(message.params?.item);
    if (item === message.params?.item) return message;
    return { ...message, params: { ...message.params, item } };
  }

  function approvalResponse(request, value) {
    if (request.method === "item/permissions/requestApproval") {
      if (value === "accept" || value === "acceptForSession") {
        return {
          permissions: request.params.permissions || {},
          scope: value === "acceptForSession" ? "session" : "turn",
        };
      }
      if (value === "decline" || value === "cancel") return { permissions: {} };
      throw httpError(400, "权限审批决定无效。");
    }
    if (typeof value === "string" && ["accept", "acceptForSession", "decline", "cancel"].includes(value)) return { decision: value };
    if (value && typeof value === "object" && Object.hasOwn(value, "acceptWithExecpolicyAmendment")) return { decision: value };
    if (value && typeof value === "object" && Object.hasOwn(value, "applyNetworkPolicyAmendment")) return { decision: value };
    throw httpError(400, "审批决定无效。");
  }

  function compactHistoryTurn(turn) {
    return { ...turn, items: (turn.items || []).map(compactHistoryItem) };
  }

  function compactHistoryItem(item) {
    if (item?.type !== "mcpToolCall") return item;
    const detail = executionItemText(item);
    const displayText = detail.length > MAX_HISTORY_TOOL_DETAIL
      ? `${detail.slice(0, MAX_HISTORY_TOOL_DETAIL)}\n\n…后面的内容已截断显示`
      : detail;
    const { arguments: discardedArguments, result: discardedResult, error: discardedError, ...summary } = item;
    return {
      ...summary,
      displayText,
      ...(discardedError ? { error: true } : {}),
    };
  }

  function closeEventStreams() {
    discardCommandOutputBatches();
    for (const client of eventClients) client.response.end();
    eventClients.clear();
  }

  function normalizeUserInputQuestions(questions) {
    if (!Array.isArray(questions) || questions.length < 1 || questions.length > 3) {
      throw new Error("Codex 提问数量必须是 1 到 3 个。");
    }
    const ids = new Set();
    return questions.map((question) => {
      const id = typeof question?.id === "string" ? question.id.trim() : "";
      const header = typeof question?.header === "string" ? question.header.trim() : "";
      const text = typeof question?.question === "string" ? question.question.trim() : "";
      if (!id || !header || !text || ids.has(id)) throw new Error("Codex 返回了无效的提问内容。");
      ids.add(id);
      const options = question.options == null ? [] : question.options.map((option) => ({
        label: typeof option?.label === "string" ? option.label.trim() : "",
        description: typeof option?.description === "string" ? option.description.trim() : "",
      }));
      if (options.some((option) => !option.label || !option.description)) throw new Error("Codex 返回了无效的提问选项。");
      return {
        id,
        header,
        question: text,
        options,
        isOther: question.isOther === true,
        isSecret: question.isSecret === true,
      };
    });
  }

  function validateUserInputAnswers(questions, candidate) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw httpError(400, "请回答全部问题。");
    const questionIds = new Set(questions.map((question) => question.id));
    if (Object.keys(candidate).some((id) => !questionIds.has(id))) throw httpError(400, "回答中包含未知问题。");
    return Object.fromEntries(questions.map((question) => {
      const values = candidate[question.id]?.answers;
      if (!Array.isArray(values) || values.length !== 1 || typeof values[0] !== "string" || !values[0].trim()) {
        throw httpError(400, `请回答“${question.header}”。`);
      }
      const answer = values[0].trim();
      const optionLabels = new Set(question.options.map((option) => option.label));
      if (optionLabels.size && !question.isOther && !optionLabels.has(answer)) {
        throw httpError(400, `“${question.header}”的回答不在可选范围内。`);
      }
      return [question.id, { answers: [answer] }];
    }));
  }

  return {
    closeEventStreams,
    closeUserEventStreams,
    forgetProject: forgetProjectRuntime,
    listProjectThreads,
    projectHasActiveThread,
    registerRoutes,
    validateSettings,
  };
}

export function resolveModelSettings(candidate = {}, models = []) {
  const settings = cleanSettings(candidate);
  const available = Array.isArray(models) ? models.filter((model) => model?.id) : [];
  const current = available.find((model) => model.id === settings.model);
  if (current) {
    const efforts = current.supportedReasoningEfforts || [];
    const effortSupported = !settings.effort || efforts.some((entry) => entry.reasoningEffort === settings.effort);
    const tiers = current.serviceTiers || [];
    const tierSupported = !settings.serviceTier || tiers.some((entry) => entry.id === settings.serviceTier);
    if (effortSupported && tierSupported) return { settings, changed: false };
    return {
      settings: {
        ...settings,
        effort: effortSupported ? settings.effort : current.defaultReasoningEffort || null,
        serviceTier: tierSupported ? settings.serviceTier : null,
      },
      changed: true,
    };
  }
  const fallback = available.find((model) => model.id === FALLBACK_MODEL_ID)
    || available.find((model) => model.isDefault)
    || available[0]
    || FALLBACK_MODEL;
  const fallbackEfforts = fallback.supportedReasoningEfforts || [];
  const effort = fallbackEfforts.some((entry) => entry.reasoningEffort === FALLBACK_REASONING_EFFORT)
    ? FALLBACK_REASONING_EFFORT
    : fallback.defaultReasoningEffort || fallbackEfforts[0]?.reasoningEffort || null;
  return {
    settings: { ...settings, model: fallback.id, effort, serviceTier: null },
    changed: true,
  };
}

export function isMissingRolloutError(error) {
  return /no rollout found for thread id/i.test(String(error?.message || ""));
}

async function visualizationFilePath(value, { projectRoot = null, allowAnyLocalFile = false } = {}) {
  if (typeof value !== "string" || !value.trim() || !isAbsolute(value.trim())) throw httpError(400, "可视化路径无效。");
  const extension = extname(value.trim()).toLowerCase();
  if (extension !== ".html" && extension !== ".htm") throw httpError(400, "可视化文件必须是 HTML。");
  let temporaryRoot;
  let filePath;
  try {
    temporaryRoot = await realpath(tmpdir());
    filePath = await realpath(resolve(value.trim()));
  } catch (error) {
    if (error.code === "ENOENT") throw httpError(404, "可视化文件不存在或已经清理。");
    throw error;
  }
  if (allowAnyLocalFile) return filePath;

  if (projectRoot) {
    const resolvedProjectRoot = await realpath(projectRoot);
    const projectRelativePath = relative(resolvedProjectRoot, filePath);
    if (projectRelativePath && projectRelativePath !== ".." && !projectRelativePath.startsWith(`..${sep}`) && !isAbsolute(projectRelativePath)) {
      return filePath;
    }
  }
  const relativePath = relative(temporaryRoot, filePath);
  const firstSegment = relativePath.split(sep)[0];
  if (!relativePath || relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath) || !/^codex-[^\\/]+$/i.test(firstSegment)) {
    throw httpError(403, "只能查看当前项目内或 Codex 临时目录中的可视化文件。");
  }
  return filePath;
}

function visualizationDocument(contents) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/visualization.css"></head><body>${contents}</body></html>`;
}
