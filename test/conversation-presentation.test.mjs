import assert from "node:assert/strict";
import test from "node:test";
import { turnPlanPresentation, turnPlanSnapshot } from "../public/plan.js";
import { asyncAnswerMessage, asyncAnswerText } from "../public/async-user-input.js";
import { summarizeExecutionTiming, turnMarkdown } from "../public/execution-events.js";
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
  assert.equal(turnMarkdown({ plan: null }), "");
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

test("full-turn copy retains final answers and recovery output without inventing a transcript position", () => {
  const known = { id: "known", type: "commandExecution", command: "known-command", aggregatedOutput: "known-output" };
  const recovered = { id: "recovered", type: "commandExecution", command: "recovered-command", aggregatedOutput: "recovered-output", durationMs: 2000, recovery: true };
  const text = turnMarkdown({ plan: { plan: [{ step: "检查", status: "completed" }] }, items: [known,
    { id: "final", type: "agentMessage", phase: "final_answer", text: "独立最终答案" }], recovered: [known, recovered, recovered] });
  assert.match(text, /- \[x\] 检查/);
  assert.match(text, /known-output/);
  assert.match(text, /恢复记录 · 原始位置未知[\s\S]*recovered-output/);
  assert.equal(text.match(/known-command/g).length, 1);
  assert.equal(text.match(/recovered-command/g).length, 1);
  assert.match(text, /## Codex\n\n独立最终答案/);
  const timing = summarizeExecutionTiming({ durationMs: 5000 }, [known, recovered]);
  assert.equal(timing.commandCount, 2);
  assert.equal(timing.commandMs, 2000);
  assert.equal(timing.commandUnknownCount, 1);
  assert.equal(timing.codexMs, null);
});

test("answer-only turns copy the prompt and original reply for every final phase", () => {
  const prompt = "请保留 **格式** 和 [附件](F:/workspace/input.png)。";
  const answer = "**已完成**\n\n```js\nconst value = 1;\n```";
  for (const phase of ["final", "final_answer", undefined]) {
    assert.equal(turnMarkdown({ items: [
      { id: "user", type: "userMessage", content: [{ type: "text", text: prompt }] },
      { id: "answer", type: "agentMessage", phase, text: answer },
    ] }), `## 你\n\n${prompt}\n\n## Codex\n\n${answer}`);
  }
});

test("full-turn copy preserves ordered messages, complete available output, plans and diffs", () => {
  const output = `OUTPUT-BEGIN\n${"line with ``` inside\n".repeat(1600)}OUTPUT-END`;
  const answer = `ANSWER-BEGIN\n${"完整正文".repeat(5000)}\nANSWER-END`;
  const diff = "--- a/file.js\n+++ b/file.js\n@@ -1 +1 @@\n-old\n+new";
  const text = turnMarkdown({ plan: { explanation: "验证计划", plan: [{ step: "检查", status: "completed" }] }, diff, items: [
    { id: "user", type: "userMessage", content: [{ type: "text", text: "本轮提问" }] },
    { id: "progress", type: "agentMessage", phase: "commentary", text: "先检查当前实现。" },
    { id: "reasoning", type: "reasoning", summary: ["核对复制范围"], content: ["保留所有内容"] },
    { id: "command", type: "commandExecution", command: "copy-all-test", aggregatedOutput: output, exitCode: 0 },
    { id: "guide", type: "userMessage", inputKind: "guide", content: [{ type: "text", text: "补充验收条件" }] },
    { id: "file", type: "fileChange", changes: [{ path: "file.js", diff }] },
    { id: "plan-message", type: "plan", text: "计划模式正文" },
    { id: "answer", type: "agentMessage", phase: "final_answer", text: answer },
    { id: "answer", type: "agentMessage", phase: "final_answer", text: answer },
  ] });
  const ordered = ["本轮提问", "先检查当前实现。", "核对复制范围", "copy-all-test", "补充验收条件", "file.js", "计划模式正文", "ANSWER-BEGIN"];
  for (let index = 1; index < ordered.length; index++) assert.ok(text.indexOf(ordered[index]) > text.indexOf(ordered[index - 1]));
  assert.ok(text.includes(output));
  assert.ok(text.includes(answer));
  assert.match(text, /````text\n[\s\S]*OUTPUT-END[\s\S]*\n````/);
  assert.equal(text.match(/ANSWER-BEGIN/g).length, 1);
  assert.match(text, /## 引导\n\n补充验收条件/);
  assert.match(text, /## 计划\n\n验证计划\n\n- \[x\] 检查/);
  assert.ok(text.includes(`## 累计文件差异\n\n\`\`\`diff\n${diff}`));
  assert.doesNotMatch(text, /内容已截断/);
});

test("full-turn copy includes async questions and readable answers plus unavailable-output notices", () => {
  const request = { requestId: "question", questions: [{ id: "q", question: "是否继续？" }] };
  const text = turnMarkdown({ items: [
    { id: "question", type: "agentMessage", delivery: "async", questions: [{ title: "是否继续？", options: ["继续", "暂停"] }] },
    { id: "answer", type: "userMessage", content: [{ type: "text", text: asyncAnswerMessage(request, { q: { answers: ["继续"] } }) }] },
    { id: "command", type: "commandExecution", command: "recover-command", aggregatedOutput: "remaining-output", outputTruncated: true },
  ] });
  assert.match(text, /## 提问\n\n是否继续？\n- 继续\n- 暂停/);
  assert.match(text, /## 你\n\n回答你的提问：[\s\S]*我的回答：继续/);
  assert.doesNotMatch(text, /CodexLAN async answer/);
  assert.match(text, /前面的实时命令输出已截断[\s\S]*remaining-output/);
});
