import { describe, expect, it } from "vitest";
import { createAppStore } from "../../../app/store";
import { conversationReleased, orderedRowsPrepended, rowsCommitted, snapshotCommitted } from "./conversationSlice";
import { createConversationFixture } from "../../../dev/fixtures";
import type { TimelineRow } from "./types";

describe("committed conversation state", () => {
  it("updates one entity without changing timeline order or unrelated row identities", () => {
    const store = createAppStore();
    const fixture = createConversationFixture("a", 3);
    store.dispatch(snapshotCommitted({ conversationId: "a", rows: fixture }));
    const before = store.getState().conversation;
    const answer = fixture.at(-1)!;
    store.dispatch(rowsCommitted({ conversationId: "a", rows: [{ ...answer, kind: "assistant", text: "new text" }] }));
    const after = store.getState().conversation;
    expect(after.timelines.a?.ids).toBe(before.timelines.a?.ids);
    expect(after.entities[fixture[1]!.id]).toBe(before.entities[fixture[1]!.id]);
    expect(after.entities[answer.id]).not.toBe(before.entities[answer.id]);
  });

  it("does not invent chronological positions for unknown event identities", () => {
    const store = createAppStore();
    const fixture = createConversationFixture("a", 1);
    store.dispatch(snapshotCommitted({ conversationId: "a", rows: fixture }));
    const unknown: TimelineRow = { id: "unknown", conversationId: "a", runId: "later", kind: "assistant", text: "late" };
    store.dispatch(rowsCommitted({ conversationId: "a", rows: [unknown] }));
    expect(store.getState().conversation.timelines.a?.ids).toEqual(fixture.map((row) => row.id));
    expect(store.getState().conversation.timelines.a?.needsSnapshot).toBe(true);
    expect(store.getState().conversation.entities.unknown).toBeUndefined();
  });

  it("prepends unique history and preserves existing item coordinates", () => {
    const store = createAppStore();
    const fixture = createConversationFixture("a", 1);
    store.dispatch(snapshotCommitted({ conversationId: "a", rows: fixture }));
    const before = store.getState().conversation.timelines.a!;
    const older: TimelineRow = { id: "older", conversationId: "a", runId: "older-turn", kind: "user", text: "earlier" };
    store.dispatch(orderedRowsPrepended({ conversationId: "a", rows: [older, older, fixture[0]!] }));
    const after = store.getState().conversation.timelines.a!;
    expect(after.ids).toEqual(["older", ...before.ids]);
    expect(after.firstItemIndex + 1).toBe(before.firstItemIndex);
  });

  it("releases inactive history without dropping another conversation", () => {
    const store = createAppStore();
    const a = createConversationFixture("a", 2), b = createConversationFixture("b", 2);
    store.dispatch(snapshotCommitted({ conversationId: "a", rows: a }));
    store.dispatch(snapshotCommitted({ conversationId: "b", rows: b }));
    const previousB = store.getState().conversation.timelines.b;
    store.dispatch(conversationReleased("a"));
    expect(store.getState().conversation.timelines.a).toBeUndefined();
    expect(store.getState().conversation.timelines.b).toBe(previousB);
    expect(a.every((row) => !store.getState().conversation.entities[row.id])).toBe(true);
  });
});
