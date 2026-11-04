import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { createConversations } from "../server/conversations.mjs";
import { hasCurrentThreadHistory, newThreadSettings } from "../public/workspace.js";
import { mergeConversationTurns } from "../public/conversation-state.js";

test("new chat reuses the draft but inherits the selected conversation, including a pending selection", async () => {
  const source = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  const createSource = source.slice(source.indexOf("async function createThread("), source.indexOf("\nfunction currentThreadIsEmpty()"));
  const old = { id: "old", runtime: { projectId: "project" }, settings: { model: "gpt-5.6-sol" } };
  const target = { id: "target", runtime: { projectId: "project" }, settings: { model: "gpt-6.1-sol", effort: "high" } };
  const draft = { id: "local-draft", runtime: { projectId: "project" }, settings: { model: "gpt-5.6-sol" }, name: "draft" };
  const threads = [old, target, draft];
  const state = { threads: new Map([["project", threads]]), selectedThreadId: old.id, threadSelectionTargetId: target.id,
    models: [{ id: "gpt-5.6-sol" }, { id: "gpt-6.1-sol" }] };
  const noop = () => {};
  const create = runInNewContext(`${createSource}\ncreateThread`, {
    state, newThreadSettings, currentProject: () => ({ id: "project", settings: {} }),
    selectedModelForThread: (thread) => state.models.find((model) => model.id === thread.settings?.model) || { id: "gpt-6.1-sol", defaultReasoningEffort: "low" },
    findThread: (_project, id) => threads.find((thread) => thread.id === id),
    currentThread: () => threads.find((thread) => thread.id === state.selectedThreadId),
    cancelThreadSelection: () => { state.threadSelectionTargetId = null; },
    localStorage: { getItem: () => "gpt-5.6-sol" }, userStorageKey: (key) => key,
    isLocalThreadId: (id) => id?.startsWith("local-"), currentThreadIsEmpty: () => true,
    updateThreadInState: (_project, thread) => { threads[threads.findIndex((entry) => entry.id === thread.id)] = thread; },
    closeSidebar: noop, renderThreads: noop, renderCurrentThread: noop, ui: { prompt: { focus: noop } },
  });
  const result = await create();
  assert.equal(result.id, draft.id);
  assert.equal(result.name, "draft");
  assert.equal(result.settings.model, "gpt-6.1-sol");
  assert.equal(result.settings.effort, "high");
  assert.equal(state.selectedThreadId, draft.id);
  target.settings = {};
  state.selectedThreadId = target.id;
  const displayedDefault = await create();
  assert.equal(displayedDefault.settings.model, "gpt-6.1-sol");
  assert.equal(displayedDefault.settings.effort, "low");
  target.runtime = null;
  target.settings = { model: "gpt-6.1-sol", effort: "low" };
  state.selectedThreadId = target.id;
  const missingRuntimeProject = await create();
  assert.equal(missingRuntimeProject.settings.model, "gpt-6.1-sol");
  assert.equal(missingRuntimeProject.settings.effort, "low");
});

test("new chat prefers the current model and otherwise uses the configured default", () => {
  const projectSettings = { model: "project-model" };
  const currentThread = { runtime: { projectId: "project" }, settings: { model: "current-model" } };
  assert.equal(newThreadSettings({ projectSettings, currentThread, projectId: "project", defaultModel: "default-model", models: [] }).model, "current-model");
  assert.equal(newThreadSettings({ projectSettings, projectId: "project", defaultModel: "default-model" }).model, "default-model");
  assert.equal(newThreadSettings({ projectSettings, projectId: "project" }).model, "project-model");
});

