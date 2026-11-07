import { describe, expect, it, vi } from "vitest";
import type { HistoryPage, ReadClient } from "@lan/read-api";
import { createAppStore } from "../store";
import { ConversationReader } from "./ConversationReader";

describe("selected conversation read lifetime", () => {
  it("ignores late history even when a transport ignores abort, and releases the old conversation", async () => {
    const pending = new Map<string, (page: HistoryPage) => void>();
    const signals: AbortSignal[] = [];
    const client = { history: vi.fn((selection, _before, signal) => {
      signals.push(signal);
      return new Promise<HistoryPage>((resolve) => pending.set(selection.conversationId, resolve));
    }) } as unknown as ReadClient;
    const store = createAppStore(), reader = new ConversationReader(client, store);
    const a = reader.open({ conversationId: "a", agentInstanceId: "agent", projectId: "project" });
    const b = reader.open({ conversationId: "b", agentInstanceId: "agent", projectId: "project" });
    pending.get("b")!({ conversationId: "b", before: null, rows: [{ id: "b-row", conversationId: "b", runId: "run", kind: "assistant", text: "new" }] });
    await b;
    pending.get("a")!({ conversationId: "a", before: null, rows: [{ id: "a-row", conversationId: "a", runId: "run", kind: "assistant", text: "stale" }] });
    expect(await a).toBeNull();
    expect(signals[0]?.aborted).toBe(true);
    expect(store.getState().conversation.timelines.a).toBeUndefined();
    expect(store.getState().conversation.entities["a-row"]).toBeUndefined();
    reader.close();
    expect(store.getState().conversation.timelines.b).toBeUndefined();
  });

  it("uses the returned history cursor and preserves row coordinates on prepend", async () => {
    const client = { history: vi.fn().mockResolvedValueOnce({ conversationId: "a", before: "opaque", rows: [
      { id: "latest", conversationId: "a", runId: "run", kind: "assistant", text: "latest" },
    ] }).mockResolvedValueOnce({ conversationId: "a", before: null, rows: [
      { id: "older", conversationId: "a", runId: "older-run", kind: "user", text: "older" },
    ] }) } as unknown as ReadClient;
    const store = createAppStore(), reader = new ConversationReader(client, store);
    await reader.open({ conversationId: "a", agentInstanceId: "agent", projectId: "project" });
    const initial = store.getState().conversation.timelines.a!;
    await reader.older();
    expect(client.history).toHaveBeenLastCalledWith(expect.anything(), "opaque", expect.any(AbortSignal));
    const loaded = store.getState().conversation.timelines.a!;
    expect(loaded.ids).toEqual(["older", "latest"]);
    expect(loaded.firstItemIndex + 1).toBe(initial.firstItemIndex);
    expect(await reader.older()).toBeNull();
  });
});
