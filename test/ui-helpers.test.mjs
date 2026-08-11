import test from "node:test";
import assert from "node:assert/strict";

import { conversationDateKey, elapsedTiming, formatConversationDate, formatDuration, formatElapsed, formatMessageDateTime, formatMessageTime, timestampMilliseconds } from "../public/elapsed-time.js";
import { downloadableFiles, projectForLocalFile, textPreviewKind } from "../public/file-downloads.js";
import { MAX_LIVE_COMMAND_OUTPUT, MAX_SAVED_COMMAND_OUTPUT, activeExecutionSnapshots, commandDisplayText, commandExecutionSnapshot, commandOutputTail, executionItemDuration, fileChangeUpdateItem, isExecutionItem, mergeHistoricalExecutionItem, reconcileStaleExecutionTurn, restoreMissingExecutionItems, summarizeExecutionTiming, terminalExecutionStatus, turnProcessMarkdown } from "../public/execution-events.js";
import { accountLimitWindows, contextWindowUsage, hasCurrentThreadHistory, isActiveThreadRuntime, isActiveThreadStatus, mergeListedThread, mergeRefreshedThreads, mergeTurnItems, newThreadSettings, recentThreadEntries, threadDisplayName, threadStatusValue } from "../public/workspace.js";
import { createAnsiOutputState, parseAnsiOutput, parseAnsiOutputChunk } from "../public/ansi-output.js";
import { diffLineKind, diffLineStats, textLineCount, unifiedDiffChanges } from "../public/diff-output.js";
import { isMobileComposer, shouldSubmitPromptFromKeyboard } from "../public/composer.js";
import { plainInlineMarkdown } from "../public/text-format.js";
import { planShortcut, turnPlanPresentation, turnPlanSnapshot } from "../public/plan.js";

test("uses one runtime definition for status-only and turn-id activity", () => {
  assert.equal(threadStatusValue({ type: "inProgress" }), "inprogress");
  assert.equal(isActiveThreadStatus("pending"), true);
  assert.equal(isActiveThreadRuntime({ status: "active", activeTurnId: null }), true);
  assert.equal(isActiveThreadRuntime({ status: "idle", activeTurnId: "turn-1" }), true);
  assert.equal(isActiveThreadRuntime({ status: "idle", activeTurnId: null }), false);
});

test("formats quiet local timestamps for conversation messages", () => {
  const today = new Date(2026, 7, 8, 16, 5, 9).getTime();
  const yesterday = new Date(2026, 7, 7, 23, 4, 3).getTime();
  const previousYear = new Date(2025, 11, 31, 8, 2, 1).getTime();
  assert.equal(conversationDateKey(today), "2026-08-08");
  assert.equal(formatConversationDate(today, today), "今天 · 8月8日");
  assert.equal(formatConversationDate(yesterday, today), "昨天 · 8月7日");
  assert.match(formatConversationDate(previousYear, today), /^2025年12月31日 · 周/);
  assert.equal(formatMessageTime(today), "16:05");
  assert.equal(formatMessageDateTime(today), "2026年8月8日 16:05:09");
});

test("keeps IME and mobile Enter keys inside the prompt", () => {
  assert.equal(shouldSubmitPromptFromKeyboard({ key: "Enter", shiftKey: false, isComposing: true, keyCode: 13 }), false);
  assert.equal(shouldSubmitPromptFromKeyboard({ key: "Enter", shiftKey: false, isComposing: false, keyCode: 229 }), false);
  assert.equal(shouldSubmitPromptFromKeyboard({ key: "Enter", shiftKey: false, isComposing: false, keyCode: 13 }, { mobile: true }), false);
  assert.equal(shouldSubmitPromptFromKeyboard({ key: "Enter", shiftKey: false, isComposing: false, keyCode: 13 }), true);
  assert.equal(isMobileComposer({ userAgent: "Mozilla/5.0 (Linux; Android 15) Mobile" }), true);
});

test("removes lightweight Markdown markers from execution titles", () => {
  assert.equal(plainInlineMarkdown("**Finalizing deployment**"), "Finalizing deployment");
  assert.equal(plainInlineMarkdown("Review `server/index.mjs`"), "Review server/index.mjs");
});

test("renders final plans as conversation documents instead of execution entries", () => {
  assert.equal(isExecutionItem({ type: "plan" }), false);
  assert.equal(isExecutionItem({ type: "agentMessage" }), false);
  assert.equal(isExecutionItem({ type: "commandExecution" }), true);
});

