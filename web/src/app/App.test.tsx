// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { Provider } from "react-redux";
import { VirtuosoMockContext } from "react-virtuoso";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import type { ReadClient } from "@lan/read-api";
import { App } from "./App";
import { createAppStore } from "./store";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
beforeAll(() => { HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); }; });

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
    <App client={client} />
  </VirtuosoMockContext.Provider></Provider>);
  expect(await screen.findByText("reply-a")).toBeTruthy();
  expect(screen.getByRole("heading", { name: "PILAN" })).toBeTruthy();
  fireEvent.change(screen.getByRole("textbox", { name: "草稿" }), { target: { value: "draft a" } });
  fireEvent.click(screen.getByRole("button", { name: "Project B" }));
  expect(await screen.findByText("reply-b")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Project A" }));
  expect(await screen.findByText("reply-a")).toBeTruthy();
  expect(screen.getByRole<HTMLTextAreaElement>("textbox", { name: "草稿" }).value).toBe("draft a");
  expect(history.mock.calls.every(([selection]) => selection.conversationId.startsWith(selection.projectId))).toBe(true);
});

it.each(["header", "mobile sidebar"])("LAN HTTP creates from %s while existing conversations remain read-only", async (entry) => {
  // Match the phone's non-secure LAN origin instead of localhost's Web Crypto.
  vi.stubGlobal("crypto", { getRandomValues: crypto.getRandomValues.bind(crypto) });
  const selection = (id: string) => ({ id, projectId: "p", agentInstanceId: "agent", title: id });
  const client = {
    bootstrap: async () => ({ version: 1, parallel: true, edition: { id: "lan", displayName: "LAN", defaultProviderId: "provider" },
      agents: [{ instanceId: "agent", providerId: "provider", displayName: "Agent", access: "interactive", settings: [], capabilities: {} }], projects: [{ id: "p", name: "P", available: true }] }),
    list: async () => ({ conversations: [selection("old")], nextCursor: null }),
    create: vi.fn(async () => selection("new")), command: vi.fn(async () => ({})),
    history: async (selected: { conversationId: string }) => ({ conversationId: selected.conversationId, rows: [{ id: selected.conversationId + "-message", conversationId: selected.conversationId, runId: "r", kind: "assistant", text: "content " + selected.conversationId }], before: null }),
    controls: async (selected: { conversationId: string }) => ({ conversationId: selected.conversationId, writable: selected.conversationId === "new", status: "idle", activeRunId: null, questions: [], approvals: [], queue: [], queueCount: 0, settings: {}, goal: null }),
  } as unknown as ReadClient;
  render(<Provider store={createAppStore()}><VirtuosoMockContext.Provider value={{ viewportHeight: 400, itemHeight: 44 }}><App client={client} /></VirtuosoMockContext.Provider></Provider>);
  await screen.findByText("content old"); expect(screen.queryByRole("button", { name: "发送" })).toBeNull();
  if (entry === "header") fireEvent.click(screen.getByRole("button", { name: "新建聊天" }));
  else {
    fireEvent.click(screen.getByRole("button", { name: "打开会话导航" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "新会话" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  }
  expect(await screen.findByRole("button", { name: "发送" })).toBeTruthy();
  expect(client.create).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "聊天操作" }));
  fireEvent.click(screen.getByRole("button", { name: "修改聊天名称" }));
  const rename = within(screen.getByRole("dialog", { name: "修改聊天名称" }));
  fireEvent.click(rename.getByRole("button", { name: "自动生成" }));
  expect(rename.getByText("先发送一条消息，才能自动生成聊天名称。")).toBeTruthy();
  expect(client.create).not.toHaveBeenCalled(); expect(client.command).not.toHaveBeenCalled();
  fireEvent.click(rename.getByRole("button", { name: "取消" }));
  fireEvent.change(screen.getByRole("textbox", { name: "草稿" }), { target: { value: "first task" } });
  fireEvent.click(screen.getByRole("button", { name: "发送" }));
  await screen.findByText("content new"); expect(await screen.findByRole("button", { name: "发送" })).toBeTruthy();
  expect(client.create).toHaveBeenCalledTimes(1);
  expect(client.command).toHaveBeenCalledWith({ conversationId: "new", projectId: "p", agentInstanceId: "agent" }, { type: "submit", text: "first task" }, expect.any(AbortSignal));
});

it("normal mode continues an existing chat with the regular composer and no trial notices", async () => {
  const selected = { id: "existing", projectId: "p", agentInstanceId: "agent", title: "Existing" };
  const client = {
    bootstrap: async () => ({ parallel: false, edition: { displayName: "LAN", defaultProviderId: "provider" }, agents: [{ instanceId: "agent", providerId: "provider", displayName: "Agent", access: "interactive", capabilities: {} }], projects: [{ id: "p", name: "P", available: true }] }),
    list: async () => ({ conversations: [selected], nextCursor: null }), command: vi.fn(async () => ({})),
    history: async () => ({ conversationId: "existing", rows: [], before: null }),
    controls: async () => ({ conversationId: "existing", writable: true, status: "idle", activeRunId: null, questions: [], approvals: [], queue: [], settings: {}, goal: null }),
  } as unknown as ReadClient;
  render(<Provider store={createAppStore()}><VirtuosoMockContext.Provider value={{ viewportHeight: 400, itemHeight: 44 }}><App client={client} /></VirtuosoMockContext.Provider></Provider>);
  await screen.findByRole("button", { name: "发送" });
  expect(screen.queryByText(/原有会话只读|React 试用|只读会话/)).toBeNull();
  fireEvent.change(screen.getByRole("textbox", { name: "草稿" }), { target: { value: "continue here" } });
  fireEvent.click(screen.getByRole("button", { name: "发送" }));
  await vi.waitFor(() => expect(client.command).toHaveBeenCalledWith({ conversationId: "existing", projectId: "p", agentInstanceId: "agent" }, { type: "submit", text: "continue here" }, expect.any(AbortSignal)));
});
