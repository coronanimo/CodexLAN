import { conversationPatch, mergeConversationTurns, reduceConversationEvent } from "../public/conversation-state.js";

// Volatile projections of observed turns. Completed turns survive until a
// canonical read covers them, so completion cannot create a reconnect gap.
export class LiveThreadState {
  constructor() { this.turns = new Map(); this.version = 0; this.readers = new Set(); }

  beginRead(threadId) {
    const reader = { threadId, version: this.version };
    this.readers.add(reader);
    return reader;
  }

  endRead(reader) { this.readers.delete(reader); }

  receive(message) {
    const params = message.params || {};
    const threadId = params.threadId;
    if (!threadId) return;
    const previous = this.turns.get(threadId) || [];
    this.version = Math.max(this.version + 1, message.revision || 0);
    const next = reduceConversationEvent(previous, message, this.version);
    this.turns.set(threadId, next);
    return conversationPatch(next, message);
  }

  patch(message) { return conversationPatch(this.turns.get(message.params?.threadId) || [], message); }

  snapshot(threadId) { return { turns: structuredClone(this.turns.get(threadId) || []) }; }

  reconcile(threadId, canonical, readVersion = this.version) {
    const observed = this.turns.get(threadId) || [];
    const base = canonical.map((turn) => ({ ...turn, version: readVersion,
      items: (turn.items || []).map((item) => ({ ...item, version: readVersion })) }));
    // Canonical ordering owns known ids; observed-only ids retain anchors.
    const result = mergeConversationTurns(observed, base, { canonical: true });
    const ids = new Set(canonical.map((turn) => turn.id));
    const retained = observed.filter((turn) => {
      const history = canonical.find((entry) => entry.id === turn.id);
      if (!history || !["completed", "failed", "interrupted", "cancelled"].includes(history.status)) return true;
      if ((turn.version || 0) > readVersion) return true;
      // Another HTTP read may still be returning a pre-completion snapshot.
      // Do not release the only copy that can bridge that reader to SSE.
      if ([...this.readers].some((reader) => reader.threadId === threadId && reader.version < (turn.version || 0))) return true;
      return turn.items.some((item) => {
        const saved = history.items?.find((entry) => entry.id === item.id);
        if (!saved || saved.type !== item.type) return true;
        if (item.text && saved.text !== item.text) return true;
        if (item.aggregatedOutput && !saved.aggregatedOutput?.endsWith(item.aggregatedOutput)) return true;
        for (const field of ["changes", "summary", "content", "result", "error"]) {
          if (item[field] != null && JSON.stringify(item[field]) !== JSON.stringify(saved[field])) return true;
        }
        return false;
      });
    });
    this.turns.set(threadId, retained);
    return result.filter((turn) => ids.has(turn.id));
  }

  items(threadId, turnId, afterRevision = 0) {
    const turn = (this.turns.get(threadId) || []).find((entry) => entry.id === turnId);
    if (!turn || turn.completedAt || ["completed", "failed", "interrupted", "cancelled"].includes(turn.status)) return [];
    return turn.items.filter((item) => item.completedAt == null || (item.version || 0) > afterRevision);
  }

  forget(threadId) { this.turns.delete(threadId); }
}
