// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ReadClient } from "@lan/read-api";
import { ReadContext } from "../../transport/ReadContext";
import type { DetailView } from "../../transport/ReadContext";
import { DetailDisclosure } from "./DetailDisclosure";
import { Provider } from "react-redux";
import { createAppStore } from "../../app/store";
import { resourceChanged } from "./resourcesSlice";

afterEach(cleanup);

it("loads output only after expansion and replaces chunks instead of accumulating full output", async () => {
  const details = vi.fn().mockResolvedValueOnce({ text: "first chunk", nextCursor: "opaque-next" }).mockResolvedValueOnce({ text: "last chunk", nextCursor: null });
  const client = { details } as unknown as ReadClient;
  render(<Provider store={createAppStore()}><ReadContext.Provider value={{ client, selection: { conversationId: "a", agentInstanceId: "agent", projectId: "project" } }}>
    <DetailDisclosure detailId="opaque-reference" />
  </ReadContext.Provider></Provider>);
  expect(details).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "查看输出" }));
  expect(await screen.findByText("first chunk")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "下一段" }));
  expect(await screen.findByText("last chunk")).toBeTruthy();
  expect(screen.queryByText("first chunk")).toBeNull();
  expect(details).toHaveBeenLastCalledWith(expect.anything(), "opaque-reference", "opaque-next", expect.any(AbortSignal));
});

it("restores the open output page after a virtual row unmounts", async () => {
  const details = vi.fn().mockResolvedValue({ text: "retained output", nextCursor: null }), cache = new Map<string, DetailView>();
  const source = { client: { details } as unknown as ReadClient, selection: { conversationId: "a", agentInstanceId: "agent", projectId: "project" }, details: cache };
  const row = () => <Provider store={createAppStore()}><ReadContext.Provider value={source}><DetailDisclosure detailId="ref" /></ReadContext.Provider></Provider>;
  const first = render(row()); fireEvent.click(screen.getByRole("button", { name: "查看输出" }));
  await screen.findByText("retained output"); first.unmount(); render(row());
  expect(screen.getByText("retained output")).toBeTruthy(); expect(details).toHaveBeenCalledTimes(1);
});

it("refreshes only expanded live output and coalesces invalidations", async () => {
  const store = createAppStore(), details = vi.fn().mockResolvedValueOnce({ text: "live tail", nextCursor: null, live: true }).mockResolvedValue({ text: "finished output", nextCursor: null });
  const source = { client: { details } as unknown as ReadClient, selection: { conversationId: "a", agentInstanceId: "agent", projectId: "project" } };
  render(<Provider store={store}><ReadContext.Provider value={source}><DetailDisclosure detailId="ref" rowId="tool" /></ReadContext.Provider></Provider>);
  act(() => store.dispatch(resourceChanged({ conversationId: "a", rowId: "tool" })));
  expect(details).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "查看输出" })); await screen.findByText("live tail");
  vi.useFakeTimers();
  try {
    act(() => { for (let index = 0; index < 20; index++) store.dispatch(resourceChanged({ conversationId: "a", rowId: "tool" })); });
    await act(async () => { await vi.advanceTimersByTimeAsync(501); });
    expect(details).toHaveBeenCalledTimes(2);
    expect(screen.getByText("finished output")).toBeTruthy();
  } finally { vi.useRealTimers(); }
});
