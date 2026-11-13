import { expect, it } from "vitest";
import { createAppStore } from "../../../app/store";
import { snapshotCommitted, presentationPatched } from "./conversationSlice";
import type { MessageRow } from "@lan/presentation";

const row = (id: string, runId = "old"): MessageRow => ({ id, conversationId: "c", runId, kind: "assistant", text: id });
it("corrects existing rows independently of content revisions and ignores older position commits", () => {
  const store = createAppStore();
  const summary = { id: "summary", runId: "old", conversationId: "c", kind: "summary" as const, status: "completed" as const };
  store.dispatch(snapshotCommitted({ conversationId: "c", rows: [row("user"), { ...row("answer"), text: "new answer", revision: 100 }, row("progress"), row("search"), summary] }));
  const order = ["user", "progress", "search", "answer"];
  store.dispatch(presentationPatched({ conversationId: "c", appendRun: false, removeIds: [], upserts: [], placements: order.map((id, i) => ({ id, revision: 20, afterId: order[i - 1], beforeId: order[i + 1] || "summary" })) }));
  expect(store.getState().conversation.timelines.c!.ids).toEqual([...order, "summary"]);
  expect(store.getState().conversation.entities.answer).toMatchObject({ text: "new answer", revision: 100 });
  store.dispatch(presentationPatched({ conversationId: "c", appendRun: false, removeIds: [], upserts: [], placements: [{ id: "answer", beforeId: "progress", revision: 19 }, { id: "unloaded", beforeId: "summary", revision: 21 }] }));
  expect(store.getState().conversation.timelines.c!.ids).toEqual([...order, "summary"]);
  expect(store.getState().conversation.entities.unloaded).toBeUndefined();
});

it("a partial position commit preserves unseen rows and never crosses run boundaries", () => {
  const store = createAppStore();
  store.dispatch(snapshotCommitted({ conversationId: "c", rows: [row("older", "previous"), row("a"), row("live"), row("b"), row("tail")] }));
  const ids = store.getState().conversation.timelines.c!.ids;
  store.dispatch(presentationPatched({ conversationId: "c", appendRun: false, removeIds: [], upserts: [], placements: [{ id: "a", beforeId: "b", revision: 10 }, { id: "b", afterId: "a", revision: 10 }, { id: "a", beforeId: "older", revision: 11 }] }));
  expect(store.getState().conversation.timelines.c!.ids).toBe(ids);
});
it("patches one entity without changing order and anchors new items before an existing run summary", () => {
  const store = createAppStore();
  store.dispatch(snapshotCommitted({ conversationId: "c", rows: [row("a"), { id: "summary", runId: "old", conversationId: "c", kind: "summary", status: "running" }] }));
  const ids = store.getState().conversation.timelines.c!.ids;
  store.dispatch(presentationPatched({ conversationId: "c", appendRun: false, removeIds: [], upserts: [{ row: { ...row("a"), text: "changed" } }] }));
  expect(store.getState().conversation.timelines.c!.ids).toBe(ids);
  store.dispatch(presentationPatched({ conversationId: "c", appendRun: false, removeIds: [], upserts: [{ row: row("b"), beforeId: "summary", afterId: "a" }] }));
  expect(store.getState().conversation.timelines.c!.ids).toEqual(["a", "b", "summary"]);
  store.dispatch(presentationPatched({ conversationId: "c", appendRun: false, removeIds: [], upserts: [{ row: row("late", "unloaded-old-run") }] }));
  expect(store.getState().conversation.timelines.c!.ids).toEqual(["a", "b", "summary"]);
});
