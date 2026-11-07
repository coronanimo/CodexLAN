import assert from "node:assert/strict";
import test from "node:test";
import { CodexRequests } from "../server/agents/codex/requests.mjs";

function fixture(options = {}) {
  const replies = [], projection = { sessions: new Map([["c", { activeRunId: "run" }]]), emit() {} };
  const connection = { loadedThreads: new Set(["c"]), respond: (...args) => replies.push(args), respondError: (...args) => replies.push(args),
    request: async (method) => method === "configRequirements/read" ? { requirements: null } : { config: { features: { browser_use: true } } } };
  return { requests: new CodexRequests({ connection, projection, autoApprove: true, autoApproveBrowser: false, ...options }), connection, projection, replies };
}
test("command auto approval never silently grants browser access and grants are scoped to a session", async () => {
  const f = fixture();
  await assert.rejects(f.requests.browserAccess("c", "run"), /审批卡/);
  assert.equal(f.requests.snapshot("c").approvals.length, 1);
  const card = f.requests.snapshot("c").approvals[0];
  assert.throws(() => f.requests.approve("other", card.id, "1"), /结束/);
  f.requests.approve("c", card.id, "1");
  assert.equal(await f.requests.browserAccess("c", "run"), true);
  f.requests.forget("c"); await assert.rejects(f.requests.browserAccess("c", "run"), /审批卡/);
});
test("browser policy and active identity are checked after asynchronous policy reads", async () => {
  const f = fixture({ autoApproveBrowser: true });
  f.connection.request = async (method) => {
    f.projection.sessions.get("c").activeRunId = "new";
    return method === "configRequirements/read" ? { requirements: null } : { config: {} };
  };
  await assert.rejects(f.requests.browserAccess("c", "run"), /已经变化/);
  f.projection.sessions.get("c").activeRunId = "run";
  f.connection.request = async (method) => method === "configRequirements/read" ? { requirements: { allowBrowserAndComputerUse: false } } : { config: {} };
  await assert.rejects(f.requests.browserAccess("c", "run"), /管理策略/);
});
test("refused browser access cannot be requested repeatedly in the same run", async () => {
  const f = fixture(); await assert.rejects(f.requests.browserAccess("c", "run"));
  f.requests.approve("c", f.requests.snapshot("c").approvals[0].id, "0");
  await assert.rejects(f.requests.browserAccess("c", "run"), /已拒绝/);
  f.projection.sessions.get("c").activeRunId = "next";
  await assert.rejects(f.requests.browserAccess("c", "next"), /审批卡/);
});
test("approval decisions are opaque scoped choices and secret answers are validated before sending", () => {
  const f = fixture({ autoApprove: false });
  f.requests.receive({ id: 7, method: "item/commandExecution/requestApproval", params: { threadId: "c", command: "task", availableDecisions: ["decline", { acceptWithExecpolicyAmendment: { execpolicyAmendment: ["node"] } }] } });
  assert.throws(() => f.requests.approve("c", "7", "accept"), /无效/);
  f.requests.approve("c", "7", "1"); assert.deepEqual(f.replies[0][1].decision, { acceptWithExecpolicyAmendment: { execpolicyAmendment: ["node"] } });
  f.requests.receive({ id: 8, method: "item/tool/requestUserInput", params: { threadId: "c", questions: [{ id: "q", header: "密钥", question: "请输入", isSecret: true }] } });
  assert.throws(() => f.requests.answer("c", "8", {}));
  f.requests.answer("c", "8", { q: { answers: ["secret"] } }); assert.equal(f.requests.snapshot("c").questions.length, 0);
});
