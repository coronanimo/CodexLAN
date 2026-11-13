import { afterEach, expect, it, vi } from "vitest";
import { lanClient } from "./lan-client";

afterEach(() => vi.unstubAllGlobals());
it("decodes bounded position commits through the sequenced event stream", () => {
  let stream!: EventTarget;
  class FakeEventSource extends EventTarget {
    constructor(_url: string) { super(); stream = this; }
    close() {}
  }
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal("document", new EventTarget()); vi.stubGlobal("window", new EventTarget());
  const patch = vi.fn(), status = vi.fn();
  const stop = lanClient.watch!({ conversationId: "c", projectId: "p", agentInstanceId: "a" }, { snapshot: vi.fn(), patch, status });
  const send = (value: object) => stream.dispatchEvent(new MessageEvent("lan", { data: JSON.stringify({ epoch: "e", ...value }) }));
  try {
    send({ sequence: 1, kind: "snapshot", page: { conversationId: "c", revision: 1, rows: [], before: null } });
    send({ sequence: 2, kind: "patch", conversationId: "c", appendRun: false, removeIds: [], upserts: [], placements: [{ id: "answer", afterId: "search", revision: 2, nativePayload: "ignored" }] });
    expect(patch).toHaveBeenCalledWith({ conversationId: "c", appendRun: false, removeIds: [], upserts: [], placements: [{ id: "answer", afterId: "search", beforeId: undefined, revision: 2 }] });
    send({ sequence: 3, kind: "patch", conversationId: "c", appendRun: false, removeIds: [], upserts: [], placements: [{ id: "answer", revision: "invalid" }] });
    expect(patch).toHaveBeenCalledTimes(1);
    expect(status).toHaveBeenLastCalledWith("实时数据需要重新同步…");
  } finally { stop(); }
});
it("retains file-change and image preview actions and interactive cards through real HTTP decoding", async () => {
  const base = { conversationId: "c", runId: "r" };
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ conversationId: "c", before: null, rows: [
    { ...base, id: "diff", kind: "execution", label: "文件", title: "已修改 1 个文件", status: "completed", preview: "diff", changes: { files: 1, added: 2, removed: 1 }, hideCompletedStatus: true, detailId: "changes", nativePayload: "must not enter UI" },
    { ...base, id: "image", kind: "execution", label: "图片", title: "result.png", status: "completed", preview: "image", startedAt: 1700000000000, completedAt: 1700000000800, durationMs: 800, files: [{ name: "result.png", path: "result.png", image: true, label: "生成图片" }] },
    { ...base, id: "reply", kind: "assistant", text: "结果", timestamp: 1700000000000, appearance: "progress", visualizations: [{ path: "chart.html", title: "结果图", mode: "wide" }] },
    { ...base, id: "summary", kind: "summary", status: "completed", changes: { files: 1, added: 2, removed: 1 }, diffDetailId: "all-changes", timing: { totalMs: 12000, commandMs: 800, commandCount: 1, commandUnknownCount: 0, providerMs: 11200 } },
    { ...base, id: "answer", kind: "user", text: "我的回答：继续", replyTo: "q" },
  ] })));
  const page = await lanClient.history({ conversationId: "c", projectId: "p", agentInstanceId: "a" }, null, new AbortController().signal);
  expect(page.rows[0]).toMatchObject({ preview: "diff", detailId: "changes", changes: { files: 1, added: 2, removed: 1 }, hideCompletedStatus: true }); expect(page.rows[0]).not.toHaveProperty("nativePayload");
  expect(page.rows[1]).toMatchObject({ preview: "image", startedAt: 1700000000000, completedAt: 1700000000800, durationMs: 800, files: [{ path: "result.png", image: true, label: "生成图片" }] });
  expect(page.rows[2]).toMatchObject({ timestamp: 1700000000000, appearance: "progress", visualizations: [{ path: "chart.html", title: "结果图", mode: "wide" }] });
  expect(page.rows[3]).toMatchObject({ diffDetailId: "all-changes", changes: { files: 1, added: 2, removed: 1 }, timing: { totalMs: 12000, commandMs: 800, commandCount: 1, commandUnknownCount: 0, providerMs: 11200 } });
  expect(page.rows[4]).toMatchObject({ kind: "user", replyTo: "q" });
});
