import { httpError } from "../../workspace-store.mjs";

// Native history and its live/read bridge have one owner for both LAN clients.
export function createCodexHistoryReader({ codex, liveThreads, reconcileSupplements }) {
  async function readWhenMaterialized(threadId, includeTurns) {
    for (let attempt = 0; ; attempt++) {
      try { return await codex.request("thread/read", { threadId, includeTurns }); }
      catch (error) {
        const message = String(error?.message || "").toLowerCase();
        if (attempt >= 10 || !message.includes("failed to read session metadata") || !message.includes("is empty")) throw error;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
  }

  async function readPage(threadId, query, { mapTurn = (turn) => turn, includeCanonical = false } = {}) {
    const limit = Number(query.get("limit") || 12);
    if (!Number.isInteger(limit) || limit < 1 || limit > 40) throw httpError(400, "聊天历史每页数量必须是 1 到 40。");
    const cursor = query.get("before");
    const reader = liveThreads.beginRead(threadId);
    try {
      const [metadata, page] = await Promise.all([
        readWhenMaterialized(threadId, false),
        codex.request("thread/turns/list", { threadId, limit, sortDirection: "desc", itemsView: "full", ...(cursor ? { cursor } : {}) }),
      ]);
      const canonicalTurns = (Array.isArray(page?.data) ? page.data : []).slice().reverse();
      await reconcileSupplements(threadId, canonicalTurns);
      const turns = liveThreads.reconcile(threadId, canonicalTurns, reader.version).map(mapTurn);
      return {
        thread: { ...metadata.thread, turns }, allTurns: turns, ...(includeCanonical ? { canonicalTurns } : {}),
        history: { turns, hasMore: Boolean(page?.nextCursor), before: page?.nextCursor || null, totalTurns: null },
      };
    } catch (error) {
      if (!unsupportedList(error)) throw error;
      const result = await readWhenMaterialized(threadId, true);
      const canonicalTurns = result.thread.turns || [];
      const allTurns = liveThreads.reconcile(threadId, canonicalTurns, reader.version);
      await reconcileSupplements(threadId, allTurns);
      let end = allTurns.length;
      if (cursor) {
        end = allTurns.findIndex((turn) => turn.id === cursor);
        if (end < 0) throw httpError(409, "聊天历史位置已经变化，请重新打开聊天。");
      }
      const start = Math.max(0, end - limit);
      const page = allTurns.slice(start, end);
      return {
        thread: { ...result.thread, turns: page.map(mapTurn) }, allTurns, ...(includeCanonical ? { canonicalTurns } : {}),
        history: { turns: page, hasMore: start > 0, before: page[0]?.id || null, totalTurns: allTurns.length },
      };
    } finally { liveThreads.endRead(reader); }
  }
  return { readPage };
}

function unsupportedList(error) {
  const text = String(error?.message || "").toLowerCase();
  return text.includes("unknown method thread/turns/list") || text.includes("paginated_threads is not supported yet")
    || text.includes("thread/turns/list is not supported") || text.includes("method not found")
    || (text.includes("thread/turns/list") && (text.includes("unsupported") || text.includes("unavailable")));
}
