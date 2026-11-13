import { EventEmitter } from "node:events";
import { expect, it } from "vitest";
// @ts-expect-error The native adapter is an ESM JavaScript implementation.
import { createCodexAdapter } from "../../../../server/agents/codex/adapter.mjs";
// @ts-expect-error The adapter owns native item conversion.
import { presentItem } from "../../../../server/agents/codex/presentation.mjs";
import { createAppStore } from "../store";
import { ConversationReader } from "./ConversationReader";
import type { ReadClient, StreamHandlers } from "@lan/read-api";
import type { PresentationPatch } from "@lan/presentation";

it.each(["misordered", "summary-only"])("completion reconciles %s through adapter batching and the selected reader", async (initial) => {
  const items = [
    { id: "user", type: "userMessage", content: [{ type: "text", text: "网络上怎么说的，没有人主持公道吗？" }] },
    { id: "progress", type: "agentMessage", phase: "commentary", text: "我会查公开讨论、媒体报道。" },
    { id: "search-1", type: "webSearch", query: "first search" },
    { id: "reasoning-1", type: "reasoning", summary: [] },
    { id: "search-2", type: "webSearch", query: "second search" },
    { id: "reasoning-2", type: "reasoning", summary: [] },
    { id: "answer", type: "agentMessage", phase: "final_answer", text: "有用户公开抗议，也有媒体报道。" },
  ];
  const native = { id: "r", status: "completed", items };
  const connection = { events: new EventEmitter(), request: async (method: string) => {
    if (method === "thread/turns/list") return { data: [native] };
    if (method === "thread/read") return { thread: { id: "c", status: "idle" } };
    throw new Error(method);
  } };
  const adapter = createCodexAdapter({ connection, store: {
    threadProjects: { c: "p" }, recordTurnMetric: async () => {}, recordItemMetric: async () => {}, reconcileExecutionSupplements: async () => {},
  } });
  const received: PresentationPatch[] = [];
  const store = createAppStore();
  let handlers!: StreamHandlers;
  const client = { watch: (_selection: unknown, receive: StreamHandlers) => {
    handlers = receive;
    return adapter.observe("c", (event: PresentationPatch & { kind: string }) => {
      if (event.kind === "patch") { received.push(event); receive.patch(event); }
    });
  } } as unknown as ReadClient;
  const reader = new ConversationReader(client, store);
  try {
    const open = reader.open({ conversationId: "c", projectId: "p", agentInstanceId: "codex-local" });
    const wrong = [items[0], items[6], ...items.slice(1, 6)];
    const rows = wrong.map(item => presentItem("c", native, item));
    handlers.snapshot({ conversationId: "c", revision: 0, before: null, rows: [...(initial === "misordered" ? rows : []), presentItem("c", native, null)] });
    await open;
    for (const item of wrong) connection.events.emit("notification", { method: "item/started", params: { threadId: "c", turnId: "r", item } });
    connection.events.emit("notification", { method: "turn/completed", params: { threadId: "c", turn: native } });
    await new Promise(resolve => setImmediate(resolve));
    const state = store.getState().conversation;
    expect(state.timelines.c!.ids).toEqual([...items.map(item => presentItem("c", native, item).id), presentItem("c", native, null).id]);
    expect(received.some(event => event.placements?.length)).toBe(true);
    expect(received.every(event => event.upserts.length <= 10 && (event.placements?.length || 0) <= 10)).toBe(true);
    handlers.snapshot({ conversationId: "c", revision: 100, before: null, rows: [...items.map(item => presentItem("c", native, item)), presentItem("c", native, null)] });
    const ids = store.getState().conversation.timelines.c!.ids;
    handlers.patch({ conversationId: "c", appendRun: false, removeIds: [], upserts: [], placements: [{ id: rows[1].id, beforeId: rows[2].id, revision: 99 }] });
    expect(store.getState().conversation.timelines.c!.ids).toBe(ids);
  } finally { reader.close(); await adapter.close(); }
});
