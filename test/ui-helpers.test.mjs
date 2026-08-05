import test from "node:test";
import assert from "node:assert/strict";

import { elapsedTiming, formatDuration, formatElapsed, timestampMilliseconds } from "../public/elapsed-time.js";
import { downloadableFiles } from "../public/file-downloads.js";
import { fileChangeUpdateItem, mergeHistoricalExecutionItem, reconcileStaleExecutionTurn, terminalExecutionStatus } from "../public/execution-events.js";
import { executionCategory, executionItemDuration, summarizeExecutionTiming } from "../public/execution-timing.js";
import { activeExecutionSnapshots, commandExecutionSnapshot } from "../public/execution-snapshot.js";
import { textPreviewKind } from "../public/file-preview.js";
import { projectForLocalFile } from "../public/file-access.js";
import { recentThreadEntries } from "../public/recent-threads.js";
import { alignItemMetrics, restoreMissingExecutionItems } from "../public/timing-alignment.js";
import { parseTimingState, resolveActiveTurnStartedAt, serializeTimingState } from "../public/timing-persistence.js";
import { accountLimitWindows, contextWindowUsage } from "../public/usage-indicators.js";
import { newThreadSettings } from "../public/thread-defaults.js";
import { parseAnsiOutput } from "../public/ansi-output.js";
import { diffLineKind, diffLineStats, textLineCount } from "../public/diff-output.js";
import { isMobileComposer, shouldSubmitPromptFromKeyboard } from "../public/composer-input.js";
import { plainInlineMarkdown } from "../public/text-format.js";

test("keeps IME and mobile Enter keys inside the prompt", () => {
  assert.equal(shouldSubmitPromptFromKeyboard({ key: "Enter", shiftKey: false, isComposing: true, keyCode: 13 }), false);
  assert.equal(shouldSubmitPromptFromKeyboard({ key: "Enter", shiftKey: false, isComposing: false, keyCode: 229 }), false);
  assert.equal(shouldSubmitPromptFromKeyboard({ key: "Enter", shiftKey: false, isComposing: false, keyCode: 13 }, { mobile: true }), false);
  assert.equal(shouldSubmitPromptFromKeyboard({ key: "Enter", shiftKey: false, isComposing: false, keyCode: 13 }), true);
  assert.equal(isMobileComposer({ userAgent: "Mozilla/5.0 (Linux; Android 15) Mobile" }), true);
});

test("removes lightweight Markdown markers from execution titles", () => {
  assert.equal(plainInlineMarkdown("**Finalizing deployment**"), "Finalizing deployment");
  assert.equal(plainInlineMarkdown("Review `server.mjs`"), "Review server.mjs");
});

test("recognizes previewable text and source files", () => {
  assert.equal(textPreviewKind("README.md"), "markdown");
  assert.equal(textPreviewKind("settings.json"), "json");
  assert.equal(textPreviewKind("server.log"), "text");
  assert.equal(textPreviewKind("server.mjs"), "code");
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
});

test("uses Sol Medium Standard for an unconfigured project", () => {
  assert.deepEqual(newThreadSettings({ projectId: "project-1" }), {
    model: "gpt-5.6-sol",
    effort: "medium",
    serviceTier: "",
    summary: "detailed",
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
  });
});

