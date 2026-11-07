import { expect, it } from "vitest";
import { createAppStore } from "../../../app/store";
import { snapshotCommitted, presentationPatched } from "./conversationSlice";
import type { MessageRow } from "@lan/presentation";

const row = (id: string, runId = "old"): MessageRow => ({ id, conversationId: "c", runId, kind: "assistant", text: id });
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
