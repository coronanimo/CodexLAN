// Conversation facts, independent of transport and DOM. Arrays express order;
// timestamps express time, never priority. Unknown entries retain their anchors
// until an authoritative history page supplies their position.
import { reconcileOrder } from "./conversation-order.js";

const active = (status) => ["inprogress", "running", "active", "pending"].includes(String(status || "").toLowerCase());
function mergeItem(previous, incoming, canonical) {
  if (!previous) return { ...incoming };
  if ((previous.version || 0) > (incoming.version || 0) && !canonical) return previous;
  const newer = (previous.version || 0) > (incoming.version || 0);
  const merged = canonical && newer ? { ...incoming, ...previous } : { ...previous, ...incoming };
  // A lagging history read must not reopen a completed item or shorten a stream.
  if (previous.completedAt && !incoming.completedAt && active(incoming.status)) {
    Object.assign(merged, previous);
  }
  if (canonical && newer && incoming.type) merged.type = incoming.type;
  if (canonical && typeof previous.text === "string" && previous.text.startsWith(incoming.text || "")) merged.text = previous.text;
  if (canonical && previous.aggregatedOutput && (!incoming.aggregatedOutput || previous.aggregatedOutput.endsWith(incoming.aggregatedOutput))) merged.aggregatedOutput = previous.aggregatedOutput;
  if (!incoming.clientPending) delete merged.clientPending;
  return merged;
}

export function mergeConversationTurns(previous = [], incoming = [], { canonical = false } = {}) {
  const turns = new Map(previous.map((turn) => [turn.id, turn]));
  for (const patch of incoming) {
    if (!patch?.id) continue;
    const old = turns.get(patch.id) || { id: patch.id, items: [] };
    const items = new Map((old.items || []).map((item) => [item.id, item]));
    const aliases = new Map();
    const incomingIds = [];
    for (const item of patch.items || []) {
      if (!item?.id) continue;
      // Optimistic input and its acknowledgement are one entity.
      const clientId = item.clientId || (item.clientPending ? item.id : null);
      if (clientId) {
        const equivalent = [...items.values()].find((entry) => entry.id !== item.id && entry.type === "userMessage" && (entry.clientId || entry.id) === clientId);
        if (equivalent) {
          if (item.clientPending && !equivalent.clientPending) {
            aliases.set(item.id, equivalent.id);
            items.set(equivalent.id, item.inputKind ? { ...equivalent, inputKind: item.inputKind } : equivalent);
            incomingIds.push(equivalent.id);
            continue;
          }
          aliases.set(equivalent.id, item.id);
          items.delete(equivalent.id);
        }
      }
      items.set(item.id, mergeItem(items.get(item.id), item, canonical));
      incomingIds.push(item.id);
    }
    const oldOrder = (old.items || []).map((item) => aliases.get(item.id) || item.id).filter((id) => items.has(id));
    const added = incomingIds;
    const staleOrder = !canonical && (old.version || 0) > (patch.version || 0);
    const order = !staleOrder && (patch.itemOrder || canonical) ? reconcileOrder(oldOrder, patch.itemOrder?.map((id) => aliases.get(id) || id) || added) : [...new Set([...oldOrder, ...added])];
    const { itemOrder, ...fields } = patch;
    const merged = { ...old, ...fields, items: order.map((id) => items.get(id)).filter(Boolean) };
    if ((old.version || 0) > (patch.version || 0)) {
      for (const key of ["status", "startedAt", "completedAt", "durationMs", "task"]) if (old[key] != null) merged[key] = old[key];
      merged.version = old.version;
    }
    turns.set(patch.id, merged);
  }
  const order = canonical ? reconcileOrder(previous.map((turn) => turn.id), incoming.map((turn) => turn.id))
    : [...new Set([...previous.map((turn) => turn.id), ...incoming.map((turn) => turn.id)])];
  return order.map((id) => turns.get(id)).filter(Boolean);
}

// The latest history page may lag behind a turn already received over SSE.
// Keep that active turn after the history page even if an earlier event placed
// it before a subsequently observed completed turn.
export function mergeLatestConversationTurns(previous, incoming, activeTurnId) {
  const merged = mergeConversationTurns(previous, incoming, { canonical: true });
  if (!activeTurnId || incoming.some((turn) => turn.id === activeTurnId)) return merged;
  const index = merged.findIndex((turn) => turn.id === activeTurnId);
  if (index < 0) return merged;
  return [...merged.slice(0, index), ...merged.slice(index + 1), merged[index]];
}