for (const eventFirst of [true, false]) test(`materialization shares one identity with SSE (${eventFirst ? "event" : "HTTP"} first)`, async () => {
  const source = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  const materialize = source.slice(source.indexOf("async function materializeThread("), source.indexOf("\nasync function submitPrompt("));
  const helpers = source.slice(source.indexOf("function findThread("), source.indexOf("\nfunction applyThreadReplacement("));
  const draft = { id: "local-draft", settings: {} };
  const state = { threads: new Map([["project", [draft]]]), selectedProjectId: "project", selectedThreadId: draft.id,
    queueSnapshots: new Map(), sidebarOrder: "original", threadPages: new Map([["project", { order: "original", ids: ["old"], nextCursor: "next" }]]),
    globalThreadPage: { order: "original", ids: ["old"], nextCursor: "next" } };
  const noop = () => {};
  const context = { state, mergeConversationTurns, updateComposer: noop, ensureEventStream: noop, renderThreads: noop,
    renderCurrentThread: noop, applyQueueSnapshot: noop, isLocalThreadId: (id) => id.startsWith("local-"),
    api: async () => {
      if (eventFirst) state.threads.get("project").unshift({ id: "real", name: "Live name", runtime: { status: "running", activeTurnId: "turn" }, turns: [{ id: "turn", items: [] }] });
      return { thread: { id: "real", name: null, turns: [] }, runtime: { status: "idle" } };
    } };
  const api = runInNewContext(`${helpers}\n${materialize}\n({materializeThread, updateThreadInState})`, context);
  await api.materializeThread({ id: "project" }, draft);
  api.updateThreadInState("project", { id: "real", name: "Renamed", runtime: { status: "running", activeTurnId: "turn" } });
  const threads = state.threads.get("project");
  assert.equal(threads.length, 1);
  assert.equal(threads[0].name, "Renamed");
  assert.equal(threads[0].runtime.activeTurnId, "turn");
  if (eventFirst) assert.equal(threads[0].turns[0].id, "turn");
  assert.equal(state.selectedThreadId, "real");
  assert.deepEqual([...state.threadPages.get("project").ids], ["real", "old"]);
  assert.deepEqual([...state.globalThreadPage.ids], ["real", "old"]);
  assert.equal(state.globalThreadPage.nextCursor, "next");
});

test("clicking the displayed conversation cancels a pending switch instead of letting it win later", async () => {
  const source = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  const cancelSource = source.slice(source.indexOf("function cancelThreadSelection()"), source.indexOf("\nfunction showThreadSelection("));
  const selectSource = source.slice(source.indexOf("async function selectThread("), source.indexOf("\nfunction clearThread()"));
  const controller = new AbortController();
  const state = { selectedThreadId: "displayed", threadSelectionId: 4, threadSelectionTargetId: "pending", threadSelectionController: controller };
  const noop = () => {};
  const select = runInNewContext(`${cancelSource}\n${selectSource}\nselectThread`, {
    state, hasCurrentThreadHistory,
    currentProject: () => ({ id: "project" }),
    findThread: () => ({ id: "displayed", history: {}, turns: [], historyLive: true }),
    isLocalThreadId: () => false, closeSidebar: noop, renderThreads: noop, updateComposer: noop,
    ui: { prompt: { focus: noop }, conversationStage: { classList: { remove: noop }, removeAttribute: noop }, queuePanel: {} },
  });
  await select("displayed");
  assert.equal(controller.signal.aborted, true);
  assert.equal(state.threadSelectionTargetId, null);
  assert.equal(state.threadSelectionId, 5);
});

test("an explicit cross-project conversation opens without waiting for a project-list refresh", async () => {
  const source = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  const projectSource = source.slice(source.indexOf("async function selectProject("), source.indexOf("\nfunction cancelThreadSelection()"));
  const state = { projects: [{ id: "target-project" }], selectedProjectId: "previous", selectedThreadId: "previous-thread", threadPages: new Map() };
  const calls = [];
  const noop = () => {};
  const select = runInNewContext(`${projectSource}\nselectProject`, {
    state, findThread: () => ({ id: "target-thread" }),
    selectThread: async (id) => calls.push(id),
    refreshProjectThreads: () => assert.fail("must not refresh before opening an explicitly clicked conversation"),
    cancelThreadSelection: noop, clearComposerAttachments: noop, closeSidebar: noop,
    renderProjects: noop, renderThreads: noop, renderSettings: noop,
    localStorage: { setItem: noop }, userStorageKey: (key) => key,
  });
  await select("target-project", { threadId: "target-thread" });
  assert.deepEqual(calls, ["target-thread"]);
});