test("removes line and column suffixes from Windows file links before previewing", () => {
  assert.deepEqual(downloadableFiles("[app.js](C:/Workspace/sample/public/app.js:376)"), {
    text: "",
    files: [{ path: "C:/Workspace/sample/public/app.js", name: "app.js", label: "app.js" }],
  });
  assert.deepEqual(downloadableFiles("[worker.mjs](<F:/GPT Server/worker.mjs:12:8>)").files[0], {
    path: "F:/GPT Server/worker.mjs",
    name: "worker.mjs",
    label: "worker.mjs",
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

test("restores timing when resumed history uses synthetic item ids", () => {
  const items = [
    { id: "item-261", type: "reasoning" },
    { id: "exec-stable", type: "fileChange" },
    { id: "item-262", type: "reasoning" },
  ];
  const metrics = {
    "reasoning-old": { type: "reasoning", startedAt: 1000, completedAt: 2000 },
    "reasoning-latest": { type: "reasoning", startedAt: 3000, completedAt: 4000 },
    "exec-stable": { type: "fileChange", startedAt: 2500, completedAt: 2600 },
  };
  const aligned = alignItemMetrics(items, metrics);
  assert.equal(aligned.get("item-261").startedAt, 1000);
  assert.equal(aligned.get("exec-stable").startedAt, 2500);
  assert.equal(aligned.get("item-262").startedAt, 3000);
});

test("restores command rows omitted by Codex thread history", () => {
  const items = [
    { id: "user-1", type: "userMessage" },
    { id: "reasoning-1", type: "reasoning" },
    { id: "answer-1", type: "agentMessage", phase: "final" },
  ];
  const restored = restoreMissingExecutionItems(items, {
    "reasoning-1": { type: "reasoning", startedAt: 1_000, completedAt: 2_000 },
    "exec-1": { type: "commandExecution", startedAt: 2_500, completedAt: 3_500, durationMs: 1_000 },
  });
  assert.deepEqual(restored.map((item) => item.id), ["user-1", "reasoning-1", "exec-1", "answer-1"]);
  assert.equal(restored[2].status, "completed");
  assert.equal(restored[2].durationMs, 1_000);
});

test("persists command text for future history restoration", () => {
  const snapshot = commandExecutionSnapshot({
    id: "exec-1",
    type: "commandExecution",
    command: "python run.py search --candidates 48",
    cwd: "C:\\Workspace\\project",
    status: "completed",
    aggregatedOutput: "done",
    exitCode: 0,
    durationMs: 12_345,
  });
  const [restored] = restoreMissingExecutionItems([], {
    "exec-1": { type: "commandExecution", startedAt: 1_000, completedAt: 13_345, snapshot },
  });
  assert.equal(restored.command, "python run.py search --candidates 48");
  assert.equal(restored.aggregatedOutput, "done");
  assert.equal(restored.exitCode, 0);
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
      { id: "reasoning-old", type: "reasoning", status: "inProgress" },
      { id: "message-old", type: "agentMessage", status: "completed" },
    ],
  }, { activeTurnId: null, status: "idle" });

  assert.equal(stale.status, "interrupted");
  assert.equal(stale.items[0].status, "interrupted");
  assert.equal(stale.items[1].status, "completed");
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

test("classifies local tools and summarizes known execution time", () => {
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
    localMs: 6_000,
    networkMs: 0,
    modelMs: 6_000,
    localCount: 3,
    networkCount: 0,
    localUnknownCount: 0,
    networkUnknownCount: 0,
    modelEstimated: true,
  });
  assert.equal(executionCategory({ type: "dynamicToolCall", namespace: "functions", tool: "exec" }), "local");
  assert.equal(executionCategory({ type: "mcpToolCall", server: "node_repl", tool: "js" }), "local");
  assert.equal(executionCategory({ type: "mcpToolCall", server: "browser", tool: "navigate" }), "network");
});

test("marks summaries incomplete instead of reporting false zeroes", () => {
  assert.deepEqual(summarizeExecutionTiming({ durationMs: 10_000 }, [
    { type: "commandExecution" },
    { type: "fileChange", durationMs: 2_000 },
  ]), {
    totalMs: 10_000,
    localMs: 2_000,
    networkMs: 0,
    modelMs: null,
    localCount: 2,
    networkCount: 0,
    localUnknownCount: 1,
    networkUnknownCount: 0,
    modelEstimated: false,
  });
});

test("restores turn and item timing after leaving and reopening the page", () => {
  const turnMetrics = new Map([["turn-1", {
    startedAt: 1_700_000_000_000,
    items: {
      "item-1": { type: "commandExecution", status: "completed", startedAt: 1_700_000_001_000, completedAt: 1_700_000_003_000 },
    },
  }]]);
  const activeTurnStarts = new Map([["thread-1", { turnId: "turn-1", startedAt: 1_700_000_000_000 }]]);
  const restored = parseTimingState(serializeTimingState(turnMetrics, activeTurnStarts));

  assert.deepEqual(restored.turnMetrics.get("turn-1"), turnMetrics.get("turn-1"));
  assert.deepEqual(restored.activeTurnStarts.get("thread-1"), activeTurnStarts.get("thread-1"));
  assert.equal(resolveActiveTurnStartedAt({
    runtime: { activeTurnId: "turn-1", status: "running" },
    saved: restored.activeTurnStarts.get("thread-1"),
    metric: restored.turnMetrics.get("turn-1"),
    now: 1_800_000_000_000,
  }), 1_700_000_000_000);
});

test("does not reuse another turn's saved start time", () => {
  assert.equal(resolveActiveTurnStartedAt({
    runtime: { activeTurnId: "turn-2", status: "running" },
    saved: { turnId: "turn-1", startedAt: 1_700_000_000_000 },
    now: 1_800_000_000_000,
  }), 1_800_000_000_000);
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