// One reducer for raw upstream inputs. Used before network coalescing, and by
// older-service clients as an adapter; renderers never interpret protocol events.
export function reduceConversationEvent(turns, message, version = 0) {
  const p = message.params || {};
  const turnId = p.turnId || p.turn?.id;
  if (!turnId) return turns;
  const old = turns.find((turn) => turn.id === turnId) || { id: turnId, items: [] };
  const itemId = p.item?.id || p.itemId;
  const current = old.items.find((item) => item.id === itemId) || { id: itemId };
  let patch = { id: turnId, version };
  const method = message.method;
  if (method === "turn/started" || method === "turn/completed") {
    const { items, ...fields } = p.turn || {};
    patch = { ...patch, ...fields, status: fields.status || (method === "turn/started" ? "inProgress" : "completed") };
    // Summary arrays supply facts, not a replacement history page/order.
    const updates = new Map();
    if (method === "turn/completed") {
      for (const item of old.items.filter((item) => active(item.status))) updates.set(item.id, { ...item, version, status: patch.status, completedAt: item.completedAt || p.turn?.completedAt });
    }
    for (const item of items || []) {
      const existing = updates.get(item.id) || old.items.find((entry) => entry.id === item.id);
      updates.set(item.id, { ...existing, ...item, version });
    }
    patch.items = [...updates.values()];
  } else if (["item/started", "item/completed"].includes(method) && itemId) {
    patch.items = [{ ...current, ...p.item, version,
      status: p.item.status || (method === "item/started" ? "inProgress" : "completed"),
      ...(p.startedAtMs != null ? { startedAt: p.startedAtMs } : {}),
      ...(p.completedAtMs != null ? { completedAt: p.completedAtMs } : {}),
    }];
    if (patch.items[0].type === "commandExecution" && patch.items[0].aggregatedOutput?.length > 65536) {
      patch.items[0].aggregatedOutput = patch.items[0].aggregatedOutput.slice(-65536);
      patch.items[0].outputTruncated = true;
    }
  } else if (method === "item/agentMessage/delta") {
    patch.items = [{ type: "agentMessage", ...current, version, text: `${current.text || ""}${p.delta || ""}` }];
  } else if (method.startsWith("item/reasoning/")) {
    const summary = [...(current.summary || [])], content = [...(current.content || [])];
    if (method === "item/reasoning/summaryTextDelta") summary[p.summaryIndex || 0] = `${summary[p.summaryIndex || 0] || ""}${p.delta || ""}`;
    if (method === "item/reasoning/summaryPartAdded" && summary[p.summaryIndex] === undefined) summary[p.summaryIndex] = "";
    if (method === "item/reasoning/textDelta") content[p.contentIndex || 0] = `${content[p.contentIndex || 0] || ""}${p.delta || ""}`;
    patch.items = [{ ...current, type: "reasoning", version, summary, content }];
  } else if (method === "item/commandExecution/outputDelta") {
    const text = `${p.replaceOutput ? "" : current.aggregatedOutput || ""}${p.delta || ""}`;
    patch.items = [{ ...current, type: "commandExecution", version, aggregatedOutput: text.slice(-65536), outputTruncated: current.outputTruncated || text.length > 65536 }];
  } else if (method === "item/fileChange/patchUpdated") {
    patch.items = [{ ...current, type: "fileChange", version, changes: p.changes || [], status: "inProgress" }];
  } else if (method === "turn/plan/updated") {
    patch.task = { ...old.task, plan: { plan: p.plan, explanation: p.explanation } };
  } else if (method === "turn/diff/updated") {
    patch.task = { ...old.task, diff: p.diff };
  } else return turns;
  // An update has no ordering authority. Existing ids keep their positions.
  patch.itemOrder = [...new Set([...old.items.map((item) => item.id), ...(patch.items || []).map((item) => item.id)])];
  const result = mergeConversationTurns(turns, [patch]);
  const ids = [...new Set([...turns.map((turn) => turn.id), turnId])];
  return ids.map((id) => result.find((turn) => turn.id === id));
}

export function conversationPatch(turns, message) {
  const p = message.params || {};
  const turn = turns.find((entry) => entry.id === (p.turnId || p.turn?.id));
  if (!turn) return null;
  const itemId = p.item?.id || p.itemId;
  const { items, ...fields } = turn;
  const changed = itemId ? items.filter((item) => item.id === itemId)
    : message.method === "turn/completed" ? items.filter((item) => item.version === turn.version) : [];
  return { turns: [{ ...fields, itemOrder: items.map((item) => item.id), items: changed }] };
}

export function conversationNeedsSnapshot(turns, patch) {
  return (patch.turns || []).some((turn) => {
    const known = new Set([...(turns.find((entry) => entry.id === turn.id)?.items || []), ...(turn.items || [])].map((item) => item.id));
    return turn.itemOrder?.some((id) => !known.has(id));
  });
}

export function resetConversationVersions(turns = []) {
  return turns.map((turn) => ({ ...turn, version: 0, items: (turn.items || []).map((item) => ({ ...item, version: 0 })) }));
}

// Missing recovery entries have no invented chronological position.
export function recoveryItems(items = [], metrics = {}) {
  const known = new Set(items.map((item) => item.id));
  return Object.entries(metrics || {}).filter(([id, metric]) => !known.has(id) && metric?.snapshot?.type === "commandExecution")
    .map(([id, metric]) => ({ ...metric.snapshot, ...metric, id, recovery: true }));
}