test("copies execution process as Markdown without the final answer", () => {
  const markdown = turnProcessMarkdown({
    plan: {
      explanation: "先检查，再修改。",
      plan: [
        { step: "检查", status: "completed" },
        { step: "修改", status: "inProgress" },
      ],
    },
    items: [
      { id: "reasoning", type: "reasoning", summary: ["确认边界"], status: "completed" },
      { id: "command", type: "commandExecution", cwd: "C:\\project", command: "npm test", aggregatedOutput: "44 passed", exitCode: 0, status: "completed" },
      { id: "answer", type: "agentMessage", phase: "final", text: "# 最终回答\n\n完成。" },
    ],
  });
  assert.match(markdown, /^## 计划/m);
  assert.match(markdown, /- \[x\] 检查/);
  assert.match(markdown, /- \[ \] 修改（进行中）/);
  assert.match(markdown, /### 思考\n\n确认边界/);
  assert.match(markdown, /### 命令\n\n```text\n目录：C:\\project\n\nnpm test\n\n44 passed\n\n退出码：0\n```/);
  assert.doesNotMatch(markdown, /最终回答/);
});

test("recognizes previewable text and source files", () => {
  assert.equal(textPreviewKind("README.md"), "markdown");
  assert.equal(textPreviewKind("settings.json"), "json");
  assert.equal(textPreviewKind("server.log"), "text");
  assert.equal(textPreviewKind("server/index.mjs"), "code");
  assert.equal(textPreviewKind("Dockerfile"), "code");
  assert.equal(textPreviewKind(".env.production"), "code");
  assert.equal(textPreviewKind("project.csproj"), "code");
  assert.equal(textPreviewKind("release.apk"), null);
});

test("parses standard, 256-color, and true-color terminal output", () => {
  const tokens = parseAnsiOutput("plain \u001b[31mred\u001b[0m \u001b[38;5;42mgreen\u001b[0m \u001b[38;2;12;34;56mrgb\u001b[0m");
  assert.equal(tokens.map((token) => token.text).join(""), "plain red green rgb");
  assert.equal(tokens.find((token) => token.text === "red").foreground, "#b42318");
  assert.equal(tokens.find((token) => token.text === "green").foreground, "rgb(0, 215, 135)");
  assert.equal(tokens.find((token) => token.text === "rgb").foreground, "rgb(12, 34, 56)");
});

test("continues ANSI styles and incomplete escape sequences across output chunks", () => {
  const stream = createAnsiOutputState();
  const first = parseAnsiOutputChunk("plain \u001b[38;5", stream);
  const second = parseAnsiOutputChunk(";42mgreen", stream);
  const third = parseAnsiOutputChunk(" still green\u001b[0m plain", stream);
  assert.equal(first.map((token) => token.text).join(""), "plain ");
  assert.equal(second[0].foreground, "rgb(0, 215, 135)");
  assert.equal(third[0].foreground, "rgb(0, 215, 135)");
  assert.equal(third.at(-1).foreground, null);
});

test("classifies diff lines without truncating their contents", () => {
  assert.equal(diffLineKind("@@ -2,3 +2,4 @@"), "hunk");
  assert.equal(diffLineKind("+const ready = true;"), "added");
  assert.equal(diffLineKind("-const ready = false;"), "removed");
  assert.equal(diffLineKind(" unchanged"), "context");
  const longLine = `+${"x".repeat(20_000)}`;
  assert.equal(diffLineKind(longLine), "added");
  assert.equal(longLine.length, 20_001);
});

test("counts added and removed diff lines without counting file headers", () => {
  assert.deepEqual(diffLineStats([{ diff: "--- a/app.js\n+++ b/app.js\n@@ -1 +1,2 @@\n-old\n+new\n+more\n unchanged" }]), {
    added: 2,
    removed: 1,
  });
});

test("splits a live turn diff into per-file changes", () => {
  assert.deepEqual(unifiedDiffChanges([
    "diff --git a/public/app.js b/public/app.js",
    "index 1..2 100644",
    "--- a/public/app.js",
    "+++ b/public/app.js",
    "@@ -1 +1,2 @@",
    "-old",
    "+new",
    "+more",
    "diff --git a/old.txt b/old.txt",
    "deleted file mode 100644",
    "--- a/old.txt",
    "+++ /dev/null",
    "@@ -1 +0,0 @@",
    "-gone",
  ].join("\n")), [
    { path: "public/app.js", kind: "update", diff: "diff --git a/public/app.js b/public/app.js\nindex 1..2 100644\n--- a/public/app.js\n+++ b/public/app.js\n@@ -1 +1,2 @@\n-old\n+new\n+more" },
    { path: "old.txt", kind: "delete", diff: "diff --git a/old.txt b/old.txt\ndeleted file mode 100644\n--- a/old.txt\n+++ /dev/null\n@@ -1 +0,0 @@\n-gone" },
  ]);
});

test("counts complete file contents for added and deleted files", () => {
  assert.deepEqual(diffLineStats([
    { kind: { type: "add" }, diff: "first\n-second-looking-content\nthird\n" },
    { kind: { type: "delete" }, diff: "old first\n+old-looking-content" },
  ]), { added: 3, removed: 2 });
  assert.equal(diffLineKind("-content", "add"), "added");
  assert.equal(diffLineKind("+content", "delete"), "removed");
  assert.equal(textLineCount("one\ntwo\n"), 2);
});

test("keeps an in-progress command timer live when duration is temporarily zero", () => {
  assert.deepEqual(elapsedTiming({ status: "inProgress", startedAt: 1_700_000_000_000, durationMs: 0 }), {
    startedAt: 1_700_000_000_000,
    completedAt: null,
    durationMs: null,
    final: false,
  });
  assert.deepEqual(elapsedTiming({ status: "completed", startedAt: 1_700_000_000_000, durationMs: 812 }), {
    startedAt: 1_700_000_000_000,
    completedAt: null,
    durationMs: 812,
    final: true,
  });
  assert.deepEqual(elapsedTiming({ status: "completed", startedAt: 1_700_000_000_000 }), {
    startedAt: null,
    completedAt: null,
    durationMs: null,
    final: true,
  });
});

test("uses Sol Medium Standard for an unconfigured project", () => {
  assert.deepEqual(newThreadSettings({ projectId: "project-1" }), {
    model: "gpt-5.6-sol",
    effort: "medium",
    serviceTier: "",
    summary: "detailed",
    collaborationMode: "default",
  });
});

test("new threads inherit the current thread settings in the same project", () => {
  assert.deepEqual(newThreadSettings({
    projectId: "project-1",
    projectSettings: { model: "gpt-5.6-sol", effort: "medium" },
    currentThread: {
      runtime: { projectId: "project-1" },
      settings: { model: "gpt-5.6-sol", effort: "high", serviceTier: "fast", summary: "concise" },
    },
  }), {
    model: "gpt-5.6-sol",
    effort: "high",
    serviceTier: "fast",
    summary: "concise",
    collaborationMode: "default",
  });
});

test("treats /plan as the Plan mode shortcut without claiming Goal support", () => {
  assert.deepEqual(planShortcut("/plan"), { prompt: "" });
  assert.deepEqual(planShortcut(" /PLAN inspect first "), { prompt: "inspect first" });
  assert.equal(planShortcut("/goal"), null);
  assert.equal(planShortcut("explain /plan"), null);
});

test("removes line and column suffixes from Windows file links before previewing", () => {
  assert.deepEqual(downloadableFiles("[app.js](C:/Workspace/sample/public/app.js:376)"), {
    text: "app.js",
    files: [{ path: "C:/Workspace/sample/public/app.js", name: "app.js", label: "app.js" }],
  });
  assert.deepEqual(downloadableFiles("[worker.mjs](<F:/GPT Server/worker.mjs:12:8>)").files[0], {
    path: "F:/GPT Server/worker.mjs",
    name: "worker.mjs",
    label: "worker.mjs",
  });
});

test("turns Codex file citation directives into downloadable files", () => {
  assert.deepEqual(downloadableFiles(':codex-file-citation{path="F:/GPTData/hu/Meta0/deliverables/从数据资产到可执行多因子模型_教材.docx" purpose="output"}'), {
    text: "",
    files: [{
      path: "F:/GPTData/hu/Meta0/deliverables/从数据资产到可执行多因子模型_教材.docx",
      name: "从数据资产到可执行多因子模型_教材.docx",
      label: "从数据资产到可执行多因子模型_教材.docx",
    }],
  });
  assert.deepEqual(downloadableFiles('文件已生成。\n\n:codex-file-citation{purpose="output" path=\'C:\\Exports\\report.docx\' name="教材"}'), {
    text: "文件已生成。",
    files: [{ path: "C:\\Exports\\report.docx", name: "report.docx", label: "教材" }],
  });
});

test("uses the project that actually contains a linked local file", () => {
  const projects = [
    { id: "default", path: "C:\\Workspace\\default" },
    { id: "source", path: "D:\\Code\\sample-project" },
  ];
  assert.equal(projectForLocalFile(projects, "D:/Code/sample-project/public/app.js")?.id, "source");
  assert.equal(projectForLocalFile(projects, "D:/Code/sample-project-copy/app.js"), null);
  assert.equal(projectForLocalFile(projects, "C:/Unrelated/public/app.js"), null);
});

test("selects the six most recently updated chats across projects", () => {
  const projects = [{ id: "a", name: "A" }, { id: "b", name: "B" }];
  const threads = new Map([
    ["a", [{ id: "old", updatedAt: "2026-08-01T00:00:00Z" }]],
    ["b", Array.from({ length: 7 }, (_, index) => ({ id: `b-${index}`, updatedAt: `2026-08-0${index + 1}T00:00:00Z` }))],
  ]);
  const recent = recentThreadEntries(projects, threads);
  assert.equal(recent.length, 6);
  assert.deepEqual(recent.map(({ thread }) => thread.id), ["b-6", "b-5", "b-4", "b-3", "b-2", "b-1"]);
});

test("orders recent chats by when the user opened them", () => {
  const projects = [{ id: "project", name: "Project" }];
  const threads = new Map([["project", [
    { id: "new-message", updatedAt: "2026-08-05T12:00:00Z" },
    { id: "opened-earlier", updatedAt: "2026-08-01T12:00:00Z", accessedAt: "2026-08-05T12:01:00Z" },
    { id: "opened-latest", updatedAt: "2026-08-01T12:00:00Z", accessedAt: "2026-08-05T12:02:00Z" },
  ]] ]);

  assert.deepEqual(recentThreadEntries(projects, threads, 30).map(({ thread }) => thread.id), [
    "opened-latest",
    "opened-earlier",
    "new-message",
  ]);
});

test("uses the thread preview when a list entry has no explicit name", () => {
  assert.equal(threadDisplayName({ name: null, preview: "Goal management" }), "Goal management");
  assert.equal(threadDisplayName({ name: "Renamed chat", preview: "Goal management" }), "Renamed chat");
  assert.equal(threadDisplayName({ name: null, preview: "" }), "未命名聊天");
});

test("does not let a stale thread refresh undo recent access order", () => {
  assert.deepEqual(mergeListedThread(
    { id: "thread", name: "Old name", accessedAt: "2026-08-05T12:02:00Z" },
    { id: "thread", name: "Current name", updatedAt: "2026-08-05T12:03:00Z", accessedAt: "2026-08-05T12:01:00Z" },
  ), {
    id: "thread",
    name: "Current name",
    updatedAt: "2026-08-05T12:03:00Z",
    accessedAt: "2026-08-05T12:02:00Z",
  });
});

test("thread-list refresh clears stale runtime without erasing loaded messages", () => {
  const turns = [{ id: "turn-1", items: [{ id: "answer-1", type: "agentMessage", text: "Done" }] }];
  const merged = mergeListedThread(
    { id: "thread", turns, history: { hasMore: false }, runtime: { activeTurnId: "turn-1", status: "running", startedAt: 1_000 } },
    { id: "thread", runtime: { activeTurnId: null, status: "idle", startedAt: null } },
  );
  assert.equal(merged.turns, turns);
  assert.deepEqual(merged.runtime, { activeTurnId: null, status: "idle", startedAt: null });
});

test("does not let a thread-list summary erase loaded messages", () => {
  const turns = [{ id: "latest", items: [{ id: "answer", type: "agentMessage", text: "Latest answer" }] }];
  const merged = mergeListedThread(
    { id: "thread", turns, history: { hasMore: true, before: "older" }, syncedUpdatedAt: "2026-08-08T12:00:00Z" },
    { id: "thread", name: "Current name", turns: [], updatedAt: "2026-08-08T12:01:00Z" },
  );
  assert.equal(merged.turns, turns);
  assert.deepEqual(merged.history, { hasMore: true, before: "older" });
});

test("turn completion keeps live user messages missing from its item snapshot", () => {
  const user = {
    id: "user-1",
    type: "userMessage",
    content: [{ type: "text", text: "Keep this message" }],
    clientPending: true,
  };
  const final = { id: "answer-1", type: "agentMessage", text: "Done", phase: "final" };

  assert.deepEqual(mergeTurnItems([user, final], [{ ...final, status: "completed" }]), [
    user,
    { ...final, status: "completed" },
  ]);
  assert.deepEqual(mergeTurnItems([user], [{ ...user, clientPending: undefined }]), [{
    id: "user-1",
    type: "userMessage",
    content: [{ type: "text", text: "Keep this message" }],
  }]);
});

test("keeps streamed history usable until canonical history replaces it", () => {
  const loaded = {
    turns: [],
    history: { hasMore: false },
    updatedAt: "2026-08-08T12:00:00Z",
    syncedUpdatedAt: "2026-08-08T12:00:00Z",
  };
  assert.equal(hasCurrentThreadHistory(loaded), true);
  assert.equal(hasCurrentThreadHistory({ ...loaded, historyLive: true, syncedUpdatedAt: null, updatedAt: "2026-08-08T12:01:00Z" }), true);
  assert.equal(hasCurrentThreadHistory({ ...loaded, syncedUpdatedAt: null }), false);
  assert.equal(hasCurrentThreadHistory({ ...loaded, updatedAt: "2026-08-08T12:01:00Z" }), false);
  assert.equal(hasCurrentThreadHistory({ turns: [], history: { hasMore: false } }), false);
});

test("does not let an older thread-list response remove a newly created chat", () => {
  const old = { id: "old", name: "Old" };
  const baseline = [old];
  const liveOld = { ...old, runtime: { status: "running", activeTurnId: "turn-1" } };
  const createdWhileLoading = { id: "new", name: "New" };
  const merged = mergeRefreshedThreads(baseline, [liveOld, createdWhileLoading], [{ id: "old", name: "Stale" }]);
  assert.deepEqual(merged.threads, [createdWhileLoading, liveOld]);
  assert.deepEqual(merged.removedThreadIds, []);
});

test("removes only chats that existed when a thread-list request began", () => {
  const removed = { id: "removed" };
  const draft = { id: "local-draft" };
  const merged = mergeRefreshedThreads([removed, draft], [removed, draft], []);
  assert.deepEqual(merged.threads, [draft]);
  assert.deepEqual(merged.removedThreadIds, ["removed"]);
});

test("builds plan state from structured app-server updates", () => {
  const plan = turnPlanSnapshot({
    explanation: "Keep the current UI baseline.",
    plan: [
      { step: "Inspect", status: "completed" },
      { step: "Implement", status: "inProgress" },
      { step: "Verify", status: "pending" },
    ],
  });
  assert.deepEqual(turnPlanPresentation(plan), {
    ...plan,
    completed: 1,
    total: 3,
    title: "Implement",
    status: "inProgress",
  });
});

test("restores command rows omitted by Codex thread history", () => {
  const items = [
    { id: "user-1", type: "userMessage" },
    { id: "reasoning-1", type: "reasoning" },
    { id: "answer-1", type: "agentMessage", phase: "final" },
  ];
  const restored = restoreMissingExecutionItems(items, {
    "reasoning-1": { type: "reasoning", startedAt: 1_000, completedAt: 2_000 },
    "exec-1": {
      type: "commandExecution",
      startedAt: 2_500,
      completedAt: 3_500,
      durationMs: 1_000,
      snapshot: { id: "exec-1", type: "commandExecution", command: "npm test", cwd: "C:\\project", status: "completed" },
    },
  });
  assert.deepEqual(restored.map((item) => item.id), ["user-1", "reasoning-1", "exec-1", "answer-1"]);
  assert.equal(restored[2].status, "completed");
  assert.equal(restored[2].durationMs, 1_000);
});

test("persists command text and a bounded output tail for future history restoration", () => {
  const snapshot = commandExecutionSnapshot({
    id: "exec-1",
    type: "commandExecution",
    command: "python run.py search --candidates 48",
    cwd: "C:\\Workspace\\project",
    status: "completed",
    aggregatedOutput: `${"old ".repeat(MAX_SAVED_COMMAND_OUTPUT)}done`,
    exitCode: 0,
    durationMs: 12_345,
  });
  assert.equal(snapshot.aggregatedOutput.length, MAX_SAVED_COMMAND_OUTPUT);
  assert.equal(snapshot.aggregatedOutput.endsWith("done"), true);
  assert.equal(snapshot.outputTruncated, true);
  const [restored] = restoreMissingExecutionItems([], {
    "exec-1": { type: "commandExecution", startedAt: 1_000, completedAt: 13_345, snapshot },
  });
  assert.equal(restored.command, "python run.py search --candidates 48");
  assert.equal(restored.aggregatedOutput.endsWith("done"), true);
  assert.equal(restored.exitCode, 0);
});

test("keeps only the newest live command output once the display buffer is full", () => {
  const previous = "a".repeat(MAX_LIVE_COMMAND_OUTPUT - 4);
  const result = commandOutputTail(previous, "0123456789");
  assert.equal(result.text.length, MAX_LIVE_COMMAND_OUTPUT);
  assert.equal(result.text.endsWith("0123456789"), true);
  assert.equal(result.truncated, true);
});

test("shows the command inside a PowerShell launcher instead of the launcher path", () => {
  assert.equal(
    commandDisplayText('"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -NoLogo -NoProfile -Command "npm run check"'),
    "npm run check",
  );
  assert.equal(
    commandDisplayText("C:\\Tools\\pwsh.exe -NoProfile -Command Get-ChildItem -Force"),
    "Get-ChildItem -Force",
  );
  assert.equal(commandDisplayText("node test.mjs"), "node test.mjs");
});

test("keeps live command output when refreshed history omits it", () => {
  const [command] = restoreMissingExecutionItems([
    { id: "exec-1", type: "commandExecution", command: "npm test", aggregatedOutput: "", exitCode: 0 },
  ], {
    "exec-1": {
      snapshot: {
        id: "exec-1",
        type: "commandExecution",
        command: "npm test",
        aggregatedOutput: "44 passed",
        outputTruncated: true,
      },
    },
  });
  assert.equal(command.aggregatedOutput, "44 passed");
  assert.equal(command.outputTruncated, true);
  assert.equal(command.exitCode, 0);
});

test("replays a still-running command when an event stream reconnects", () => {
  const active = activeExecutionSnapshots({ items: {
    "exec-running": {
      type: "commandExecution",
      startedAt: 1_000,
      snapshot: { id: "exec-running", type: "commandExecution", command: "python long_job.py", status: "inProgress" },
    },
    "exec-done": {
      type: "commandExecution",
      startedAt: 2_000,
      completedAt: 3_000,
      snapshot: { id: "exec-done", type: "commandExecution", command: "python done.py", status: "completed" },
    },
  } }, "turn-1");
  assert.equal(active.length, 1);
  assert.equal(active[0].id, "exec-running");
  assert.equal(active[0].command, "python long_job.py");
  assert.equal(active[0].turnId, "turn-1");
});

test("formats running time with stable-width fields", () => {
  assert.equal(formatElapsed(0), "00:00");
  assert.equal(formatElapsed(65_999), "01:05");
  assert.equal(formatElapsed(3_661_000), "1:01:01");
  assert.equal(formatDuration(840), "840 ms");
  assert.equal(formatDuration(1_450), "1.5 秒");
  assert.equal(formatDuration(65_000), "01:05");
});

test("normalizes seconds, milliseconds, and ISO timestamps", () => {
  assert.equal(timestampMilliseconds(1_700_000_000), 1_700_000_000_000);
  assert.equal(timestampMilliseconds(1_700_000_000_123), 1_700_000_000_123);
  assert.equal(timestampMilliseconds("2026-08-04T03:00:00.000Z"), Date.parse("2026-08-04T03:00:00.000Z"));
  assert.equal(timestampMilliseconds(null), null);
});

test("builds and refreshes an in-progress file change item", () => {
  const startedAt = 1_700_000_000_000;
  const first = fileChangeUpdateItem(null, {
    itemId: "patch-1",
    changes: [{ path: "public/app.js", kind: "update", diff: "+first" }],
  });
  const updated = fileChangeUpdateItem({ ...first, startedAt }, {
    itemId: "patch-1",
    changes: [
      { path: "public/app.js", kind: "update", diff: "+second" },
      { path: "public/styles.css", kind: "update", diff: "+style" },
    ],
  });

  assert.equal(updated.type, "fileChange");
  assert.equal(updated.status, "inProgress");
  assert.equal(updated.startedAt, startedAt);
  assert.equal(updated.changes.length, 2);
  assert.equal(updated.changes[0].diff, "+second");
});

test("forces completed notifications and completed history out of the running tone", () => {
  assert.equal(terminalExecutionStatus("inProgress"), "completed");
  assert.equal(terminalExecutionStatus("failed"), "failed");
  assert.deepEqual(
    mergeHistoricalExecutionItem(
      { id: "reasoning-1", type: "reasoning" },
      { status: "inProgress", startedAt: 1000, completedAt: 2000 },
      "completed",
    ),
    { id: "reasoning-1", type: "reasoning", status: "completed", startedAt: 1000, completedAt: 2000 },
  );
});

test("stops stale execution items after reconnecting to an idle thread", () => {
  const stale = reconcileStaleExecutionTurn({
    id: "turn-old",
    status: "inProgress",
    items: [
      { id: "reasoning-old", type: "reasoning", status: "inProgress", startedAt: 1_000 },
      { id: "message-old", type: "agentMessage", status: "completed" },
    ],
  }, { activeTurnId: null, status: "idle" }, 3_000);

  assert.equal(stale.status, "interrupted");
  assert.equal(stale.completedAt, 3_000);
  assert.equal(stale.items[0].status, "interrupted");
  assert.equal(stale.items[0].completedAt, 3_000);
  assert.equal(stale.items[1].status, "completed");
});

test("closes an unfinished item at the recorded turn completion time", () => {
  const startedAt = 1_700_000_001_000;
  const completedAt = 1_700_000_004_000;
  const completed = reconcileStaleExecutionTurn({
    id: "turn-complete",
    status: "completed",
    completedAt,
    items: [{ id: "command", type: "commandExecution", status: "completed", startedAt }],
  }, { activeTurnId: null, status: "idle" }, 1_700_000_009_000);

  assert.equal(completed.completedAt, completedAt);
  assert.equal(completed.items[0].completedAt, completedAt);
});

test("keeps the actual active turn running after reconnecting", () => {
  const active = { id: "turn-current", status: "inProgress", items: [] };
  assert.equal(reconcileStaleExecutionTurn(active, {
    activeTurnId: "turn-current",
    status: "running",
  }), active);
});

test("promotes stale completed history when runtime says the turn is still active", () => {
  const turn = { id: "turn-1", status: "completed", items: [] };
  const reconciled = reconcileStaleExecutionTurn(turn, { activeTurnId: "turn-1", status: "running" });
  assert.equal(reconciled.status, "inProgress");
});

test("separates recorded command time from the rest of a turn", () => {
  const turn = { durationMs: 12_000 };
  const items = [
    { type: "commandExecution", durationMs: 2_000 },
    { type: "fileChange", startedAt: 1_700_000_004_000, completedAt: 1_700_000_005_000 },
    { type: "mcpToolCall", durationMs: 3_000 },
    { type: "reasoning", startedAt: 1_700_000_001_000, completedAt: 1_700_000_003_000 },
  ];
  assert.equal(executionItemDuration(items[1]), 1_000);
  assert.deepEqual(summarizeExecutionTiming(turn, items), {
    totalMs: 12_000,
    commandMs: 2_000,
    commandCount: 1,
    commandUnknownCount: 0,
    codexMs: 10_000,
  });
});

test("marks summaries incomplete instead of reporting false zeroes", () => {
  assert.deepEqual(summarizeExecutionTiming({ durationMs: 10_000 }, [
    { type: "commandExecution" },
    { type: "fileChange", durationMs: 2_000 },
  ]), {
    totalMs: 10_000,
    commandMs: 0,
    commandCount: 1,
    commandUnknownCount: 1,
    codexMs: null,
  });
});

test("calculates current context window usage from the latest model call", () => {
  assert.deepEqual(contextWindowUsage({
    total: { totalTokens: 80_000 },
    last: { totalTokens: 25_840 },
    modelContextWindow: 258_400,
  }), { usedTokens: 25_840, contextWindow: 258_400, usedPercent: 10 });
});

test("selects 5-hour and weekly Codex rate-limit windows", () => {
  assert.deepEqual(accountLimitWindows({
    available: true,
    rateLimits: {
      primary: { usedPercent: 17, windowDurationMins: 300, resetsAt: 100 },
      secondary: { usedPercent: 24, windowDurationMins: 10_080, resetsAt: 200 },
    },
  }), {
    fiveHour: { usedPercent: 17, resetsAt: 100 },
    weekly: { usedPercent: 24, resetsAt: 200 },
  });
});
