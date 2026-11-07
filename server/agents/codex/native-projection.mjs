import { presentItem, itemKey, summaryKey } from "./presentation.mjs";
import { running } from "./protocol-values.mjs";

// The provider owns lifecycle/order facts. Each ingress changes indexed items;
// it never rebuilds a loaded transcript to process one text delta.
export class NativeProjection {
  version = 0;
  sessions = new Map();
  listeners = new Map();
  readers = new Set();
  begin(id) { const read = { id, version: this.version }; this.readers.add(read); return read; }
  end(read) { this.readers.delete(read); }
  observe(id, listener) {
    if (!this.listeners.has(id)) this.listeners.set(id, new Set());
    this.listeners.get(id).add(listener);
    return () => { const set = this.listeners.get(id); set?.delete(listener); if (!set?.size) this.listeners.delete(id); };
  }
  emit(id, event) { this.onEvent?.(id, event); for (const listener of this.listeners.get(id) || []) listener(event); }
  session(id) {
    if (!this.sessions.has(id)) this.sessions.set(id, { runs: new Map(), activeRunId: null, status: "idle", version: 0, appendCounter: 0, materializedSequence: 0 });
    return this.sessions.get(id);
  }
  receive({ method, params: p = {} }) {
    const id = p.threadId, runId = p.turnId || p.turn?.id;
    if (!id || !runId) return;
    const session = this.session(id);
    const version = session.version = ++this.version;
    if (!session.runs.has(runId)) session.runs.set(runId, { id: runId, items: new Map(), order: [], aliases: new Map(), status: "inProgress", append: false });
    const run = session.runs.get(runId), changed = new Set();
    const ingest = (entry, terminal = false) => {
      if (!entry?.id) return;
      const alias = entry.clientId;
      if (alias && alias !== entry.id && run.items.has(alias)) {
        const previous = run.items.get(alias);
        run.items.delete(alias); run.aliases.set(alias, entry.id);
        const position = run.order.indexOf(alias); if (position >= 0) run.order[position] = entry.id;
        run.items.set(entry.id, { ...previous, id: entry.id });
      }
      const current = run.items.get(entry.id);
      if (!current) run.order.push(entry.id);
      const value = boundedItem({ ...current, ...entry, version });
      if (terminal) { value.status = entry.status || "completed"; value.completedAt ||= Date.now(); }
      else if (current?.completedAt) { value.completedAt = current.completedAt; value.status = current.status; }
      value.status ||= "inProgress";
      if (typeof value.text === "string" && value.text.length > 12_000) { value.text = value.text.slice(0, 12_000); value.previewTruncated = true; }
      for (const field of ["arguments", "result", "error"]) if (value[field] && typeof value[field] === "object") delete value[field];
      if (typeof value.aggregatedOutput === "string" && value.aggregatedOutput.length > 65536) { value.aggregatedOutput = value.aggregatedOutput.slice(-65536); value.outputTruncated = true; }
      run.items.set(entry.id, value); changed.add(entry.id);
    };
    if (method === "turn/started") {
      if (!run.append && !run.completedAt) { run.append = true; run.appendSequence = ++session.appendCounter; }
      if (!run.completedAt) Object.assign(run, p.turn, { items: run.items, order: run.order, aliases: run.aliases });
      if (!run.completedAt) { session.activeRunId = runId; session.status = "running"; }
      for (const item of p.turn?.items || []) ingest(item);
    } else if (method === "turn/completed") {
      run.status = p.turn?.status || "completed"; run.completedAt = p.turn?.completedAt || Date.now();
      for (const item of p.turn?.items || []) ingest(item, true);
      for (const item of run.items.values()) if (running(item.status)) ingest({ ...item, status: run.status }, true);
      if (session.activeRunId === runId) { session.activeRunId = null; session.status = "idle"; }
    } else if (method === "item/started" || method === "item/completed") ingest(p.item, method === "item/completed");
    else if (method === "item/agentMessage/delta") {
      const current = run.items.get(p.itemId);
      if (current?.previewTruncated) return;
      ingest({ id: p.itemId, type: "agentMessage", ...current, text: `${current?.text || ""}${p.delta || ""}` });
    } else if (method === "item/commandExecution/outputDelta") {
      const current = run.items.get(p.itemId);
      ingest({ id: p.itemId, type: "commandExecution", ...current, aggregatedOutput: `${p.replaceOutput ? "" : current?.aggregatedOutput || ""}${p.delta || ""}` });
      this.emit(id, { kind: "resource.changed", rowId: itemKey(id, runId, p.itemId) });
      return; // Output bodies belong to detail resources, not list updates.
    } else if (method.startsWith("item/reasoning/")) {
      const current = run.items.get(p.itemId) || { id: p.itemId, type: "reasoning" };
      const field = method.includes("summary") ? "summary" : "content", values = [...(current[field] || [])];
      const index = p.summaryIndex || p.contentIndex || 0;
      values[index] = `${values[index] || ""}${p.delta || ""}`; ingest({ ...current, [field]: values });
      this.emit(id, { kind: "resource.changed", rowId: itemKey(id, runId, p.itemId) });
      return;
    } else if (method === "item/fileChange/patchUpdated") ingest({ id: p.itemId, type: "fileChange", changes: p.changes || [] });
    else if (method === "turn/plan/updated") { run.plan = { explanation: p.explanation || "", plan: p.plan || [] }; }
    else if (method === "turn/diff/updated") { run.diff = p.diff || ""; }
    else return;
    run.version = version;
    const upserts = method === "item/agentMessage/delta" ? [] : [{ row: presentItem(id, run, null, null, "items") }], removeIds = [];
    for (const itemId of changed) {
      const item = run.items.get(itemId), index = run.order.indexOf(itemId);
      if (item.clientId && item.clientId !== itemId) removeIds.push(itemKey(id, runId, item.clientId));
      upserts.push({ row: presentItem(id, run, item, null, "items"), beforeId: index + 1 < run.order.length ? itemKey(id, runId, run.order[index + 1]) : summaryKey(id, runId),
        afterId: index > 0 ? itemKey(id, runId, run.order[index - 1]) : undefined });
    }
    for (let offset = 0; offset < upserts.length; offset += 10) this.emit(id, { kind: "patch", conversationId: id, appendRun: run.append && method === "turn/started", removeIds: offset ? [] : removeIds, upserts: upserts.slice(offset, offset + 10) });
    if (method === "item/completed" || method === "turn/completed") for (const key of changed) this.emit(id, { kind: "resource.changed", rowId: itemKey(id, runId, key) });
    if (method.startsWith("turn/")) this.emit(id, { kind: "controls.changed" });
  }
  noteCanonical(id, ids) {
    const session = this.sessions.get(id);
    if (!session) return;
    for (const key of ids) {
      const run = session.runs.get(key);
      if (run) { run.materialized = true; session.materializedSequence = Math.max(session.materializedSequence, run.appendSequence || 0); }
    }
  }
  merge(id, nativeTurns, checkpoint, latest = false, partial = false, canonical = true) {
    if (canonical) this.noteCanonical(id, nativeTurns.map((turn) => turn.id));
    let session = this.sessions.get(id);
    const turns = nativeTurns.map((turn) => {
      let live = session?.runs.get(turn.id);
      if (!live && running(turn.status)) {
        session ||= this.session(id);
        live = { id: turn.id, status: turn.status, startedAt: turn.startedAt, completedAt: null, append: false, version: checkpoint,
          items: new Map((turn.items || []).map((item) => [item.id, boundedItem({ ...item, version: checkpoint })])),
          order: (turn.items || []).map((item) => item.id), aliases: new Map(), materialized: canonical };
        session.runs.set(turn.id, live);
      }
      if (!live) return turn;
      for (const item of turn.items || []) if (item.clientId && item.clientId !== item.id && live.items.has(item.clientId)) {
        const pending = live.items.get(item.clientId), index = live.order.indexOf(item.clientId);
        live.items.delete(item.clientId); live.items.set(item.id, { ...pending, id: item.id, clientPending: false });
        if (index >= 0) live.order[index] = item.id;
        live.aliases.set(item.clientId, item.id);
      }
      const nativeIds = new Set((turn.items || []).map((item) => item.id));
      const items = (turn.items || []).map((item) => {
        const observed = live.items.get(item.id);
        if (!observed) return item;
        return observed.version > checkpoint ? { ...item, ...observed,
          ...(item.text?.startsWith(observed.text || "") ? { text: item.text } : {}) } : { ...observed, ...item,
          ...(observed.text?.startsWith(item.text || "") ? { text: observed.text } : {}),
          ...(observed.completedAt && running(item.status) ? { status: observed.status, completedAt: observed.completedAt } : {}) };
      });
      const lastKnown = live.order.findLastIndex((key) => nativeIds.has(key));
      for (const itemId of live.order) if (!nativeIds.has(itemId) && (!partial || latest && live.order.indexOf(itemId) > lastKnown)) {
        const next = live.order.slice(live.order.indexOf(itemId) + 1).find((key) => nativeIds.has(key));
        const position = next ? items.findIndex((entry) => entry.id === next) : items.length;
        items.splice(position, 0, live.items.get(itemId));
      }
      const covered = !running(turn.status) && ![...this.readers].some((reader) => reader.id === id && reader.version < (live.version || 0))
        && live.order.every((key) => nativeIds.has(key)) && [...live.items.values()].every((item) => {
          const saved = turn.items?.find((entry) => entry.id === item.id);
          return saved && (!item.text || saved.text?.startsWith(item.text)) && (!item.aggregatedOutput || saved.aggregatedOutput?.endsWith(item.aggregatedOutput));
        });
      if (covered) session.runs.delete(turn.id);
      return { ...turn, version: Math.max(live.version || 0, checkpoint), ...(live.version > checkpoint || live.completedAt && running(turn.status) ? { status: live.status, completedAt: live.completedAt } : {}), items,
        ...(live.plan ? { plan: live.plan } : {}), ...(live.diff ? { diff: live.diff } : {}) };
    });
    // Only explicit provider append facts can bridge a not-yet-materialized run.
    // A completion of an unknown historical run has no append authority.
    if (latest && session) for (const run of session.runs.values()) if (run.append && !run.materialized && run.appendSequence > session.materializedSequence
      && !turns.some((turn) => turn.id === run.id)) turns.push({ ...run, items: run.order.map((key) => run.items.get(key)) });
    return turns;
  }
  forget(id) { this.sessions.delete(id); }
}

