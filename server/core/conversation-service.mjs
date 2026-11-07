import { randomUUID } from "node:crypto";
import { httpError } from "../workspace-store.mjs";
import { validateId } from "../http.mjs";

export class ConversationService {
  answers = new Set();
  mutations = new Map();
  constructor(store, queues, resolveAttachments) { this.store = store; this.queues = queues; this.resolveAttachments = resolveAttachments; }
  async controls(agent, id) {
    const state = await agent.controls(id), queue = this.store.queues[id] || [];
    return { ...state, conversationId: id, queueCount: queue.length, queueRevision: this.store.queueRevisions[id] || 0,
      queue: queue.slice(0, 100).map((item) => ({ id: item.id, text: item.text.slice(0, 1200), truncated: item.text.length > 1200,
        ...(item.delivery ? { error: item.delivery.message || (item.delivery.status === "submitting" ? "正在提交" : "等待核对接收结果"), delivery: item.delivery.status } : {}) })),
      answered: await this.store.getAsyncInputAnswers(id) };
  }
  async queueItem(id, itemId) {
    const item = await this.store.getQueueItem(id, itemId);
    return { id: item.id, text: item.text };
  }
  async execute(agent, id, project, command) {
    if (command.type === "submit" || command.type.startsWith("queue.") || command.type === "delete") {
      const previous = this.mutations.get(id) || Promise.resolve();
      const operation = previous.catch(() => {}).then(() => this.perform(agent, id, project, command));
      this.mutations.set(id, operation);
      try { return await operation; }
      finally { if (this.mutations.get(id) === operation) this.mutations.delete(id); }
    }
    return this.perform(agent, id, project, command);
  }
  async perform(agent, id, project, command) {
    const queue = this.queues.get(agent.describe().instanceId);
    switch (command.type) {
      case "submit": return queue.enqueue(id, project, command.text, command.attachments?.length ? await this.resolveAttachments(project, id, command.attachments) : []);
      case "guide": return agent.guide(id, project, { id: randomUUID(), text: command.text, runId: command.runId,
        attachments: command.attachments?.length ? await this.resolveAttachments(project, id, command.attachments) : [] });
      case "queue.remove": return queue.remove(id, validateId(command.itemId, "itemId"));
      case "queue.retry": return queue.retry(id, validateId(command.itemId, "itemId"), command.verified === true);
      case "queue.edit": return queue.edit(id, validateId(command.itemId, "itemId"), { text: command.text });
      case "queue.move": return queue.edit(id, validateId(command.itemId, "itemId"), { direction: command.direction });
      case "queue.guide": return queue.steer({ conversationId: id, itemId: validateId(command.itemId, "itemId"), runId: validateId(command.runId, "runId"), project });
      case "delete": if (queue.busy(id) || this.store.queues[id]?.length) throw httpError(409, "请先处理或清空排队消息，再删除会话。"); break;
      case "answer": if (command.delivery === "async") return this.answer(agent, queue, id, project, command); break;
    }
    return agent.execute(id, project, command);
  }
  async answer(agent, queue, id, project, command) {
    const key = JSON.stringify([id, command.requestId]);
    if (this.answers.has(key)) throw httpError(409, "回答正在提交，请勿重复提交。");
    this.answers.add(key);
    try {
      if ((await this.store.getAsyncInputAnswers(id)).includes(command.requestId)) throw httpError(409, "这个问题已经回答过了。");
      const input = await agent.prepareAnswer(id, command.requestId, command.answers);
      let state = await agent.probe(id, project), result;
      if (state.activeRunId) {
        try { result = await agent.guide(id, project, { id: randomUUID(), text: input.text, runId: state.activeRunId }); }
        catch (error) {
          if (error.delivery !== "rejected" || error.code !== "inactive-run") throw error;
          state = await agent.probe(id, project);
          if (state.status === "running" || state.activeRunId) throw error;
        }
      } else if (state.status === "running") throw httpError(409, "当前任务状态正在同步，请稍后重试。");
      if (!result) result = await queue.enqueue(id, project, input.text);
      await this.store.recordAsyncInputAnswer(id, command.requestId);
      agent.notify(id, { kind: "controls.changed" }); return result;
    } finally { this.answers.delete(key); }
  }
}
