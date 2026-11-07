import { describe, expect, it, vi } from "vitest";
import type { HistoryPage, ReadClient, StreamHandlers } from "@lan/read-api";
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

it("reconnect retains older reading coordinates and ignores buffered rows older than the snapshot", async () => {
  let receive!: StreamHandlers;
  const row = (id: string, text: string, revision = 1) => ({ id, conversationId: "a", runId: "run", kind: "assistant" as const, text, revision });
  const client = { watch: (_selection: unknown, handlers: StreamHandlers) => { receive = handlers; return () => {}; },
    history: async () => ({ conversationId: "a", before: null, rows: [row("older", "older")] }) } as unknown as ReadClient;
  const store = createAppStore(), reader = new ConversationReader(client, store);
  const opened = reader.open({ conversationId: "a", agentInstanceId: "agent", projectId: "p" });
  receive.snapshot({ conversationId: "a", before: "cursor", revision: 5, rows: [row("latest", "complete", 8)] }); await opened;
  receive.patch({ conversationId: "a", appendRun: false, removeIds: [], upserts: [{ row: row("latest", "stale", 7) }] });
  const latest = store.getState().conversation.entities.latest;
  expect(latest?.kind === "assistant" && latest.text).toBe("complete");
  await reader.older(); const index = store.getState().conversation.timelines.a!.firstItemIndex;
  receive.snapshot({ conversationId: "a", before: "new-cursor", revision: 9, rows: [row("latest", "new", 9)] });
  expect(store.getState().conversation.timelines.a!.ids).toEqual(["older", "latest"]);
  expect(store.getState().conversation.timelines.a!.firstItemIndex).toBe(index); reader.close();
});

it("repeated older-page requests keep retained content within the reading budget", async () => {
  let page = 0;
  const client = { history: async () => ({ conversationId: "a", before: "more", rows: Array.from({ length: 100 }, (_, index) => ({
    id: `${page}-${index}`, conversationId: "a", runId: "run", kind: "assistant" as const, text: "x".repeat(5000),
  })).map((row) => ({ ...row, id: `${page++}:${row.id}` })) }) } as unknown as ReadClient;
  const store = createAppStore(), reader = new ConversationReader(client, store);
  await reader.open({ conversationId: "a", agentInstanceId: "agent", projectId: "p" });
  for (let index = 0; index < 12; index++) await reader.older();
  expect(Object.keys(store.getState().conversation.entities).length).toBeLessThanOrEqual(1500);
  const retained = Object.values(store.getState().conversation.entities).reduce((sum, row) => sum + (row.kind === "assistant" ? row.text.length * 2 + 512 : 0), 0);
  expect(retained).toBeLessThanOrEqual(2_000_000); reader.close();
});
