import { randomUUID } from "node:crypto";
import { answersFor } from "./protocol-values.mjs";
import { httpError } from "../../workspace-store.mjs";

const DECISIONS = { accept: "允许这次", acceptForSession: "本会话允许", decline: "拒绝", cancel: "取消" };

export class CodexRequests {
  pending = new Map();
  browserSessions = new Map();
  constructor({ connection, projection, autoApprove, autoApproveBrowser }) {
    Object.assign(this, { connection, projection, autoApprove, autoApproveBrowser });
    connection.authorizeBrowserAccess = ({ sessionId, turnId }) => this.browserAccess(sessionId, turnId);
  }
  receive(message) {
    const id = message.params?.threadId;
    if (!id) { this.connection.respondError(message.id, -32602, "请求缺少会话信息。"); return; }
    const request = { ...message, id: String(message.id), nativeId: message.id, conversationId: id };
    if (message.method === "item/tool/requestUserInput") {
      const questions = message.params.questions;
      if (!Array.isArray(questions) || !questions.length || questions.length > 3 || JSON.stringify(questions).length > 20_000 || questions.some((question) => !question.id || !question.question || !question.header)) {
        this.connection.respondError(message.id, -32602, "提问格式无效。"); return;
      }
      request.questions = questions.map((question) => ({ id: question.id, header: question.header, question: question.question,
        isOther: question.isOther === true, isSecret: question.isSecret === true,
        options: (question.options || []).map(({ label, description }) => ({ label, description })) }));
      request.kind = "question";
    } else if (["item/commandExecution/requestApproval", "item/fileChange/requestApproval", "item/permissions/requestApproval"].includes(message.method)) {
      request.kind = "approval";
      request.choices = message.params.availableDecisions || Object.keys(DECISIONS);
      const automatic = request.choices.includes("acceptForSession") ? "acceptForSession" : request.choices.includes("accept") ? "accept" : null;
      if (this.autoApprove && automatic) { this.replyApproval(request, automatic); return; }
    } else { this.connection.respondError(message.id, -32601, "当前工作台不支持这个请求。"); return; }
    this.pending.set(request.id, request); this.projection.emit(id, { kind: "controls.changed" });
  }
  resolved(requestId) {
    const request = this.pending.get(String(requestId));
    if (request) { this.pending.delete(request.id); this.projection.emit(request.conversationId, { kind: "controls.changed" }); }
  }
  snapshot(id) {
    const list = [...this.pending.values()].filter((request) => request.conversationId === id);
    return {
      questions: list.filter((request) => request.kind === "question").map((request) => ({ id: request.id, delivery: "blocking", questions: request.questions })),
      approvals: list.filter((request) => request.kind === "approval").map((request) => ({ id: request.id,
        title: request.kind === "browser" || request.browser ? "浏览器访问" : request.method.includes("fileChange") ? "文件修改审批" : request.method.includes("permissions") ? "权限审批" : "命令审批",
        description: String(request.params.reason || request.params.command || JSON.stringify(request.params.permissions || request.params.changes || "")).slice(0, 16_000),
        decisions: request.choices.map((value, index) => ({ value: String(index), label: typeof value === "string" ? DECISIONS[value] || value : Object.hasOwn(value, "acceptWithExecpolicyAmendment") ? "允许并更新执行策略" : "更新网络策略" })) })),
    };
  }
  answer(id, requestId, candidate) {
    const request = this.require(id, requestId, "question");
    const answers = answersFor(request.questions, candidate);
    this.connection.respond(request.nativeId, { answers }); this.resolved(request.id);
  }
  approve(id, requestId, choiceId) {
    const request = this.require(id, requestId, "approval");
    const index = Number(choiceId), decision = request.choices[index];
    if (!Number.isSafeInteger(index) || String(index) !== choiceId || !decision) throw httpError(400, "审批决定无效。");
    if (request.browser) this.browserSessions.set(id, { allowed: decision === "acceptForSession", runId: request.params.turnId });
    else this.replyApproval(request, decision);
    this.resolved(request.id);
  }
  replyApproval(request, decision) {
    if (request.method === "item/permissions/requestApproval") this.connection.respond(request.nativeId, {
      permissions: ["accept", "acceptForSession"].includes(decision) ? request.params.permissions || {} : {},
      ...(["accept", "acceptForSession"].includes(decision) ? { scope: decision === "acceptForSession" ? "session" : "turn" } : {}),
    });
    else this.connection.respond(request.nativeId, { decision });
  }
  require(id, requestId, kind) {
    const request = this.pending.get(requestId);
    if (!request || request.conversationId !== id || request.kind !== kind) throw httpError(409, "这个请求已经结束。");
    return request;
  }
  async browserAccess(id, runId) {
    const active = () => this.connection.loadedThreads.has(id) && this.projection.sessions.get(id)?.activeRunId === runId;
    if (!active()) throw new Error("浏览器权限请求不属于当前执行中的会话。");
    const [policy, settings] = await Promise.all([this.connection.request("configRequirements/read", {}), this.connection.request("config/read", { includeLayers: false })]);
    if (!policy || !Object.hasOwn(policy, "requirements") || !settings?.config || typeof settings.config !== "object") throw new Error("无法读取浏览器权限策略。");
    const constraints = policy.requirements, features = settings.config.features;
    if (constraints?.allowBrowserAndComputerUse === false || [constraints?.featureRequirements?.browser_use, constraints?.featureRequirements?.browser_use_external,
      features?.browser_use, features?.browser_use_external].includes(false)) throw new Error("当前管理策略禁止使用本机浏览器。");
    if (!active()) throw new Error("当前执行任务已经变化。");
    const previous = this.browserSessions.get(id);
    if (previous?.allowed || this.autoApproveBrowser) return true;
    if (previous?.allowed === false && previous.runId === runId) throw new Error("用户已拒绝本轮任务使用本机浏览器。");
    if (![...this.pending.values()].some((request) => request.browser && request.conversationId === id)) {
      const requestId = `browser-${randomUUID()}`;
      this.pending.set(requestId, { id: requestId, kind: "approval", browser: true, conversationId: id, choices: ["decline", "acceptForSession"],
        params: { turnId: runId, reason: "允许后，此会话可读取和操作本机浏览器，包括已登录的网站。网站权限和操作确认仍然适用。" } });
      this.projection.emit(id, { kind: "controls.changed" });
    }
    throw new Error("请先在工作台的浏览器审批卡中选择允许，再重试浏览器操作。");
  }
  forget(id) {
    for (const request of this.pending.values()) if (request.conversationId === id) this.pending.delete(request.id);
    this.browserSessions.delete(id);
  }
  reset() { const ids = new Set([...this.pending.values()].map((request) => request.conversationId)); this.pending.clear(); for (const id of ids) this.projection.emit(id, { kind: "controls.changed" }); }
}
