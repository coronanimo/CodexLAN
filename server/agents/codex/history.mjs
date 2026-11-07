import { httpError } from "../../workspace-store.mjs";
import { randomUUID } from "node:crypto";
import { presentItem, encodePosition } from "./presentation.mjs";
import { itemText, running } from "./protocol-values.mjs";
import { CodexResources } from "./resources.mjs";

export class CodexHistory {
  itemPaging = new Map();
  bookmarks = new Map();
  resources = new CodexResources();
  constructor(connection, projection, store) { this.connection = connection; this.projection = projection; this.store = store; }
  async readNative(id, cursor = null, view = "summary") {
    const read = this.projection.begin(id);
    try {
      let page, metadata;
      try {
        [page, metadata] = await Promise.all([
          this.connection.request("thread/turns/list", { threadId: id, sortDirection: "desc", itemsView: view, limit: 4, ...(cursor ? { cursor } : {}) }),
          this.metadata(id),
        ]);
        page = { turns: (page.data || []).toReversed(), before: page.nextCursor || null };
      } catch (error) {
        if (!/method not found|unknown method|paginated_threads is not supported|thread\/turns\/list.*(unsupported|unavailable|not supported)/i.test(error.message)) throw error;
        metadata = (await this.connection.request("thread/read", { threadId: id, includeTurns: true })).thread;
        const all = metadata.turns || [];
        const end = cursor ? all.findIndex((turn) => turn.id === cursor) : all.length;
        if (end < 0) throw httpError(409, "历史位置已失效，请重新同步。");
        const start = Math.max(0, end - 4);
        page = { turns: all.slice(start, end), before: start ? all[start].id : null };
      }
      const canonical = page.turns;
      await this.store.reconcileExecutionSupplements(id, canonical);
      const turns = this.projection.merge(id, canonical, read.version, !cursor);
      if (!cursor) {
        const session = this.projection.session(id);
        if (session.version <= read.version) {
          const active = turns.findLast((turn) => running(turn.status));
          session.activeRunId = active?.id || null;
          session.status = active || running(metadata.status) ? "running" : "idle";
        }
      }
      return { ...page, turns, canonical, metadata, revision: read.version };
    } finally { this.projection.end(read); }
  }
  async metadata(id) {
    const deadline = Date.now() + 1200;
    for (;;) {
      try { return (await this.connection.request("thread/read", { threadId: id, includeTurns: false })).thread; }
      catch (error) {
        if (Date.now() >= deadline || !/failed to read session metadata.*is empty/i.test(error.message)) throw error;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
  }
  async page(id, { before = null, limit = 100 } = {}) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw httpError(400, "历史每页数量必须是 1 到 200。");
    const position = before ? before.startsWith("h:") ? this.bookmark(id, before) : decodePosition(before) : { page: null };
    if (position.kind === "items" || !before && this.itemPaging.get(id) !== false) {
      try { return await this.itemPage(id, position, limit, !before); }
      catch (error) {
        if (position.kind === "items" || !/method not found|unknown method|item pagination.*(not supported|unavailable)|thread\/items\/list.*(not supported|unsupported|unavailable)/i.test(error.message)) throw error;
        this.itemPaging.set(id, false);
      }
    }
    const native = await this.readNative(id, position.page);
    const rows = [];
    for (const turn of native.turns) {
      for (const item of turn.items || []) rows.push({ turn, item, id: JSON.stringify([id, turn.id, `item:${item.id}`]) });
      rows.push({ turn, item: null, id: JSON.stringify([id, turn.id, "$summary"]) });
    }
    const end = position.anchor ? rows.findIndex((row) => row.id === position.anchor) : rows.length;
    if (end < 0) throw httpError(409, "历史位置已变化，请重新同步。");
    let start = end, bytes = 0;
    const result = [];
    while (start && result.length < limit) {
      const { turn, item } = rows[start - 1], row = presentItem(id, turn, item, position.page);
      const size = Buffer.byteLength(JSON.stringify(row));
      if (result.length && bytes + size > 128_000) break;
      result.unshift(row); bytes += size; start--;
    }
    return { conversationId: id, rows: result, revision: native.revision, before: start ? encodePosition({ page: position.page, anchor: rows[start].id }) : native.before ? encodePosition({ page: native.before }) : null };
  }
  remember(id, source) {
    const token = "h:" + randomUUID();
    this.bookmarks.set(token, { id, source, created: Date.now() });
    if (this.bookmarks.size > 2048) this.bookmarks.delete(this.bookmarks.keys().next().value);
    return token;
  }
  bookmark(id, token) {
    const saved = this.bookmarks.get(token);
    if (!saved || saved.id !== id || Date.now() - saved.created > 20 * 60_000) throw httpError(409, "历史位置已过期，请点击最新记录重新同步。");
    return saved.source;
  }
  async source(id, metaCursor = null, latest = false) {
    const page = await this.connection.request("thread/turns/list", { threadId: id, sortDirection: "desc", limit: 1, itemsView: "notLoaded",
      ...(metaCursor ? { cursor: metaCursor } : {}) });
    this.projection.noteCanonical(id, (page.data || []).map((turn) => turn.id));
    const turn = page.data?.[0];
    let source = turn ? { kind: "items", page: null, run: { ...turn, items: undefined }, turnAnchor: page.backwardsCursor || null, cursor: null,
      older: page.nextCursor ? this.remember(id, { kind: "items", page: null, metaCursor: page.nextCursor }) : null } : null;
    if (latest) {
      const session = this.projection.sessions.get(id);
      const pending = [...(session?.runs.values() || [])].filter((run) => run.append && !run.materialized && run.appendSequence > session.materializedSequence);
      for (const run of pending) {
        source = { kind: "items", page: null, run: { id: run.id, status: run.status, startedAt: run.startedAt, completedAt: run.completedAt },
          cursor: null, turnAnchor: null, volatile: true, older: source ? this.remember(id, source) : null };
      }
    }
    return source;
  }
  async itemPage(id, position, limit, latest = false) {
    const read = this.projection.begin(id);
    try {
      const source = position.run ? { ...position } : await this.source(id, position.metaCursor || null, latest);
      if (!source) return { conversationId: id, rows: [], before: null };
      if (source.turnAnchor && !latest) {
        const update = await this.connection.request("thread/turns/list", { threadId: id, sortDirection: "asc", itemsView: "notLoaded", limit: 1, cursor: source.turnAnchor });
        if (update.data?.[0]?.id !== source.run.id) throw httpError(409, "轮次位置已变化，请重新同步。");
        source.run = { ...update.data[0], items: undefined };
      }
      let page, canonical = true, localAnchor;
      try {
        page = await this.connection.request("thread/items/list", { threadId: id, turnId: source.run.id, sortDirection: "desc", limit: 50,
          ...(source.cursor ? { cursor: source.cursor } : {}) });
        if (!Array.isArray(page.data)) throw new Error("thread/items/list returned invalid data");
      } catch (error) {
        const observed = this.projection.sessions.get(id)?.runs.get(source.run.id);
        if (!error.codexResponse || !observed || !/invalid.*(item|anchor)|not found|not materialized|unknown turn/i.test(error.message)) throw error;
        page = { data: [], nextCursor: null }; canonical = false;
        localAnchor = typeof source.cursor === "object" ? source.cursor.itemId : null;
      }
      this.itemPaging.set(id, true);
      const items = page.data.toReversed().map((entry) => ({ ...entry.item, startedAtMs: entry.startedAtMs, completedAtMs: entry.completedAtMs }));
      const merged = this.projection.merge(id, [{ ...source.run, items }], read.version, !source.cursor || !canonical, canonical, canonical)[0];
      // Read persisted plan/timing data by run ID; it supplies supplemental facts,
      // never a new transcript position.
      const supplement = await this.store.getTurnPresentation?.(id, source.run.id);
      if (supplement?.plan) merged.plan = supplement.plan;
      merged.startedAt ??= supplement?.startedAt;
      merged.completedAt ??= supplement?.completedAt;
      let visible = merged.items;
      if (localAnchor) {
        const boundary = visible.findIndex((item) => item.id === localAnchor);
        if (boundary < 0) throw httpError(409, "执行记录正在持久化，请重新同步。");
        visible = visible.slice(0, boundary);
      }
      const locations = visible.map((item) => ({ itemId: item.id, row: presentItem(id, merged, item, null) }));
      if (!source.cursor && !source.omitSummary) locations.push({ itemId: null, row: presentItem(id, merged, null, null) });
      const summary = locations.find((entry) => entry.row.kind === "summary")?.row;
      if (summary && supplement?.recoveryCount) summary.recoveryDetailId = encodePosition({ kind: "items", page: null, run: merged.id, item: "$recovery" });
      for (const entry of locations) {
        const ref = encodePosition({ kind: "items", page: null, run: source.run.id, item: entry.itemId || "$turn" });
        if (entry.row.detailId) entry.row.detailId = ref;
      }
      let first = locations.length, bytes = 0;
      while (first && locations.length - first < limit) {
        const size = Buffer.byteLength(JSON.stringify(locations[first - 1].row));
        if (first < locations.length && bytes + size > 128_000) break;
        bytes += size; first--;
      }
      let before;
      if (first) {
        const anchor = locations[first].itemId;
        before = this.remember(id, { ...source, ...(anchor ? { cursor: { type: "item", itemId: anchor } } : { omitSummary: true }) });
      } else if (page.nextCursor) before = this.remember(id, { ...source, cursor: page.nextCursor, omitSummary: true });
      else before = source.older || null;
      if (latest) {
        const session = this.projection.session(id);
        if (session.version <= read.version) {
          session.activeRunId = running(merged.status) ? merged.id : null;
          session.status = session.activeRunId ? "running" : "idle";
        }
      }
      return { conversationId: id, rows: locations.slice(first).map((entry) => entry.row), before, revision: read.version };
    } finally { this.projection.end(read); }
  }
  async details(id, { ref, after = null, authoritative = false }) {
    const position = decodePosition(ref);
    if (position.kind === "items" && this.itemPaging.get(id) === false) {
      delete position.kind;
      const legacyRef = encodePosition(position), continuation = after ? decodePosition(after) : null;
      if (continuation && continuation.resource !== ref) throw httpError(400, "输出游标不属于这条记录。");
      const result = await this.resource(id, { ref: legacyRef, after: continuation ? encodePosition({ ...continuation, resource: legacyRef }) : null, authoritative });
      if (result.nextCursor) result.nextCursor = encodePosition({ ...decodePosition(result.nextCursor), resource: ref });
      return result;
    }
    try { return await this.resource(id, { ref, after, authoritative }); }
    catch (error) {
      if (position.kind !== "items" || !/unknown method|method not found|thread\/items\/list.*(not supported|unsupported)/i.test(error.message)) throw error;
      if (after) throw httpError(409, "代理的输出读取方式已变化，请回到开头重新读取。");
      this.itemPaging.set(id, false);
      return this.details(id, { ref, after: null, authoritative });
    }
  }
  async resource(id, { ref, after = null, authoritative = false }) {
    const continuation = after ? decodePosition(after) : { page: null, offset: 0, previous: null };
    if (after && continuation.resource !== ref) throw httpError(400, "输出游标不属于这条记录。");
    const offset = continuation.offset;
    if (!Number.isSafeInteger(offset) || offset < 0) throw httpError(400, "输出位置无效。");
    const position = decodePosition(ref);
    if (typeof position.run !== "string" || typeof position.item !== "string") throw httpError(400, "输出引用无效。");
    const observed = this.projection.sessions.get(id)?.runs.get(position.run)?.items.get(position.item);
    const sourceVersion = continuation.version ?? observed?.version ?? this.projection.sessions.get(id)?.runs.get(position.run)?.version ?? 0;
    const advance = (value) => encodePosition({ page: null, resource: ref, version: sourceVersion, ...value });
    if (!authoritative && !after && observed && running(observed.status) && ["commandExecution", "reasoning"].includes(observed.type)) {
      return { text: itemText(observed).slice(-16_000), nextCursor: null, live: true };
    }
    const supplement = async () => await this.store.getTurnPresentation?.(id, position.run) || {};
    const recovery = async (index) => {
      if (!Number.isSafeInteger(index) || index < 0) throw httpError(400, "恢复记录位置无效。");
      const { snapshot: item, count } = await this.store.getRecoveryItem?.(id, position.run, index) || {};
      if (!item) return { text: "", nextCursor: null };
      const result = await this.resources.slice(JSON.stringify([id, ref, "recovery", item.id, sourceVersion]), offset,
        async () => `## 本地恢复副本 · 原始位置未知\n\n以下是本地保留的执行内容，可能与原始输出重合，不用于推断时间顺序。\n\n${itemText(item)}\n\n`);
      return { text: result.text, nextCursor: result.nextOffset !== null ? advance({ phase: "recovery", index, offset: result.nextOffset })
        : index + 1 < count ? advance({ phase: "recovery", index: index + 1, offset: 0 }) : null };
    };
    if (position.item === "$recovery") return recovery(continuation.index || 0);
    if (position.kind === "items" && position.item === "$turn") {
      const phase = continuation.phase || (after ? "items" : "plan");
      if (phase === "recovery") return recovery(continuation.index || 0);
      if (phase === "plan") {
        const plan = (await supplement()).plan;
        if (plan?.plan?.length || plan?.explanation) {
          const result = await this.resources.slice(JSON.stringify([id, ref, "plan", sourceVersion]), offset,
            async () => `## 计划\n\n${plan.explanation || ""}\n\n${(plan.plan || []).map((step) => `- [${step.status === "completed" ? "x" : " "}] ${step.step}`).join("\n")}\n\n`);
          return { text: result.text, nextCursor: result.nextOffset !== null ? advance({ phase: "plan", offset: result.nextOffset }) : advance({ phase: "items", previous: null, offset: 0 }) };
        }
      }
      const previous = continuation.previous;
      if (previous !== null && typeof previous !== "string") throw httpError(400, "输出游标无效。");
      const result = await this.resources.slice(JSON.stringify([id, ref, previous, sourceVersion]), offset, async () => {
        const page = await this.connection.request("thread/items/list", { threadId: id, turnId: position.run, sortDirection: "asc", limit: 1,
          ...(previous ? { cursor: { type: "item", itemId: previous } } : {}) });
        const item = page.data?.[0]?.item;
        return { body: item ? `## ${item.type === "userMessage" ? "你" : item.type === "agentMessage" ? "Codex" : item.type}\n\n${itemText(item)}\n\n` : "",
          metadata: { itemId: item?.id, more: !!page.nextCursor } };
      });
      return { text: result.text, nextCursor: result.nextOffset !== null ? advance({ phase: "items", previous, offset: result.nextOffset })
        : result.metadata.more ? advance({ phase: "items", previous: result.metadata.itemId, offset: 0 })
          : (await supplement()).recoveryCount ? advance({ phase: "recovery", index: 0, offset: 0 }) : null };
    }
    if (position.kind === "items" && position.item !== "$turn") {
      const result = await this.resources.slice(JSON.stringify([id, ref, sourceVersion]), offset, async () => {
      const previous = await this.connection.request("thread/items/list", { threadId: id, turnId: position.run,
        cursor: { type: "item", itemId: position.item }, sortDirection: "desc", limit: 1 });
      const precedingId = previous.data?.[0]?.item?.id;
      const next = await this.connection.request("thread/items/list", { threadId: id, turnId: position.run,
        ...(precedingId ? { cursor: { type: "item", itemId: precedingId } } : {}), sortDirection: "asc", limit: 1 });
      const item = next.data?.find((entry) => entry.item.id === position.item)?.item;
      if (!item) throw httpError(409, "原始记录的位置已变化，请重新同步。");
      return itemText(item);
      });
      return { text: result.text, nextCursor: result.nextOffset !== null ? advance({ offset: result.nextOffset }) : null };
    }
    const result = await this.resources.slice(JSON.stringify([id, ref, sourceVersion]), offset, async () => {
    const page = await this.readNative(id, position.page, "full");
    const run = page.canonical.find((turn) => turn.id === position.run) || page.turns.find((turn) => turn.id === position.run);
    if (!run) throw httpError(409, "原始记录的位置已变化，请重新同步。");
    let text;
    if (position.item === "$turn") {
      const plan = run.plan || run.task?.plan;
      const sections = [plan?.plan?.length ? `## 计划\n\n${plan.explanation || ""}\n${plan.plan.map((step) => `- [${step.status === "completed" ? "x" : " "}] ${step.step}`).join("\n")}` : ""];
      const seen = new Set();
      for (const item of run.items || []) if (!seen.has(item.id)) {
        seen.add(item.id); const content = itemText(item);
        if (content) sections.push(`## ${item.type === "userMessage" ? "你" : item.type === "agentMessage" ? "Codex" : item.type}\n\n${content}`);
      }
      if (run.diff || run.task?.diff) sections.push(`## 累计文件差异\n\n${run.diff || run.task.diff}`);
      text = sections.filter(Boolean).join("\n\n");
    } else {
      const item = run.items?.find((entry) => entry.id === position.item);
      if (!item) throw httpError(409, "原始记录暂不可用，请重新同步。");
      text = itemText(item);
    }
    return text;
    });
    return { text: result.text, nextCursor: result.nextOffset !== null ? advance({ offset: result.nextOffset }) : null };
  }
  async *export(id, ref) {
    let after = null;
    do {
      const page = await this.details(id, { ref, after, authoritative: true });
      if (page.text) yield page.text;
      if (page.nextCursor === after && after !== null) throw new Error("输出游标没有前进。");
      after = page.nextCursor;
    } while (after !== null);
  }
}
function decodePosition(token) {
  try {
    if (typeof token !== "string" || token.length > 4096) throw new Error();
    const value = JSON.parse(Buffer.from(token, "base64url"));
    if (!value || Array.isArray(value) || !(value.page === null || typeof value.page === "string") || value.anchor !== undefined && typeof value.anchor !== "string") throw new Error();
    return value;
  } catch { throw httpError(400, "历史位置无效。"); }
}
