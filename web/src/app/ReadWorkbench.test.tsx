// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { VirtuosoMockContext } from "react-virtuoso";
import { afterEach, expect, it, vi } from "vitest";
import type { ReadClient } from "@lan/read-api";
import { ReadWorkbench } from "./ReadWorkbench";
import { createAppStore } from "./store";

afterEach(cleanup);

it("uses runtime product metadata and preserves drafts across project transitions without reading a stale selection", async () => {
  const history = vi.fn(async (selection) => ({ conversationId: selection.conversationId, before: null, rows: [{
    id: selection.conversationId + "-row", conversationId: selection.conversationId, runId: "run", kind: "assistant", text: "reply-" + selection.projectId,
  }] }));
  const client = {
    bootstrap: async () => ({ version: 1, edition: { id: "pilan", displayName: "PILAN", defaultProviderId: "pi" },
      agents: [{ instanceId: "pi-instance", providerId: "pi", displayName: "Pi", access: "read-only", settings: [], capabilities: {} }],
      projects: [{ id: "a", name: "Project A", available: true }, { id: "b", name: "Project B", available: true }] }),
    list: async (projectId: string) => ({ conversations: [{ id: projectId + "-conversation", projectId, agentInstanceId: "pi-instance", title: "Conversation " + projectId }], nextCursor: null }),
    history,
  } as unknown as ReadClient;
  render(<Provider store={createAppStore()}><VirtuosoMockContext.Provider value={{ viewportHeight: 400, itemHeight: 44 }}>
    <ReadWorkbench client={client} />
  </VirtuosoMockContext.Provider></Provider>);
  expect(await screen.findByText("reply-a")).toBeTruthy();
  expect(screen.getByRole("heading", { name: "PILAN · 只读预览" })).toBeTruthy();
  fireEvent.change(screen.getByRole("textbox", { name: "草稿" }), { target: { value: "draft a" } });
  fireEvent.change(screen.getByRole("combobox", { name: "项目" }), { target: { value: "b" } });
  expect(await screen.findByText("reply-b")).toBeTruthy();
  fireEvent.change(screen.getByRole("combobox", { name: "项目" }), { target: { value: "a" } });
  expect(await screen.findByText("reply-a")).toBeTruthy();
  expect(screen.getByRole<HTMLTextAreaElement>("textbox", { name: "草稿" }).value).toBe("draft a");
  expect(history.mock.calls.every(([selection]) => selection.conversationId.startsWith(selection.projectId))).toBe(true);
});