test("switching shows stale cached history before fetching its replacement", async () => {
  const source = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  const selectSource = source.slice(source.indexOf("async function selectThread("), source.indexOf("\nfunction clearThread()"));
  const thread = { id: "target", history: {}, turns: [{ id: "cached-turn" }], syncedUpdatedAt: null };
  const state = { selectedThreadId: "previous", threadSelectionId: 0 };
  const calls = [];
  const noop = () => {};
  const context = {
    AbortController, state,
    ui: { prompt: { focus: noop }, conversationStage: { classList: { remove: noop }, removeAttribute: noop }, queuePanel: {} },
    currentProject: () => ({ id: "project" }),
    findThread: () => thread,
    isLocalThreadId: () => false,
    hasCurrentThreadHistory,
    closeSidebar: noop,
    cancelThreadSelection: noop,
    updateThreadInState: (_id, value) => Object.assign(thread, value),
    ensureEventStream: noop,
    renderThreads: noop,
    renderCurrentThread: () => calls.push("render cached history"),
    showThreadSelection: () => calls.push("show loading screen"),
    updateComposer: noop,
    api: (url, { signal }) => {
      calls.push(url);
      return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(Object.assign(new Error("cancelled"), { name: "AbortError" }))));
    },
  };
  const select = runInNewContext(`${selectSource}\nselectThread`, context);
  const switching = select(thread.id);
  assert.equal(state.selectedThreadId, "target");
  assert.deepEqual(calls, ["render cached history", "/api/threads/target?projectId=project"]);
  state.threadSelectionController.abort();
  await switching;
});

test("opening a conversation overlaps history and Goal reads and reuses a fresh Goal", async () => {
  const calls = [];
  let finishHistory;
  const historyReady = new Promise((resolve) => { finishHistory = resolve; });
  const project = { id: "11111111-1111-4111-8111-111111111111", settings: {} };
  const thread = { id: "thread", status: "idle", turns: [] };
  const goal = { status: "paused" };
  const store = {
    getProject: async () => project,
    requireThreadOwner: async () => {},
    getThreadSettings: async () => ({ model: "selected-model" }),
    getQueueSnapshot: async () => ({ queue: [], queueRevision: 0 }),
    reconcileExecutionSupplements: async () => {},
    getTurnMetrics: async () => ({}),
    recordThreadAccess: async () => "2026-11-04T00:00:00Z",
    getAsyncInputAnswers: async () => [],
  };
  const codex = {
    events: new EventEmitter(),
    request: async (method) => {
      calls.push(method);
      if (method === "thread/read") return { thread };
      if (method === "thread/turns/list") { await historyReady; return { data: [] }; }
      if (method === "thread/goal/get") return { goal };
      assert.fail(`unexpected request: ${method}`);
    },
  };
  const conversations = createConversations({ store, codex });
  const routes = new Map();
  conversations.registerRoutes({ get: (path, handler) => routes.set(path, handler), post() {}, patch() {}, delete() {} });
  const request = { identity: { user: { id: "user" } }, params: { threadId: thread.id }, codexUrl: new URL(`http://localhost/api/threads/thread?projectId=${project.id}`) };
  let body;
  const response = { writeHead() {}, end(value) { body = JSON.parse(value); } };
  const opening = routes.get("/api/threads/:threadId")(request, response);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, ["thread/read", "thread/turns/list", "thread/goal/get"]);
  finishHistory();
  await opening;
  assert.deepEqual(body.thread.goal, goal);
  assert.deepEqual(body.thread.settings, { model: "selected-model" });
  await routes.get("/api/threads/:threadId")(request, response);
  assert.equal(calls.filter((method) => method === "thread/goal/get").length, 1);
});
