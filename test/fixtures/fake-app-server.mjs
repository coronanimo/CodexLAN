import { createInterface } from "node:readline";
import { appendFileSync, existsSync, unlinkSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
const threads = new Map();
const goals = new Map();
const materializedThreads = new Set();
const pendingUserInputs = new Map();
if (process.env.CODEX_TEST_SEED_CWD) {
  const count = Math.max(1, Number(process.env.CODEX_TEST_SEED_COUNT || 1));
  for (let index = 0; index < count; index += 1) {
    const id = randomUUID();
    const commandCount = index === 0 ? Math.max(0, Number(process.env.CODEX_TEST_SEED_COMMANDS || 0)) : 0;
    const turns = commandCount ? [{
      id: randomUUID(),
      status: "completed",
      startedAt: 1_700_000_000_000,
      completedAt: 1_700_000_012_000,
      durationMs: 12_000,
      items: Array.from({ length: commandCount }, (_, commandIndex) => ({
        id: randomUUID(),
        type: "commandExecution",
        command: `node scripts/check-${commandIndex + 1}.mjs`,
        cwd: process.env.CODEX_TEST_SEED_CWD,
        status: "completed",
        startedAt: 1_700_000_000_000 + commandIndex * 1_200,
        completedAt: 1_700_000_000_800 + commandIndex * 1_200,
        durationMs: 800,
        aggregatedOutput: `check ${commandIndex + 1} passed`,
        exitCode: 0,
      })),
    }] : [];
    threads.set(id, {
      id,
      cwd: process.env.CODEX_TEST_SEED_CWD,
      name: index === 0 ? "Official App conversation" : `Official App conversation ${index + 1}`,
      status: "idle",
      turns,
      createdAt: 1_700_000_000 + index,
      updatedAt: 1_700_000_000 + index,
    });
  }
}
const traceFile = process.env.CODEX_TEST_TRACE_FILE;
const unboundNotificationThread = process.env.CODEX_TEST_UNBOUND_NOTIFICATION_THREAD;
const exitOnceFile = process.env.CODEX_TEST_EXIT_ONCE_FILE;
const exitSignalFile = process.env.CODEX_TEST_EXIT_SIGNAL_FILE;
const exitDuringInitialize = Boolean(exitOnceFile && !existsSync(exitOnceFile));
if (exitDuringInitialize) writeFileSync(exitOnceFile, String(process.pid), "utf8");
if (exitSignalFile) {
  setInterval(() => {
    if (!existsSync(exitSignalFile)) return;
    unlinkSync(exitSignalFile);
    process.exit(24);
  }, 25);
}

input.on("line", (line) => {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }
  if (!Object.hasOwn(message, "id")) return;
  if (traceFile) {
    const trace = message.method
      ? { method: message.method, params: message.params }
      : { responseId: message.id, result: message.result, error: message.error };
    appendFileSync(traceFile, `${JSON.stringify(trace)}\n`, "utf8");
  }
  if (!message.method) {
    handleClientResponse(message);
    return;
  }
  if (message.method === "initialize" && exitDuringInitialize) return process.exit(23);
  const respond = () => {
    try {
      const result = fakeResult(message.method, message.params);
      process.stdout.write(`${JSON.stringify({ id: message.id, result })}\n`);
      if (message.method === "turn/start") {
        emitTurnStarted(message.params, result);
        const userMessageDelay = Number(process.env.CODEX_TEST_USER_MESSAGE_DELAY_MS || 0);
        if (userMessageDelay > 0) setTimeout(() => emitUserMessage(message.params, result), userMessageDelay);
        else emitUserMessage(message.params, result);
        emitPlanUpdate(message.params, result);
        emitCommandOutputBurst(message.params, result);
        emitLargeMcpToolCall(message.params, result);
        emitUserInputRequest(message.params, result);
      }
      if (message.method === "turn/steer") emitUserMessage(message.params, { turn: { id: result.turnId } });
      if (message.method === "thread/compact/start") emitContextCompaction(message.params);
      if (message.method === "thread/goal/set") {
        process.stdout.write(`${JSON.stringify({
          method: "thread/goal/updated",
          params: { threadId: message.params.threadId, turnId: null, goal: result.goal },
        })}\n`);
      }
      if (message.method === "thread/goal/clear" && result.cleared) {
        process.stdout.write(`${JSON.stringify({
          method: "thread/goal/cleared",
          params: { threadId: message.params.threadId },
        })}\n`);
      }
      if (message.method === "initialize" && unboundNotificationThread) {
        setTimeout(() => process.stdout.write(`${JSON.stringify({
          method: "turn/started",
          params: { threadId: unboundNotificationThread, turn: { id: randomUUID(), status: "inProgress", startedAt: Date.now() } },
        })}\n`), 10);
      }
    } catch (error) {
      process.stdout.write(`${JSON.stringify({ id: message.id, error: { message: error.message } })}\n`);
    }
  };
  const delay = message.method === "turn/steer" ? Number(process.env.CODEX_TEST_STEER_DELAY_MS || 0) : 0;
  if (delay > 0) setTimeout(respond, delay);
  else respond();
});

