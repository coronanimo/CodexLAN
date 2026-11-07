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

afterEach(cleanup);

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
