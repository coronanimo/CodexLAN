import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { extname } from "node:path";
import { httpError, cleanSettings, mergeSettings } from "../../workspace-store.mjs";
import { validateText, validateId } from "../../http.mjs";
import { createThreadTitleService } from "../../thread-titles.mjs";
import { commandExecutionSnapshot } from "../../core/persistence-values.mjs";
import { NativeProjection } from "./native-projection.mjs";
import { CodexHistory } from "./history.mjs";
import { CodexCatalog } from "./catalog.mjs";
import { CodexConfiguration } from "./configuration.mjs";
import { CodexRequests } from "./requests.mjs";
import { PresentationBatcher } from "./presentation-batcher.mjs";
import { CodexUsage } from "./usage.mjs";
import { running, milliseconds, questionsFromItem, asyncAnswer, answeredIds } from "./protocol-values.mjs";
import { AgentOperationError } from "../operation-error.mjs";

export function createCodexAdapter({ connection, store, autoApprove = false, autoApproveBrowser = false }) {
  const projection = new NativeProjection(), batcher = new PresentationBatcher(), events = new EventEmitter();
  const history = new CodexHistory(connection, projection, store), catalog = new CodexCatalog(connection, store), configuration = new CodexConfiguration(connection);
  const requests = new CodexRequests({ connection, projection, autoApprove, autoApproveBrowser });
  const titles = createThreadTitleService({ codex: connection });
  const goals = new Map(), goalReads = new Map(), acceptedInputs = new Map(), usage = new CodexUsage(connection), names = new Map(), summaries = new Map();
  const bindings = (id) => Boolean(store.threadProjects[id]);
  const notify = (id, event) => { batcher.publish(id, event); events.emit("event", id, event); };
  projection.onEvent = notify;
  const save = (promise) => void promise.catch((error) => process.stderr.write(`[adapter] 保存执行恢复数据失败：${error.message}\n`));
  const accept = (id, inputId) => {
    if (!acceptedInputs.has(id)) acceptedInputs.set(id, new Set());
    acceptedInputs.get(id).add(inputId);
    if (acceptedInputs.get(id).size > 256) acceptedInputs.get(id).delete(acceptedInputs.get(id).values().next().value);
    notify(id, { kind: "input.accepted", inputId });
  };
  const notification = (message) => {
    const p = message.params || {}, id = p.threadId;
    if (message.method === "account/rateLimits/updated") { usage.update(p.rateLimits); for (const key of batcher.listeners.keys()) notify(key, { kind: "controls.changed" }); return; }
    if (!bindings(id)) return;
    if (p.item?.type === "userMessage" && p.item.clientId) accept(id, p.item.clientId);
    if (message.method === "serverRequest/resolved") requests.resolved(p.requestId);
    if (message.method.startsWith("thread/goal/")) {
      goals.set(id, { version: (goals.get(id)?.version || 0) + 1, value: message.method.endsWith("cleared") ? null : p.goal });
      notify(id, { kind: "controls.changed" }); notify(id, { kind: "goal.changed" });
    }
    if (message.method === "thread/name/updated") { names.set(id, p.threadName || p.name || ""); notify(id, { kind: "catalog.changed" }); }
    if (message.method === "thread/tokenUsage/updated") { usage.tokens.set(id, p.tokenUsage); notify(id, { kind: "controls.changed" }); }
    if (message.method === "error") notify(id, { kind: "notice", message: String(p.error?.message || p.message || "代理执行失败。") });
    projection.receive(message);
    const runId = p.turnId || p.turn?.id;
    if (runId && ["turn/started", "turn/completed"].includes(message.method)) {
      save(store.recordTurnMetric(id, runId, message.method === "turn/started" ? { startedAt: milliseconds(p.turn?.startedAt) || Date.now() } : { completedAt: milliseconds(p.turn?.completedAt) || Date.now() }));
      if (message.method === "turn/completed") {
        notify(id, { kind: "run.terminal", runId });
        // One completion read releases covered live state; there is no polling
        // loop and no full-history request on text deltas or editor input.
        save(history.readNative(id));
      }
    }
    if (runId && message.method === "turn/plan/updated") save(store.recordTurnPlan(id, runId, { explanation: p.explanation, plan: p.plan }));
    if (runId && ["item/started", "item/completed"].includes(message.method) && p.item?.id) {
      save(store.recordItemMetric(id, runId, p.item.id, {
        type: p.item.type, ...(message.method === "item/started" ? { startedAt: Date.now() } : { completedAt: Date.now(), durationMs: p.item.durationMs }),
        ...(p.item.type === "commandExecution" ? { snapshot: commandExecutionSnapshot(p.item) } : {}),
      }, { deferred: true }));
    }
  };
  const response = ({ method, params, result }) => {
    if (!["turn/start", "turn/steer"].includes(method) || !params.clientUserMessageId || !bindings(params.threadId)) return;
    const id = params.threadId, runId = result?.turn?.id || result?.turnId || params.expectedTurnId;
    if (!runId) return;
    accept(id, params.clientUserMessageId);
    if (method === "turn/start") projection.receive({ method: "turn/started", params: { threadId: id, turn: { ...result.turn, id: runId } } });
    projection.receive({ method: "item/started", params: { threadId: id, turnId: runId,
      item: { id: params.clientUserMessageId, clientId: params.clientUserMessageId, type: "userMessage", content: params.input || [], clientPending: true,
        ...(method === "turn/steer" ? { inputKind: "guide" } : {}) } } });
  };
  const serverRequest = (message) => {
    if (!bindings(message.params?.threadId)) { connection.respondError(message.id, -32602, "请求不属于当前工作台。"); return; }
    try { requests.receive(message); } catch (error) { connection.respondError(message.id, -32603, error.message); }
  };
  const offline = () => {
    requests.reset();
    for (const [id, session] of projection.sessions) {
      for (const run of session.runs.values()) { run.append = false; run.version = 0; }
      session.activeRunId = null; session.status = "recovering";
      notify(id, { kind: "recovery.required" });
    }
  };
  const online = () => { for (const id of projection.sessions.keys()) notify(id, { kind: "recovery.required" }); };
  connection.events.on("notification", notification); connection.events.on("response", response);
  connection.events.on("serverRequest", serverRequest); connection.events.on("offline", offline); connection.events.on("online", online);

  async function goal(id, force = false) {
    if (!force && goals.has(id)) return goals.get(id).value;
    if (!goalReads.has(id)) {
      const version = goals.get(id)?.version || 0;
      goalReads.set(id, connection.request("thread/goal/get", { threadId: id }).then((result) => {
        if ((goals.get(id)?.version || 0) === version) goals.set(id, { version, value: result.goal || null });
        return goals.get(id)?.value || null;
      }).finally(() => goalReads.delete(id)));
    }
    return goalReads.get(id);
  }
  async function options(id, project) { return configuration.resolve(await store.getThreadSettings(id, project.settings)); }
  async function loaded(id, project) { const settings = await options(id, project); await connection.ensureLoaded(id, project, settings); return settings; }
  async function probe(id, project) {
    await loaded(id, project);
    const checkpoint = projection.version, metadata = await history.metadata(id), session = projection.session(id);
    if (session.version <= checkpoint) session.status = running(metadata.status) ? "running" : "idle";
    if (session.status === "running" && !session.activeRunId) await history.readNative(id);
    if (session.status === "idle" && session.version <= checkpoint) session.activeRunId = null;
    return { activeRunId: session.activeRunId, status: session.status, goal: await goal(id) };
  }
  async function submit(id, project, input) {
    const prepared = await beforeInput(async () => ({ settings: await loaded(id, project), input: nativeInput(input) }));
    const settings = prepared.settings;
    const result = await inputRequest("turn/start", { threadId: id, clientUserMessageId: input.id,
      input: prepared.input, model: settings.model,
      ...(settings.effort ? { effort: settings.effort } : {}), ...(settings.serviceTier ? { serviceTier: settings.serviceTier } : {}),
      summary: settings.summary || "detailed", collaborationMode: settings.collaboration });
    if (!result.turn?.id) throw new Error("代理没有确认任务接收结果。");
    const projectName = names.get(id);
    if (projectName === "") save(titles.schedule({ threadId: id, cwd: project.path,
      turns: [{ items: [{ type: "userMessage", content: [{ type: "text", text: input.text }] }] }], settings, getCurrentName: () => names.get(id) }));
    return { runId: result.turn.id };
  }
  async function guide(id, project, input) {
    const prepared = await beforeInput(async () => { const runId = validateId(input.runId, "runId"); await loaded(id, project); return { runId, input: nativeInput(input) }; });
    const runId = prepared.runId;
    const result = await inputRequest("turn/steer", { threadId: id, expectedTurnId: runId, clientUserMessageId: input.id || randomUUID(),
      input: prepared.input }, { timeoutMs: 10_000 });
    return { runId: result.turnId || runId };
  }
  async function beforeInput(prepare) {
    try { return await prepare(); } catch (error) { throw new AgentOperationError(error, "rejected"); }
  }
  async function inputRequest(method, params, options) {
    try { return await connection.request(method, params, options); }
    catch (error) { throw new AgentOperationError(error, error.codexResponse ? "rejected" : "uncertain",
      error.codexResponse && /no active turn|not active|turn.*(mismatch|does not match)|expected.*turn/i.test(error.message) ? "inactive-run" : undefined); }
  }
  async function create(project, user) {
    const settings = await configuration.resolve(project.settings);
    const result = await connection.request("thread/start", { cwd: project.path, model: settings.model,
      collaborationMode: settings.collaboration, config: { model_reasoning_summary: settings.summary || "detailed" }, ...(settings.serviceTier ? { serviceTier: settings.serviceTier } : {}) });
    const id = validateId(result.thread?.id, "conversationId");
    connection.markThreadLoaded(id); names.set(id, "");
    await store.setThreadProject(id, project.id); await store.setThreadSettings(id, cleanSettings(settings)); await store.recordThreadAccess(user.id, id);
    notify(id, { kind: "conversation.created" });
    return { id, projectId: project.id, agentInstanceId: "codex-local", title: "新会话" };
  }
  async function execute(id, project, command) {
    switch (command.type) {
      case "guide": return guide(id, project, { id: randomUUID(), text: command.text, runId: command.runId });
      case "answer": requests.answer(id, command.requestId, command.answers); return;
      case "approve": requests.approve(id, command.requestId, command.decision); return;
      case "interrupt": {
        const runId = validateId(command.runId, "runId"), session = projection.session(id);
        if (session.activeRunId && runId !== session.activeRunId) throw httpError(409, "当前执行任务已经变化。");
        const previous = await goal(id);
        const interrupted = connection.request("turn/interrupt", { threadId: id, turnId: runId }, { timeoutMs: 8_000 });
        const paused = previous?.status === "active" ? setGoal(id, { status: "paused" }).catch((error) => {
          notify(id, { kind: "notice", message: `当前任务已请求停止，但目标暂停失败：${error.message}` });
        }) : Promise.resolve();
        await interrupted; await paused;
        projection.receive({ method: "turn/completed", params: { threadId: id, turn: { id: runId, status: "interrupted", completedAt: Date.now() } } });
        notify(id, { kind: "run.terminal", runId }); return;
      }
      case "compact": {
        const state = await probe(id, project);
        if (state.status === "running" || state.activeRunId) throw httpError(409, "任务执行完成后才能压缩上下文。");
        await connection.request("thread/compact/start", { threadId: id }); return;
      }
      case "goal": return setGoal(id, command.patch);
      case "rename": {
        const name = validateText(command.name, "聊天名称").slice(0, 100); titles.cancel(id);
        await connection.request("thread/name/set", { threadId: id, name }); names.set(id, name); return;
      }
      case "suggestName": {
        const page = await history.readNative(id);
        return { name: await titles.suggest({ cwd: project.path, turns: page.turns, settings: await options(id, project), latest: true }) };
      }
      case "delete": {
        const state = await probe(id, project);
        if (state.status === "running" || state.activeRunId || state.goal?.status === "active") throw httpError(409, "请先停止任务并暂停目标，再删除会话。");
        if ((store.queues[id] || []).some((item) => item.delivery?.status === "submitting")) throw httpError(409, "消息正在提交，请稍后再删除。");
        titles.cancel(id); await connection.request("thread/delete", { threadId: id });
        notify(id, { kind: "removed" }); await store.removeThread(id);
        projection.forget(id); requests.forget(id); goals.delete(id); names.delete(id); acceptedInputs.delete(id); usage.tokens.delete(id); summaries.delete(id); return;
      }
      case "settings": {
        const values = command.values;
        if (!values || typeof values !== "object" || Object.keys(values).some((key) => !["model", "effort", "serviceTier", "summary", "collaborationMode"].some((name) => key === `codex.${name}`))) throw httpError(400, "设置项无效。");
        const settings = mergeSettings(await store.getThreadSettings(id, project.settings), configuration.native(values));
        const effective = await configuration.resolve(settings); await connection.ensureLoaded(id, project, effective);
        await connection.request("thread/settings/update", { threadId: id, collaborationMode: effective.collaboration });
        await store.setThreadSettings(id, settings); notify(id, { kind: "controls.changed" }); return;
      }
      default: throw httpError(400, "代理不支持这个操作。");
    }
  }
  async function fork(id, project, user) {
    const state = await probe(id, project);
    if (state.status === "running" || state.activeRunId) throw httpError(409, "请先停止当前任务，再分叉会话。");
    const settings = await options(id, project);
    const result = await connection.request("thread/fork", { threadId: id, cwd: project.path, excludeTurns: true,
      model: settings.model, collaborationMode: settings.collaboration, config: { model_reasoning_summary: settings.summary || "detailed" }, ...(settings.serviceTier ? { serviceTier: settings.serviceTier } : {}) });
    const nextId = validateId(result.thread?.id, "conversationId");
    if (nextId === id) throw new Error("代理没有返回独立的分叉会话。");
    connection.markThreadLoaded(nextId); await store.setThreadProject(nextId, project.id);
    await store.setThreadSettings(nextId, cleanSettings(settings)); await store.recordThreadAccess(user.id, nextId);
    const source = names.get(id) || (await history.metadata(id)).name;
    const title = source ? `${source.slice(0, 96)}（分支）` : "新分支";
    await connection.request("thread/name/set", { threadId: nextId, name: title }); names.set(nextId, title);
    notify(nextId, { kind: "conversation.created" });
    return { id: nextId, title, projectId: project.id, agentInstanceId: "codex-local" };
  }
  async function setGoal(id, patch) {
    if (patch === null) { await connection.request("thread/goal/clear", { threadId: id }); goals.set(id, { version: (goals.get(id)?.version || 0) + 1, value: null }); }
    else {
      if (!patch || typeof patch !== "object") throw httpError(400, "目标设置无效。");
      const params = { threadId: id };
      if (Object.hasOwn(patch, "objective")) params.objective = validateText(patch.objective);
      if (Object.hasOwn(patch, "status")) { if (!["active", "paused"].includes(patch.status)) throw httpError(400, "目标状态无效。"); params.status = patch.status; }
      if (Object.hasOwn(patch, "tokenBudget")) { if (patch.tokenBudget !== null && (!Number.isSafeInteger(patch.tokenBudget) || patch.tokenBudget <= 0)) throw httpError(400, "Token 预算必须是正整数。"); params.tokenBudget = patch.tokenBudget; }
      if (Object.keys(params).length === 1) throw httpError(400, "目标设置为空。");
      const result = await connection.request("thread/goal/set", params); goals.set(id, { version: (goals.get(id)?.version || 0) + 1, value: result.goal });
    }
    notify(id, { kind: "controls.changed" }); notify(id, { kind: "goal.changed" });
  }
  async function controls(id) {
    const session = projection.sessions.get(id), settings = await store.getThreadSettings(id);
    return { conversationId: id, activeRunId: session?.activeRunId || null, status: session?.status || "idle",
      goal: await goal(id), ...requests.snapshot(id),
      settings: Object.fromEntries(Object.entries(settings).map(([key, value]) => [`codex.${key}`, value])), usage: await usage.snapshot(id) };
  }
  async function prepareAnswer(id, requestId, candidate) {
    const native = await connection.request("thread/read", { threadId: id, includeTurns: true });
    const turns = native.thread?.turns || [];
    if (answeredIds(turns, store.queues[id]).includes(requestId)) throw httpError(409, "这个问题已经回答过了。");
    const item = turns.flatMap((turn) => turn.items || []).find((item) => item.id === requestId);
    const request = item && questionsFromItem(item);
    if (!request) throw httpError(409, "异步问题已经不可用。");
    return { text: asyncAnswer(request, candidate) };
  }
  async function projectBusy(projectId) {
    if ([...projection.sessions].some(([id, session]) => store.threadProjects[id] === projectId && session.status === "running")
      || [...goals].some(([id, goal]) => store.threadProjects[id] === projectId && goal.value?.status === "active")) return true;
    const project = await store.getProject(projectId), seen = new Set();
    let cursor = null;
    do {
      const page = await connection.request("thread/list", { cwd: project.path, limit: 100, useStateDbOnly: true, ...(cursor ? { cursor } : {}) });
      for (const thread of page.data || []) { seen.add(thread.id); if (running(thread.status)) return true; }
      cursor = page.nextCursor || null;
    } while (cursor);
    const relocated = store.threadIdsForProject(projectId).filter((id) => !seen.has(id));
    for (let offset = 0; offset < relocated.length; offset += 30) {
      const states = await Promise.all(relocated.slice(offset, offset + 30).map(async (id) => {
        try { return running((await history.metadata(id)).status); }
        catch (error) { if (error.codexResponse && /not found|not exist|no rollout/i.test(error.message)) return false; throw error; }
      }));
      if (states.some(Boolean)) return true;
    }
    return false;
  }
  return {
    describe: () => ({ instanceId: "codex-local", providerId: "codex", displayName: "Codex", access: "interactive", status: connection.state,
      capabilities: { history: "paged", interrupt: true, steer: true, fork: true, compact: true, attachments: true, approvals: true, questions: true, plans: true, goals: true, usage: true }, settings: [] }),
    list: async (...args) => { const page = await catalog.list(...args); for (const row of page.conversations) summaries.set(row.id, row); return page; },
    search: (...args) => catalog.search(...args), readHistory: (...args) => history.page(...args), readDetail: (...args) => history.details(...args),
    observe: (id, listener) => batcher.observe(id, listener), notify, controls, create, execute, submit, guide, probe,
    configuration: () => configuration.fields(), validateSettings: (settings) => configuration.resolve(settings).then(cleanSettings), prepareAnswer, fork,
    export: (id, ref) => history.export(id, ref),
    accepted: (id, inputId) => acceptedInputs.get(id)?.has(inputId) === true,
    summary: (id) => ({ id, agentInstanceId: "codex-local", projectId: store.threadProjects[id],
      title: names.get(id) || summaries.get(id)?.title || "未命名会话", status: projection.sessions.get(id)?.status || summaries.get(id)?.status || "unknown", queueCount: store.queues[id]?.length || 0 }),
    knownIds: () => [...new Set([...projection.sessions.keys(), ...goals.keys(), ...Object.keys(store.queues)])],
    onEvent(listener) { events.on("event", listener); return () => events.off("event", listener); },
    projectHasActiveThread: projectBusy,
    forgetProject(projectId, ids) { for (const id of ids) { projection.forget(id); requests.forget(id); goals.delete(id); usage.tokens.delete(id); acceptedInputs.delete(id); names.delete(id); summaries.delete(id); } },
    close() { batcher.close(); connection.events.off("notification", notification); connection.events.off("response", response);
      connection.events.off("serverRequest", serverRequest); connection.events.off("offline", offline); connection.events.off("online", online);
      return history.resources.close(); },
  };
}

function nativeInput(input) {
  const files = input.attachments || [];
  const references = files.map((file) => `[${file.name.replace(/[\[\]]/g, "")}](${file.path.replace(/\\/g, "/")})`);
  const text = [String(input.text || "").trim(), ...references].filter(Boolean).join("\n");
  validateText(text);
  return [{ type: "text", text }, ...files.filter((file) => [".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(extname(file.path).toLowerCase())).map((file) => ({ type: "localImage", path: file.path }))];
}