function emitTurnStarted(params, result) {
  if (!params.threadId || !result?.turn?.id) return;
  process.stdout.write(`${JSON.stringify({
    method: "turn/started",
    params: { threadId: params.threadId, turn: result.turn },
  })}\n`);
}

function emitUserMessage(params, result) {
  const text = (params.input || []).map((entry) => entry.text || "").filter(Boolean).join("\n");
  const turnId = result?.turn?.id;
  if (!text || !params.threadId || !turnId) return;
  const item = { id: params.clientUserMessageId || randomUUID(), type: "userMessage", content: [{ type: "text", text }] };
  const thread = threads.get(params.threadId);
  const turn = thread?.turns.find((entry) => entry.id === turnId);
  if (turn) turn.items.push(copy(item));
  for (const method of ["item/started", "item/completed"]) {
    process.stdout.write(`${JSON.stringify({ method, params: { threadId: params.threadId, turnId, item } })}\n`);
  }
}

function emitUserInputRequest(params, result) {
  const text = (params.input || []).map((item) => item.text || "").join("\n");
  const turnId = result?.turn?.id;
  if (!text.includes("[request-user-input]") || !params.threadId || !turnId) return;
  const itemId = randomUUID();
  const requestId = `request-user-input-${turnId}`;
  const item = {
    id: itemId,
    type: "dynamicToolCall",
    tool: "request_user_input",
    arguments: {},
    status: "inProgress",
  };
  const thread = threads.get(params.threadId);
  const turn = thread?.turns.find((entry) => entry.id === turnId);
  if (turn) turn.items.push(copy(item));
  pendingUserInputs.set(requestId, { requestId, threadId: params.threadId, turnId, itemId });
  process.stdout.write(`${JSON.stringify({ method: "item/started", params: { threadId: params.threadId, turnId, item } })}\n`);
  process.stdout.write(`${JSON.stringify({
    id: requestId,
    method: "item/tool/requestUserInput",
    params: {
      threadId: params.threadId,
      turnId,
      itemId,
      autoResolutionMs: null,
      questions: [{
        id: "daily_replacements",
        header: "换仓数量",
        question: "每天换 10 只是上限，还是必须换满？",
        isOther: true,
        isSecret: false,
        options: [
          { label: "最多 10 只", description: "按条件决定实际换仓数量。" },
          { label: "必须 10 只", description: "每天固定换满 10 只。" },
        ],
      }],
    },
  })}\n`);
}

function handleClientResponse(message) {
  const pending = pendingUserInputs.get(String(message.id));
  if (!pending) return;
  pendingUserInputs.delete(String(message.id));
  const thread = threads.get(pending.threadId);
  const turn = thread?.turns.find((entry) => entry.id === pending.turnId);
  const tool = turn?.items.find((item) => item.id === pending.itemId);
  if (tool) tool.status = "completed";
  const agentMessage = {
    id: randomUUID(),
    type: "agentMessage",
    text: "已收到换仓数量要求，继续执行。",
    phase: "final",
  };
  if (turn) {
    turn.items.push(copy(agentMessage));
    turn.status = "completed";
    turn.completedAt = Date.now();
  }
  if (thread) thread.status = "idle";
  for (const event of [
    { method: "serverRequest/resolved", params: { threadId: pending.threadId, requestId: pending.requestId } },
    { method: "item/completed", params: { threadId: pending.threadId, turnId: pending.turnId, item: { ...tool, status: "completed" } } },
    { method: "item/completed", params: { threadId: pending.threadId, turnId: pending.turnId, item: agentMessage } },
    { method: "turn/completed", params: { threadId: pending.threadId, turn: copy(turn) } },
  ]) process.stdout.write(`${JSON.stringify(event)}\n`);
}

