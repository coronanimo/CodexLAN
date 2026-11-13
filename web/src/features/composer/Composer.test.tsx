// @vitest-environment jsdom
import { Profiler } from "react";
import { Provider } from "react-redux";
import { VirtuosoMockContext } from "react-virtuoso";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAppStore } from "../../app/store";
import { snapshotCommitted, rowsCommitted } from "../conversation/model/conversationSlice";
import { TimelineRow } from "../conversation/ui/TimelineRow";
import { createConversationFixture } from "../../dev/fixtures";
import { Composer } from "./Composer";
import { Workbench } from "../../app/Workbench";
import { ActionContext } from "../../app/ActionContext";
import type { ActionPort } from "../../app/ActionContext";
import { Attachments } from "../../app/controllers/Attachments";
import type { ReadClient } from "@lan/read-api";
import { controlsReceived } from "../controls/controlsSlice";

afterEach(cleanup);

it.each(["/goal pause", "/plan"])("keeps text typed while %s is being applied", async (command) => {
  const store = createAppStore(), drafts = new Map<string, string>();
  let finish!: () => void;
  const execute = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
  const attachments = new Attachments({} as ReadClient);
  const actions = { execute, drafts, attachments, conversationId: "c", selection: { conversationId: "c", projectId: "p", agentInstanceId: "a" },
    capabilities: { goals: true, plans: true }, settings: [{ key: "provider.plan", role: "planning", switchValues: { enabled: "plan", disabled: "default" } }], currentSettings: () => ({}) } as unknown as ActionPort;
  const view = <Provider store={store}><ActionContext.Provider value={actions}><Composer conversationId="c" drafts={drafts} /></ActionContext.Provider></Provider>;
  const first = render(view), input = screen.getByRole<HTMLTextAreaElement>("textbox", { name: "草稿" });
  fireEvent.change(input, { target: { value: command } }); fireEvent.submit(input.closest("form")!);
  expect(execute).toHaveBeenCalledTimes(1);
  fireEvent.change(input, { target: { value: "next message" } });
  await act(async () => { finish(); });
  first.unmount(); render(view);
  expect(screen.getByRole<HTMLTextAreaElement>("textbox", { name: "草稿" }).value).toBe("next message");
  attachments.close();
});

describe("editor and history update boundaries", () => {
  it("keeps typing local, and a stream update changes only the subscribed row", () => {
    const store = createAppStore();
    const fixture = createConversationFixture("a", 1);
    const command = fixture[1]!, answer = fixture[2]!;
    store.dispatch(snapshotCommitted({ conversationId: "a", rows: fixture }));
    const commandCommits = vi.fn(), answerCommits = vi.fn();
    render(<Provider store={store}>
      <Composer conversationId="a" drafts={new Map()} />
      <Profiler id="command" onRender={commandCommits}><TimelineRow id={command.id} /></Profiler>
      <Profiler id="answer" onRender={answerCommits}><TimelineRow id={answer.id} /></Profiler>
    </Provider>);
    commandCommits.mockClear();
    answerCommits.mockClear();
    const stateBeforeTyping = store.getState();
    const input = screen.getByRole<HTMLTextAreaElement>("textbox", { name: "草稿" });
    input.focus();
    fireEvent.change(input, { target: { value: "输入中的草稿" } });
    input.setSelectionRange(3, 3);
    expect(store.getState()).toBe(stateBeforeTyping);
    expect(commandCommits).not.toHaveBeenCalled();
    expect(answerCommits).not.toHaveBeenCalled();
    act(() => store.dispatch(rowsCommitted({ conversationId: "a", rows: [{ ...answer, kind: "assistant", text: "streamed reply" }] })));
    expect(screen.getByText("streamed reply")).toBeTruthy();
    expect(commandCommits).not.toHaveBeenCalled();
    expect(answerCommits).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe("输入中的草稿");
    expect(input.selectionStart).toBe(3);
  });

  it("restores separate drafts when switching conversations", () => {
    const store = createAppStore();
    const viewport = { viewportHeight: 400, itemHeight: 40 };
    const show = (conversationId: string) => <Provider store={store}>
      <VirtuosoMockContext.Provider value={viewport}><Workbench conversationId={conversationId} header="test" /></VirtuosoMockContext.Provider>
    </Provider>;
    const view = render(show("a"));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "draft a" } });
    view.rerender(show("b"));
    expect(screen.getByRole<HTMLTextAreaElement>("textbox").value).toBe("");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "draft b" } });
    view.rerender(show("a"));
    expect(screen.getByRole<HTMLTextAreaElement>("textbox").value).toBe("draft a");
    view.rerender(show("b"));
    expect(screen.getByRole<HTMLTextAreaElement>("textbox").value).toBe("draft b");
  });
});

