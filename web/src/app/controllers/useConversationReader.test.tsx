// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { afterEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { ReadClient, StreamHandlers } from "@lan/read-api";
import { createAppStore } from "../store";
import { useConversationReader } from "./useConversationReader";

afterEach(cleanup);

it("clears the older-page loading state when a live snapshot cancels that read", async () => {
  let stream!: StreamHandlers;
  const row = (id: string) => ({ id, conversationId: "c", runId: "r", kind: "user" as const, text: id });
  const history = vi.fn().mockResolvedValueOnce({ conversationId: "c", rows: [row("older")], before: "page-2" })
    .mockImplementationOnce((_selection, _before, signal: AbortSignal) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")))));
  const client = { history, watch: (_selection: unknown, handlers: StreamHandlers) => {
    stream = handlers;
    queueMicrotask(() => handlers.snapshot({ conversationId: "c", rows: [row("latest")], before: "page-1" }));
    return () => {};
  } } as unknown as ReadClient;
  const store = createAppStore(), selection = { conversationId: "c", projectId: "p", agentInstanceId: "a" };
  const { result } = renderHook(() => useConversationReader(client, selection), { wrapper: ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider> });
  await waitFor(() => expect(result.current.before).toBe("page-1"));
  act(() => result.current.older());
  await waitFor(() => expect(result.current.before).toBe("page-2"));
  act(() => result.current.older());
  expect(result.current.loading).toBe(true);
  act(() => stream.snapshot({ conversationId: "c", rows: [row("latest")], before: "page-1" }));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.before).toBe("page-2");
});