function emitPlanUpdate(params, result) {
  if (process.env.CODEX_TEST_PLAN_UPDATE !== "1" || !params.threadId || !result?.turn?.id) return;
  process.stdout.write(`${JSON.stringify({
    method: "turn/plan/updated",
    params: {
      threadId: params.threadId,
      turnId: result.turn.id,
      explanation: "Integration plan",
      plan: [
        { step: "Inspect", status: "completed" },
        { step: "Verify", status: "inProgress" },
      ],
    },
  })}\n`);
}

function emitCommandOutputBurst(params, result) {
  const count = Math.max(0, Number(process.env.CODEX_TEST_OUTPUT_BURST || 0));
  const turnId = result?.turn?.id;
  if (!count || !params.threadId || !turnId) return;
  const itemId = randomUUID();
  const startedAt = Date.now();
  const item = { id: itemId, type: "commandExecution", command: "burst-output", status: "inProgress", startedAt };
  process.stdout.write(`${JSON.stringify({
    method: "item/started",
    params: { threadId: params.threadId, turnId, item },
  })}\n`);
  for (let index = 0; index < count; index += 1) {
    process.stdout.write(`${JSON.stringify({
      method: "item/commandExecution/outputDelta",
      params: { threadId: params.threadId, turnId, itemId, delta: `burst-${index}\n` },
    })}\n`);
  }
  process.stdout.write(`${JSON.stringify({
    method: "item/completed",
    params: {
      threadId: params.threadId,
      turnId,
      item: { ...item, status: "completed", completedAt: Date.now(), exitCode: 0 },
    },
  })}\n`);
}

function emitLargeMcpToolCall(params, result) {
  const size = Math.max(0, Number(process.env.CODEX_TEST_MCP_RESULT_BYTES || 0));
  const turnId = result?.turn?.id;
  const thread = threads.get(params.threadId);
  const turn = thread?.turns.find((entry) => entry.id === turnId);
  if (!size || !turn) return;
  const item = {
    id: randomUUID(),
    type: "mcpToolCall",
    server: "test",
    tool: "large-result",
    arguments: { query: "performance" },
    result: { content: "x".repeat(size) },
    status: "completed",
  };
  turn.items.push(copy(item));
  for (const method of ["item/started", "item/completed"]) {
    process.stdout.write(`${JSON.stringify({ method, params: { threadId: params.threadId, turnId, item } })}\n`);
  }
}

function emitContextCompaction(params) {
  const turnId = randomUUID();
  const item = { id: randomUUID(), type: "contextCompaction" };
  const startedAt = Date.now();
  for (const message of [
    { method: "turn/started", params: { threadId: params.threadId, turn: { id: turnId, status: "inProgress", startedAt } } },
    { method: "item/started", params: { threadId: params.threadId, turnId, item } },
    { method: "item/completed", params: { threadId: params.threadId, turnId, item } },
    { method: "turn/completed", params: { threadId: params.threadId, turn: { id: turnId, status: "completed", startedAt, completedAt: Date.now() } } },
  ]) process.stdout.write(`${JSON.stringify(message)}\n`);
}

