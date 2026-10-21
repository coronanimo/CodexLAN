import assert from "node:assert/strict";
import test from "node:test";
import { asyncUserInputRequest, asyncAnswerMessage, asyncAnswerRequestId, answeredAsyncRequestIds, displayUserInputText, asyncQuestionDeferred, setAsyncQuestionDeferred, deliverAsyncUserInput } from "../public/async-user-input.js";
import { deriveRunDiagnostic } from "../public/run-diagnostics.js";
import { WorkspaceStore } from "../server/workspace-store.mjs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const item = { id: "call_question", type: "agentMessage", phase: "final_answer", delivery: "async",
  questions: [{ title: "现在退出游戏？", options: ["退出", "稍后"] }, { title: "补充要求？" }] };

test("recognizes experimental async agent messages without confusing final answers or blocking requests", () => {
  const request = asyncUserInputRequest(item, { threadId: "thread", turnId: "turn" });
  assert.equal(request.requestId, "call_question");
  assert.equal(request.isBlocking, false);
  assert.equal(request.questions.length, 2);
  assert.deepEqual(request.questions[0].options, [{ label: "退出", description: "" }, { label: "稍后", description: "" }]);
  assert.equal(request.questions[0].isOther, true);
  assert.deepEqual(request.questions[1].options, []);
  assert.equal(asyncUserInputRequest({ ...item, delivery: null }), null);
  assert.equal(asyncUserInputRequest({ ...item, type: "userMessage" }), null);
});

test("supports older async messages and treats question text as text, not markup", () => {
  const request = asyncUserInputRequest({ ...item, questions: null, text: "<script>question</script>" });
  assert.equal(request.questions[0].question, "<script>question</script>");
  assert.equal(request.questions[0].options.length, 0);
  assert.equal(asyncUserInputRequest({ ...item, questions: [], text: "" }), null);
});

test("keeps selected and custom answers durable in history and pending queues", () => {
  const request = asyncUserInputRequest(item);
  const text = asyncAnswerMessage(request, { question_1: { answers: ["稍后"] }, question_2: { answers: ["保留旧文件"] } });
  assert.equal(asyncAnswerRequestId(text), item.id);
  assert.match(displayUserInputText(text), /^回答你的提问：/);
  assert.match(text, /我的回答：保留旧文件/);
  const turns = [{ items: [{ type: "userMessage", content: [{ type: "text", text }] }] }];
  assert.deepEqual(answeredAsyncRequestIds(turns, [{ text }]), [item.id]);
  assert.deepEqual(answeredAsyncRequestIds([], [{ text }]), [item.id]);
  assert.equal(asyncAnswerRequestId(`quoted\n${text}`), null);
  assert.equal(displayUserInputText("ordinary message"), "ordinary message");
  assert.throws(() => asyncAnswerMessage({ ...request, requestId: "bad\nmarker" }, {}), /编号无效/);
});

test("nonblocking questions never pause execution diagnostics or elapsed time", () => {
  const runtime = { status: "active", activeTurnId: "turn", startedAt: 1000 };
  assert.equal(deriveRunDiagnostic({ runtime, userInputRequests: [{ isBlocking: false }], now: 2000 }).state, "generating");
  assert.equal(deriveRunDiagnostic({ runtime, userInputRequests: [{}], now: 2000 }).state, "waitingInput");
  assert.equal(deriveRunDiagnostic({ runtime: { ...runtime, status: "idle" }, userInputRequests: [{ isBlocking: false }] }).state, "idle");
});

test("persists answer receipts across service reloads and removes them with the thread", async () => {
  const root = await mkdtemp(join(tmpdir(), "codexlan-async-input-"));
  const options = { dataRoot: root, stateFile: join(root, "workspace-state.json"), workspace: root };
  const threadId = "33333333-3333-4333-8333-333333333333";
  const stores = [];
  try {
    const store = new WorkspaceStore(options);
    stores.push(store);
    await store.ready;
    await store.recordAsyncInputAnswer(threadId, item.id);
    await store.recordAsyncInputAnswer(threadId, item.id);
    const reloaded = new WorkspaceStore(options);
    stores.push(reloaded);
    await reloaded.ready;
    assert.deepEqual(await reloaded.getAsyncInputAnswers(threadId), [item.id]);
    await reloaded.removeThread(threadId);
    const removed = new WorkspaceStore(options);
    stores.push(removed);
    await removed.ready;
    assert.deepEqual(await removed.getAsyncInputAnswers(threadId), []);
  } finally {
    for (const store of stores) store.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("remembers later-answer collapse after reload without treating it as an answer", () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) };
  const key = "deferred-questions:user";
  const request = "thread:call_question";
  assert.equal(asyncQuestionDeferred(storage, key, request), false);
  setAsyncQuestionDeferred(storage, key, request, true);
  assert.equal(asyncQuestionDeferred(storage, key, request), true);
  assert.equal(asyncQuestionDeferred(storage, "deferred-questions:another-user", request), false);
  assert.deepEqual(answeredAsyncRequestIds([], []), []);
  setAsyncQuestionDeferred(storage, key, request, false);
  assert.equal(asyncQuestionDeferred(storage, key, request), false);
  const blocked = { getItem() { throw new Error("unavailable"); }, setItem() { throw new Error("unavailable"); } };
  assert.equal(asyncQuestionDeferred(blocked, key, request), false);
  assert.doesNotThrow(() => setAsyncQuestionDeferred(blocked, key, request, true));
});

test("delivers answers through an older running server without restarting active conversations", async () => {
  const request = asyncUserInputRequest(item, { threadId: "thread", turnId: "turn" });
  const answers = { question_1: { answers: ["稍后"] }, question_2: { answers: ["保留文件"] } };
  for (const active of [true, false]) {
    const calls = [];
    const result = await deliverAsyncUserInput({ request, answers, projectId: "project", api: async (path, options) => {
      calls.push({ path, options });
      if (path.includes("/async-user-input/")) throw new Error("找不到 API。");
      if (!options) return { runtime: { status: active ? "active" : "idle", activeTurnId: active ? "turn" : null } };
      return active ? { turnId: "turn", item: {} } : { queue: [], item: {} };
    } });
    assert.equal(result.delivery, active ? "guide" : "queued");
    assert.equal(calls.length, 3);
    assert.match(calls[2].options.body.text, /我的回答：保留文件/);
    assert.ok(calls[2].path.endsWith(active ? "/steer" : "/queue"));
  }
  let calls = 0;
  await assert.rejects(deliverAsyncUserInput({ request, answers, projectId: "project", api: async () => {
    calls += 1;
    throw new Error("请求超时");
  } }), /请求超时/);
  assert.equal(calls, 1, "an ambiguous failure must not deliver the same answer again");
});
