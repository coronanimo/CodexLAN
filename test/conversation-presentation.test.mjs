import assert from "node:assert/strict";
import test from "node:test";
import { turnPlanPresentation, turnPlanSnapshot } from "../public/plan.js";
import { asyncAnswerMessage, asyncAnswerText } from "../public/async-user-input.js";
import { summarizeExecutionTiming, turnProcessMarkdown } from "../public/execution-events.js";
import { diffLineStats, unifiedDiffChanges } from "../public/diff-output.js";

test("footer line counts exclude unified diff headers for added and deleted files", () => {
  const changes = unifiedDiffChanges("diff --git a/new.txt b/new.txt\nnew file mode 100644\n--- /dev/null\n+++ b/new.txt\n@@ -0,0 +1,2 @@\n+first\n+second\ndiff --git a/old.txt b/old.txt\ndeleted file mode 100644\n--- a/old.txt\n+++ /dev/null\n@@ -1 +0,0 @@\n-old");
  assert.deepEqual(diffLineStats(changes), { added: 2, removed: 1 });
  assert.deepEqual(diffLineStats([{ kind: "add", diff: "first\nsecond\n" }, { kind: "delete", diff: "old\n" }]), { added: 2, removed: 1 });
});

test("an absent plan is a normal initial state, including an explicit null", () => {
  assert.deepEqual(turnPlanSnapshot(null), { plan: [] });
  assert.equal(turnPlanPresentation(null).total, 0);
  assert.equal(turnPlanPresentation(undefined).total, 0);
  assert.equal(turnProcessMarkdown({ plan: null }), "");
});

test("read-only answer text comes from the matching history or queue receipt", () => {
  const request = { requestId: "question", questions: [{ id: "q", question: "保留哪些文件？" }] };
  const text = asyncAnswerMessage(request, { q: { answers: ["保留原文件\n包括 <script> 字样"] } });
  const history = [{ items: [{ type: "userMessage", content: [{ type: "text", text }] }] }];
  const expected = "保留哪些文件？\n我的回答：保留原文件\n包括 <script> 字样";
  assert.equal(asyncAnswerText("question", history), expected);
  assert.equal(asyncAnswerText("question", [], [{ text }]), expected);
  assert.equal(asyncAnswerText("other", history), "");
  assert.equal(asyncAnswerText("question", [{ items: [{ type: "agentMessage", text }] }]), "");
});

test("plan progress remains accurate when a turn finishes with incomplete steps", () => {
  const plan = turnPlanPresentation({ plan: [{ step: "检查", status: "completed" }, { step: "验证", status: "inProgress" }] });
  assert.equal(plan.completed, 1);
  assert.equal(plan.total, 2);
  assert.equal(plan.title, "验证");
});

test("process copy retains recovery output without assigning it a transcript position", () => {
  const known = { id: "known", type: "commandExecution", command: "known-command", aggregatedOutput: "known-output" };
  const recovered = { id: "recovered", type: "commandExecution", command: "recovered-command", aggregatedOutput: "recovered-output", durationMs: 2000, recovery: true };
  const text = turnProcessMarkdown({ plan: { plan: [{ step: "检查", status: "completed" }] }, items: [known,
    { id: "final", type: "agentMessage", phase: "final_answer", text: "独立最终答案" }], recovered: [known, recovered, recovered] });
  assert.match(text, /- \[x\] 检查/);
  assert.match(text, /known-output/);
  assert.match(text, /恢复记录 · 原始位置未知[\s\S]*recovered-output/);
  assert.equal(text.match(/known-command/g).length, 1);
  assert.equal(text.match(/recovered-command/g).length, 1);
  assert.doesNotMatch(text, /独立最终答案/);
  const timing = summarizeExecutionTiming({ durationMs: 5000 }, [known, recovered]);
  assert.equal(timing.commandCount, 2);
  assert.equal(timing.commandMs, 2000);
  assert.equal(timing.commandUnknownCount, 1);
  assert.equal(timing.codexMs, null);
});