it("replaces Send with Stop only for an empty running editor and resets guide when the run ends", async () => {
  const store = createAppStore(), drafts = new Map<string, string>(), execute = vi.fn(async () => ({}));
  const controls = { conversationId: "running", activeRunId: "run", status: "running", queue: [], queueCount: 0, queueRevision: 0, questions: [], approvals: [], answered: [], settings: {}, goal: null };
  store.dispatch(controlsReceived(controls));
  const attachments = new Attachments({} as ReadClient), actions = { execute, drafts, attachments, conversationId: "running", selection: { conversationId: "running", agentInstanceId: "agent", projectId: "p" }, capabilities: { steer: true, interrupt: true } } as unknown as ActionPort;
  render(<Provider store={store}><ActionContext.Provider value={actions}><Composer conversationId="running" drafts={drafts} /></ActionContext.Provider></Provider>);
  expect(screen.getByRole("button", { name: "停止当前任务" })).toBeTruthy(); expect(screen.queryByRole("button", { name: "加入队列" })).toBeNull();
  const input = screen.getByRole("textbox", { name: "草稿" }); fireEvent.change(input, { target: { value: "follow up" } });
  expect(screen.queryByRole("button", { name: "停止当前任务" })).toBeNull(); expect(screen.getByRole("button", { name: "加入队列" })).toBeTruthy();
  fireEvent.click(screen.getByRole("radio", { name: "引导当前任务" }));
  expect(screen.getByRole("button", { name: "发送引导" })).toBeTruthy();
  act(() => store.dispatch(controlsReceived({ ...controls, status: "idle", activeRunId: null })));
  expect(screen.getByRole<HTMLInputElement>("radio", { name: "排队发送" }).getAttribute("aria-checked")).toBe("true");
  fireEvent.keyDown(input, { key: "Enter" });
  await vi.waitFor(() => expect(execute).toHaveBeenCalledWith({ type: "submit", text: "follow up" }));
  attachments.close();
});

it("preserves drafts and uploaded attachments after failure, then only clears the accepted submission", async () => {
  const upload = vi.fn().mockResolvedValue({ id: "opaque-file", name: "image.png", size: 4 });
  const attachments = new Attachments({ upload } as unknown as ReadClient), drafts = new Map<string, string>();
  const execute = vi.fn().mockRejectedValueOnce(new Error("delivery failed")).mockResolvedValue({});
  const actions = { execute, attachments, drafts, conversationId: "a", selection: { conversationId: "a", projectId: "p", agentInstanceId: "agent" }, capabilities: { attachments: true } } as unknown as ActionPort;
  attachments.add("a", [new File(["data"], "image.png", { type: "image/png" })]);
  render(<Provider store={createAppStore()}><ActionContext.Provider value={actions}><Composer conversationId="a" drafts={drafts} /></ActionContext.Provider></Provider>);
  const input = screen.getByRole<HTMLTextAreaElement>("textbox", { name: "草稿" }); fireEvent.change(input, { target: { value: "keep this draft" } });
  fireEvent.keyDown(input, { key: "Enter", ctrlKey: true, isComposing: true }); expect(execute).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "发送" })); await screen.findByText("delivery failed");
  expect(input.value).toBe("keep this draft"); expect(attachments.get("a")[0]?.uploaded?.id).toBe("opaque-file");
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "发送" })); });
  expect(execute).toHaveBeenLastCalledWith({ type: "submit", text: "keep this draft", attachments: ["opaque-file"] });
  expect(upload).toHaveBeenCalledTimes(1); expect(input.value).toBe(""); expect(attachments.get("a")).toEqual([]); attachments.close();
});