function boundedItem(item) {
  const keys = ["id", "type", "status", "text", "command", "tool", "query", "cwd", "source", "exitCode", "durationMs", "clientId", "clientPending", "inputKind", "phase", "delivery", "questions", "summary", "content", "aggregatedOutput", "outputTruncated", "startedAt", "completedAt", "previewTruncated", "version"];
  const result = Object.fromEntries(keys.flatMap((key) => item[key] !== undefined ? [[key, item[key]]] : []));
  for (const key of ["path", "savedPath"]) if (typeof item[key] === "string" && item[key].length <= 4096) result[key] = item[key];
  if (typeof result.text === "string" && result.text.length > 12_000) { result.text = result.text.slice(0, 12_000); result.previewTruncated = true; }
  if (Array.isArray(result.content) && result.type === "userMessage") {
    let remaining = 12_000, images = 0;
    if (result.content.length > 100) result.previewTruncated = true;
    result.content = result.content.slice(0, 100).flatMap((part) => {
      if (part.type === "localImage" && typeof part.path === "string" && part.path.length <= 4096 && images++ < 20) return [{ type: "localImage", path: part.path }];
      if (part.type !== "text") return [];
      const text = String(part.text || ""); if (text.length > remaining) result.previewTruncated = true;
      const preview = text.slice(0, remaining); remaining -= preview.length; return preview ? [{ type: "text", text: preview }] : [];
    });
  }
  if (result.type === "reasoning") for (const field of ["summary", "content"]) result[field] = (result[field] || []).map((text) => String(text).slice(0, 4000)).slice(0, 8);
  if (typeof result.aggregatedOutput === "string") { if (result.aggregatedOutput.length > 65536) result.outputTruncated = true; result.aggregatedOutput = result.aggregatedOutput.slice(-65536); }
  return result;
}