function fakeResult(method, params = {}) {
  if (method === "initialize") return { userAgent: "codex-lan-http-test" };
  if (method === "account/read") {
    return process.env.CODEX_TEST_LOGIN_REQUIRED === "1"
      ? { account: null, requiresOpenaiAuth: true }
      : { account: { type: "chatgpt", email: "test@example.invalid", planType: "unknown" }, requiresOpenaiAuth: true };
  }
  if (method === "model/list") return {
    data: [{
      id: "gpt-5.6-sol",
      displayName: "GPT-5.6 Sol",
      hidden: false,
      isDefault: true,
      defaultReasoningEffort: "medium",
      supportedReasoningEfforts: [{ reasoningEffort: "medium" }],
      serviceTiers: [],
    }],
  };
  if (method === "collaborationMode/list") return {
    data: [
      { mode: "plan", model: null, reasoning_effort: "medium" },
      { mode: "default", model: null, reasoning_effort: null },
    ],
  };
  if (method === "thread/settings/update") {
    requireCollaborationMode(params);
    return {};
  }
  if (method === "thread/compact/start") return {};
  if (method === "account/rateLimits/read") return {};
  if (method === "thread/goal/get") return { goal: copy(goals.get(params.threadId) || null) };
  if (method === "thread/goal/set") {
    const current = goals.get(params.threadId);
    const objective = Object.hasOwn(params, "objective") ? String(params.objective || "").trim() : current?.objective;
    if (!objective) throw new Error("goal objective is required");
    const now = Math.floor(Date.now() / 1000);
    const goal = {
      threadId: params.threadId,
      objective,
      status: params.status || current?.status || "active",
      tokenBudget: Object.hasOwn(params, "tokenBudget") ? params.tokenBudget : current?.tokenBudget ?? null,
      tokensUsed: current?.tokensUsed || 0,
      timeUsedSeconds: current?.timeUsedSeconds || 0,
      createdAt: current?.createdAt || now,
      updatedAt: now,
    };
    goals.set(params.threadId, goal);
    return { goal: copy(goal) };
  }
  if (method === "thread/goal/clear") {
    const cleared = goals.delete(params.threadId);
    return { cleared };
  }
  if (method === "thread/start") {
    const thread = {
      id: randomUUID(),
      cwd: params.cwd,
      name: null,
      status: "idle",
      turns: [],
      createdAt: Math.floor(Date.now() / 1000),
      updatedAt: Math.floor(Date.now() / 1000),
    };
    threads.set(thread.id, thread);
    return { thread };
  }
  if (method === "thread/list") {
    const matching = [...threads.values()].filter((thread) => thread.cwd === params.cwd);
    const offset = Number(params.cursor || 0);
    const limit = Math.max(1, Number(params.limit || 100));
    const nextOffset = offset + limit;
    return {
      data: matching.slice(offset, nextOffset).map(copy),
      nextCursor: nextOffset < matching.length ? String(nextOffset) : null,
    };
  }
  if (method === "thread/read" || method === "thread/resume") {
    const thread = threads.get(params.threadId);
    if (!thread) throw new Error("thread not found");
    if (method === "thread/read" && params.includeTurns && !materializedThreads.has(params.threadId)) {
      throw new Error(`thread ${params.threadId} is not materialized yet; includeTurns is unavailable before first user message`);
    }
    return { thread: copy(thread) };
  }
  if (method === "thread/name/set") {
    const thread = threads.get(params.threadId);
    if (thread) {
      thread.name = params.name;
      if (params.name === "Silently completed conversation") {
        thread.status = "idle";
        const turn = thread.turns.at(-1);
        if (turn) {
          turn.status = "completed";
          turn.completedAt = Date.now();
        }
      }
    }
    return {};
  }
  if (method === "thread/delete") {
    threads.delete(params.threadId);
    goals.delete(params.threadId);
    return {};
  }
  if (method === "turn/start") {
    requireCollaborationMode(params);
    const thread = threads.get(params.threadId);
    if (!thread) throw new Error("thread not found");
    materializedThreads.add(params.threadId);
    const turn = { id: randomUUID(), status: "inProgress", startedAt: Date.now(), items: [] };
    thread.status = "active";
    thread.turns.push(turn);
    thread.updatedAt = Math.floor(Date.now() / 1000);
    return { turn: copy(turn) };
  }
  if (method === "turn/steer") {
    const thread = threads.get(params.threadId);
    if (!thread || !thread.turns.some((turn) => turn.id === params.expectedTurnId)) throw new Error("turn not found");
    if (params.input?.some((item) => item.text?.includes("[fail-steer]"))) throw new Error("forced steer failure");
    return { turnId: params.expectedTurnId };
  }
  if (method === "turn/interrupt") {
    const thread = threads.get(params.threadId);
    if (thread) {
      thread.status = "idle";
      const turn = thread.turns.find((entry) => entry.id === params.turnId);
      if (turn) {
        turn.status = "interrupted";
        turn.completedAt = Date.now();
      }
    }
    return {};
  }
  return {};
}

function requireCollaborationMode(params) {
  if (typeof params?.collaborationMode?.settings?.model !== "string") {
    throw new Error("invalid type: null, expected a string");
  }
}

function copy(value) {
  return structuredClone(value);
}
