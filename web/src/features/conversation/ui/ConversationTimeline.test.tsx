// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { afterEach, expect, it, vi } from "vitest";
import { createAppStore } from "../../../app/store";
import { snapshotCommitted } from "../model/conversationSlice";
import { ConversationTimeline } from "./ConversationTimeline";

vi.mock("react-virtuoso", () => ({ Virtuoso: ({ startReached, context, components }: { startReached?(): void; context: unknown; components: { Header: React.ComponentType<{ context: unknown }> } }) => <div>
  <button onClick={() => startReached?.()}>滚到历史上边界</button><components.Header context={context} />
</div> }));
afterEach(cleanup);

it("offers resume at the bottom when the reading window is paused", () => {
  const store = createAppStore(), refresh = vi.fn();
  store.dispatch(snapshotCommitted({ conversationId: "c", rows: [{ id: "latest", conversationId: "c", runId: "r", kind: "user", text: "latest" }] }));
  render(<Provider store={store}><ConversationTimeline conversationId="c" history={{ before: null, loading: false, paused: true, older: vi.fn(), refresh }} /></Provider>);
  expect(screen.getByRole("status").textContent).toContain("暂停更新");
  fireEvent.click(screen.getByText("↓ 回到最新")); expect(refresh).toHaveBeenCalledTimes(1);
});

it("loads older history at the list boundary, waits while loading, and leaves failures for manual retry", () => {
  const store = createAppStore();
  store.dispatch(snapshotCommitted({ conversationId: "c", rows: [{ id: "latest", conversationId: "c", runId: "r", kind: "user", text: "latest" }] }));
  const older = vi.fn(), history = { before: "older" as string | null, loading: false, error: "", older, refresh: vi.fn() };
  const view = (value: typeof history) => <Provider store={store}><ConversationTimeline conversationId="c" history={value} /></Provider>;
  const { rerender } = render(view(history));
  fireEvent.click(screen.getByText("滚到历史上边界")); expect(older).toHaveBeenCalledTimes(1);
  rerender(view({ ...history, loading: true }));
  fireEvent.click(screen.getByText("滚到历史上边界")); expect(older).toHaveBeenCalledTimes(1);
  rerender(view({ ...history, error: "failed" }));
  fireEvent.click(screen.getByText("滚到历史上边界")); expect(older).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByText("加载更早消息")); expect(older).toHaveBeenCalledTimes(2);
  rerender(view({ ...history, before: null }));
  fireEvent.click(screen.getByText("滚到历史上边界")); expect(older).toHaveBeenCalledTimes(2);
});
