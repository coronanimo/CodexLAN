import { validateText } from "../http.mjs";
import { httpError } from "../workspace-store.mjs";

// One serialized delivery job per LAN conversation. Durable delivery states
// distinguish definite rejection from an outcome that must not be replayed.
export class QueueCoordinator {
  jobs = new Map();
  again = new Set();
  steering = new Set();
  closed = false;
  constructor(store, agent) {
    this.store = store; this.agent = agent;
    this.stop = agent.onEvent((id, event) => {
      if (event.kind === "input.accepted") void this.accept(id, event.inputId);
      if (event.kind === "run.terminal" || event.kind === "goal.changed") this.kick(id);
    });
  }
  snapshot(id) { return this.store.getQueueSnapshot(id); }
  busy(id) { return this.jobs.has(id) || [...this.steering].some((key) => key.startsWith(id + ":")); }
  notify(id) { this.agent.notify(id, { kind: "controls.changed" }); }
  async enqueue(id, project, text, attachments = []) {
    if ((this.store.queues[id]?.length || 0) >= 100) throw httpError(409, "单个会话最多保留 100 条排队消息，请等待队列处理后再提交。");
    const item = await this.store.enqueue(id, project.id, text?.trim() ? validateText(text) : attachments.length ? "" : validateText(text), attachments);
    this.notify(id); this.kick(id);
    return { item, ...await this.snapshot(id) };
  }
  editable(id, itemId, allowUncertain = false) {
    const first = this.store.queues[id]?.find((item) => item.id === itemId);
    if (!first) throw httpError(404, "排队消息不存在或已被接收。");
    if (this.jobs.has(id) && this.store.queues[id]?.[0]?.id === itemId) throw httpError(409, "正在核对首条消息的发送条件，请稍后修改。");
    if (first.delivery?.status === "submitting" || this.steering.has(`${id}:${itemId}`)) throw httpError(409, "消息正在提交，暂时不能修改。");
    if (first.delivery?.status === "uncertain" && !allowUncertain) throw httpError(409, "请先核对消息是否已经接收，再明确重试或移除。");
    return first;
  }
  async remove(id, itemId) {
    this.editable(id, itemId, true); await this.store.removeQueueItem(id, itemId); this.notify(id); this.kick(id); return this.snapshot(id);
  }
  async retry(id, itemId, verified) {
    const item = this.editable(id, itemId, true);
    if (!item.delivery) throw httpError(409, "这条消息已经在等待发送。");
    if (item.delivery.status === "uncertain" && !verified) throw httpError(409, "接收结果不确定，必须核对后才能重新发送。");
    await this.store.setQueueDelivery(id, itemId, null); this.notify(id); this.kick(id); return this.snapshot(id);
  }
  async edit(id, itemId, change) {
    this.editable(id, itemId);
    if (Object.hasOwn(change, "text")) await this.store.updateQueueItem(id, itemId, validateText(change.text));
    else if (["up", "down"].includes(change.direction)) await this.store.moveQueueItem(id, itemId, change.direction);
    else throw httpError(400, "队列修改内容无效。");
    this.notify(id); return this.snapshot(id);
  }
  async accept(id, inputId) {
    if (await this.store.completeQueueItem(id, inputId)) this.notify(id);
  }
  kick(id) {
    if (this.closed) return Promise.resolve();
    if (this.jobs.has(id)) { this.again.add(id); return this.jobs.get(id); }
    const job = this.deliver(id).catch((error) => {
      this.agent.notify(id, { kind: "notice", message: error.message });
    }).finally(() => {
      this.jobs.delete(id);
      if (this.again.delete(id)) this.kick(id);
    });
    this.jobs.set(id, job); return job;
  }
  async deliver(id) {
    const item = this.store.queues[id]?.[0];
    if (!item || item.delivery || this.steering.has(`${id}:${item.id}`)) return;
    const project = await this.store.getProject(item.projectId);
    if (this.store.threadProjects[id] !== project.id) throw httpError(409, "排队消息与会话所属项目不一致。");
    const state = await this.agent.probe(id, project);
    if (this.closed || this.store.queues[id]?.[0]?.id !== item.id) return;
    if (state.activeRunId || state.status === "running" || state.goal?.status === "active") return;
    await this.store.setQueueDelivery(id, item.id, { status: "submitting" }); this.notify(id);
    try {
      await this.agent.submit(id, project, { id: item.id, text: item.text, attachments: item.attachments || [] });
      await this.accept(id, item.id);
    } catch (error) {
      if (this.agent.accepted(id, item.id)) await this.accept(id, item.id);
      else {
        await this.store.setQueueDelivery(id, item.id, { status: error.delivery === "rejected" ? "rejected" : "uncertain", message: error.message });
        this.notify(id);
      }
    }
  }
  async steer({ conversationId: id, itemId, runId, project }) {
    const key = `${id}:${itemId}`, item = this.editable(id, itemId);
    this.steering.add(key); await this.store.setQueueDelivery(id, item.id, { status: "submitting" }); this.notify(id);
    try {
      await this.agent.guide(id, project, { id: item.id, text: item.text, attachments: item.attachments || [], runId });
      await this.accept(id, item.id); return this.snapshot(id);
    } catch (error) {
      if (this.agent.accepted(id, item.id)) await this.accept(id, item.id);
      else await this.store.setQueueDelivery(id, item.id, { status: error.delivery === "rejected" ? "rejected" : "uncertain", message: error.message });
      this.notify(id); throw error;
    } finally { this.steering.delete(key); }
  }
  async recover() {
    for (const id of await this.store.listQueuedThreadIds()) {
      for (const item of this.store.queues[id] || []) if (item.delivery?.status === "submitting" && !this.busy(id)) {
        await this.store.setQueueDelivery(id, item.id, { status: "uncertain", message: "服务在提交期间重启，需要核对接收状态。" });
      }
      this.kick(id);
    }
  }
  close() { this.closed = true; this.stop(); return Promise.allSettled([...this.jobs.values()]); }
}
