// Volatile reconnect state, not a second durable Codex history.
export class LiveThreadState {
  constructor() { this.turns = new Map(); }

  receive(message) {
    const params = message.params || {};
    const threadId = params.threadId, turnId = params.turnId || params.turn?.id;
    if (!threadId) return;
    if (message.method === "turn/completed") { this.turns.delete(threadId); return; }
    if (!turnId) return;
    if (message.method === "turn/started" || this.turns.get(threadId)?.id !== turnId) this.turns.set(threadId, { id: turnId, items: new Map(), revisions: new Map() });
    const turn = this.turns.get(threadId);
    if (["item/started", "item/completed"].includes(message.method) && params.item?.id) {
      const item = params.item;
      turn.items.set(item.id, { ...turn.items.get(item.id), ...item,
        ...(params.startedAtMs != null ? { startedAt: params.startedAtMs } : {}),
        ...(params.completedAtMs != null ? { completedAt: params.completedAtMs } : {}) });
    } else if (message.method === "item/agentMessage/delta") {
      const previous = turn.items.get(params.itemId) || { id: params.itemId, type: "agentMessage", phase: "commentary", text: "" };
      turn.items.set(params.itemId, { ...previous, text: `${previous.text || ""}${params.delta || ""}` });
    } else if (message.method.startsWith("item/reasoning/")) {
      const previous = turn.items.get(params.itemId) || { id: params.itemId, type: "reasoning", summary: [], content: [] };
      const summary = [...(previous.summary || [])], content = [...(previous.content || [])];
      if (message.method === "item/reasoning/summaryTextDelta") summary[params.summaryIndex || 0] = `${summary[params.summaryIndex || 0] || ""}${params.delta || ""}`;
      if (message.method === "item/reasoning/summaryPartAdded" && summary[params.summaryIndex] === undefined) summary[params.summaryIndex] = "";
      if (message.method === "item/reasoning/textDelta") content[params.contentIndex || 0] = `${content[params.contentIndex || 0] || ""}${params.delta || ""}`;
      turn.items.set(params.itemId, { ...previous, summary, content });
    } else if (message.method === "item/fileChange/patchUpdated") {
      const previous = turn.items.get(params.itemId) || { id: params.itemId, type: "fileChange", status: "inProgress" };
      turn.items.set(params.itemId, { ...previous, changes: params.changes || [] });
    }
    const itemId = params.item?.id || params.itemId;
    if (itemId) turn.revisions.set(itemId, message.revision || 0);
  }

  items(threadId, turnId, afterRevision = 0) {
    const turn = this.turns.get(threadId);
    return turn && turn.id === turnId ? [...turn.items.values()].filter((item) => item.completedAt == null || (turn.revisions.get(item.id) || 0) > afterRevision) : [];
  }

  forget(threadId) { this.turns.delete(threadId); }
}
