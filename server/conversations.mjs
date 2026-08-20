import { randomUUID } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import { MAX_SAVED_COMMAND_OUTPUT, activeExecutionSnapshots, commandExecutionSnapshot, commandOutputTail, executionItemText } from "../public/execution-events.js";
import { timestampMilliseconds } from "../public/elapsed-time.js";
import { isActiveThreadStatus } from "../public/workspace.js";
import { turnPlanSnapshot } from "../public/plan.js";
import { isActiveGoal } from "../public/goal.js";
import { json, readJson, validateId, validateText } from "./http.mjs";
import { createThreadTitleService, shouldGenerateThreadTitle } from "./thread-titles.mjs";
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

export function createConversations({ store, codex }) {
  const threadTitles = createThreadTitleService({ codex });
  const eventClients = new Set();
  const commandOutputBatches = new Map();
  const commandOutputTails = new Map();
  const threadState = new Map();
  const queueAdvances = new Map();
  const queueSteerJobs = new Map();
  const threadTokenUsage = new Map();
  const threadGoals = new Map();
  const userInputRequests = new Map();
  const MAX_THREAD_TOKEN_USAGE = 300;
  const DEFAULT_REASONING_SUMMARY = "detailed";
  const REASONING_SUMMARIES = new Set(["auto", "concise", "detailed", "none"]);
  const COLLABORATION_MODES = new Set(["default", "plan"]);
  const USER_GOAL_STATUSES = new Set(["active", "paused"]);
  const DEFAULT_HISTORY_PAGE_SIZE = 12;
  const MAX_HISTORY_PAGE_SIZE = 40;
  let modelCache = { expiresAt: 0, data: [] };
  let collaborationModeCache = { expiresAt: 0, data: [] };
  let accountRateLimitsCache = { expiresAt: 0, data: null };
  codex.events.on("notification", (message) => {
    if (message.method === "account/rateLimits/updated") accountRateLimitsCache.expiresAt = 0;
    if (message.method === "serverRequest/resolved") userInputRequests.delete(String(message.params?.requestId));
    const threadId = message.params?.threadId;
    if (!threadId) return;
    if (message.method === "item/commandExecution/outputDelta") {
      queueCommandOutput(message);
      return;
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
      });
    }
    if (message.method === "turn/completed") {
      runtime = updateThreadRuntime(threadId, { projectId, activeTurnId: null, status: "idle", startedAt: null });
      void advanceQueue(threadId);
      void scheduleThreadTitle(threadId, [message.params.turn], { fullLegacyCheck: true }).catch((error) => {
        process.stderr.write(`[web] 无法自动生成聊天名称 (${threadId})：${error.message}\n`);
      });
    }
    if (message.method === "thread/status/changed") {
      runtime = updateThreadRuntime(threadId, { projectId, status: message.params.status });
      if (!isActiveThreadStatus(message.params.status)) void advanceQueue(threadId);
    }
    if (["turn/started", "turn/completed", "thread/status/changed"].includes(message.method)) {
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
      const params = { cwd: project.path, config: { model_reasoning_summary: settings.summary || DEFAULT_REASONING_SUMMARY } };
      if (settings.model) params.model = settings.model;
      if (settings.serviceTier) params.serviceTier = settings.serviceTier;
      const collaborationMode = await collaborationModeForSettings(settings);
      if (collaborationMode) params.collaborationMode = collaborationMode;
      const result = await codex.request("thread/start", params);
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
  
    application.get("/api/threads/:threadId", async (request, response) => {
      const user = request.identity.user;
      const threadId = request.params.threadId;
      const project = await projectFromQuery(request.codexUrl, user.id);
      await store.requireThreadOwner(threadId, user.id, project.id);
      if (request.codexUrl.searchParams.get("history") === "none") {
        const accessedAt = await store.recordThreadAccess(user.id, threadId, { deferred: true });
        return json(response, 200, { accessedAt });
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

    application.get("/api/threads/:threadId/visualization", async (request, response) => {
      const user = request.identity.user;
      const threadId = validateId(request.params.threadId, "threadId");
      const projectId = validateId(request.codexUrl.searchParams.get("projectId"), "项目 ID");
      await store.requireThreadOwner(threadId, user.id, projectId);
      const filePath = await visualizationFilePath(request.codexUrl.searchParams.get("path"));
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
        await codex.ensureLoaded(request.params.threadId, project);
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
      await codex.ensureLoaded(threadId, project);
      const thread = (await codex.request("thread/read", { threadId, includeTurns: true })).thread;
      const settings = await validateSettings(await store.getThreadSettings(threadId, project.settings));
      const collaborationMode = await collaborationModeForSettings({ ...settings, collaborationMode: "default" });
      const name = await threadTitles.suggest({
        cwd: project.path,
        turns: thread.turns || [],
        settings,
        collaborationMode,
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
      await codex.ensureLoaded(threadId, project);
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
        item: { id: messageId, type: "userMessage", content: [{ type: "text", text }], clientPending: true },
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
      const loaded = await codex.ensureLoaded(threadId, project);
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
  
    application.get("/api/events", (request, response) => {
      return openEventStream(response, request.identity);
    });
  }
  
  async function listModels() {
    if (modelCache.expiresAt > Date.now()) return modelCache.data;
    const result = await codex.request("model/list", {});
    modelCache = { expiresAt: Date.now() + 30_000, data: result.data.filter((model) => !model.hidden) };
    return modelCache.data;
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
    return threads;
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
    const model = (await listModels()).find((entry) => entry.id === requested.model);
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
    let legacyTurns = turns;
    if (fullLegacyCheck) {
      const canonical = (await codex.request("thread/read", { threadId, includeTurns: true })).thread;
      legacyTurns = canonical.turns || turns;
      if (!shouldGenerateThreadTitle(canonical, legacyTurns)) return null;
    }
    const project = await store.getProject(projectId);
    const settings = await validateSettings(await store.getThreadSettings(threadId, project.settings));
    const collaborationMode = await collaborationModeForSettings({ ...settings, collaborationMode: "default" });
    return threadTitles.schedule({
      threadId,
      cwd: project.path,
      turns,
      legacyTurns,
      settings,
      collaborationMode,
    });
  }
  
  async function advanceQueue(threadId) {
    if (queueAdvances.has(threadId)) return queueAdvances.get(threadId);
    const runner = (async () => {
      const next = (await store.listQueue(threadId))[0];
      if (!next || queueSteerJobs.has(`${threadId}:${next.id}`)) return;
      const project = await store.getProject(next.projectId);
      await store.requireThreadOwner(threadId, project.ownerId, project.id);
      try {
        const resumed = await codex.ensureLoaded(threadId, project);
        const goal = threadGoals.has(threadId) ? threadGoals.get(threadId) : await readThreadGoal(threadId);
        if (isActiveGoal(goal)) return;
        const canonicalThread = resumed?.thread
          || (await codex.request("thread/read", { threadId, includeTurns: false })).thread;
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
        const settings = await validateSettings(await store.getThreadSettings(threadId, project.settings));
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
        await store.completeQueueItem(threadId, next.id);
        broadcastQueue(threadId);
      } catch (error) {
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
      await codex.ensureLoaded(threadId, project);
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
        item: { id: item.id, type: "userMessage", content: [{ type: "text", text: item.text }], clientPending: true },
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
    const params = { ...(message.params || {}) };
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
      client.response.write(`event: ${eventName}\ndata: ${JSON.stringify(message)}\n\n`);
    }
  }

  function broadcastServer(message) {
    for (const client of eventClients) {
      client.response.write(`event: server\ndata: ${JSON.stringify(message)}\n\n`);
    }
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
    response.write(`event: server\ndata: ${JSON.stringify({ status: codex.state })}\n\n`);
    void sendInitialWorkspaceState(response, user.id).catch((error) => {
      process.stderr.write(`[web] 无法同步实时工作区状态：${error.message}\n`);
    });
    const heartbeat = setInterval(() => {
      if (!response.writableEnded && !response.destroyed) {
        response.write(`event: heartbeat\ndata: ${Date.now()}\n\n`);
      }
    }, 25_000);
    response.on("close", () => {
      clearInterval(heartbeat);
      clearTimeout(expiryTimer);
      eventClients.delete(client);
    });
  }

  async function sendInitialWorkspaceState(response, userId) {
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
      response.write(`event: codex\ndata: ${JSON.stringify({
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
        },
      })}\n\n`);
    }
  }
  
  function closeUserEventStreams(userId) {
    for (const client of eventClients) {
      if (client.userId === userId) client.response.end();
    }
  }
  
  async function loadThreadPage(threadId, searchParams) {
    const result = await codex.request("thread/read", { threadId, includeTurns: true });
    const allTurns = result.thread.turns || [];
    const history = paginateTurns(allTurns, searchParams);
    return {
      thread: { ...result.thread, turns: history.turns.map(compactHistoryTurn) },
      history,
      allTurns,
    };
  }
  
  function paginateTurns(turns, searchParams) {
    const rawLimit = Number(searchParams.get("limit") || DEFAULT_HISTORY_PAGE_SIZE);
    if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > MAX_HISTORY_PAGE_SIZE) {
      throw httpError(400, `聊天历史每页数量必须是 1 到 ${MAX_HISTORY_PAGE_SIZE}。`);
    }
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

async function visualizationFilePath(value) {
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
  const relativePath = relative(temporaryRoot, filePath);
  const firstSegment = relativePath.split(sep)[0];
  if (!relativePath || relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath) || !/^codex-[^\\/]+$/i.test(firstSegment)) {
    throw httpError(403, "只能查看 Codex 生成的临时可视化文件。");
  }
  return filePath;
}

function visualizationDocument(contents) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/visualization.css"></head><body>${contents}</body></html>`;
}
