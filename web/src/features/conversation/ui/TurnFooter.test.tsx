// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Provider } from "react-redux";
import type { SummaryRow } from "@lan/presentation";
import type { ReadClient } from "@lan/read-api";
import { createAppStore } from "../../../app/store";
import { ReadContext } from "../../../transport/ReadContext";
import { TurnFooter } from "./TurnFooter";

afterEach(cleanup);
const row: SummaryRow = { id: "summary", conversationId: "c", runId: "r", kind: "summary", status: "completed", startedAt: 1000, completedAt: 13000,
  timing: { totalMs: 12000, commandMs: 800, commandCount: 1, commandUnknownCount: 0, providerMs: 11200 },
  plan: { explanation: "保留原版", plan: [{ step: "完成项", status: "completed" }, { step: "进行项", status: "inProgress" }] }, recoveryDetailId: "recovery" };

it("shows original plan markers, provider timing and recovery text without an extra disclosure", async () => {
  const details = vi.fn(async () => ({ text: "retained command output", nextCursor: null }));
  const { container } = render(<Provider store={createAppStore()}><ReadContext.Provider value={{ providerName: "Codex", client: { details } as unknown as ReadClient, selection: { conversationId: "c", projectId: "p", agentInstanceId: "agent" } }}><TurnFooter row={row} /></ReadContext.Provider></Provider>);
  expect(await screen.findByText("retained command output")).toBeTruthy();
  expect(screen.getByText("Codex ≈")).toBeTruthy();
  expect(container.querySelector("li.completed .turn-plan-marker")?.getAttribute("aria-label")).toBe("已完成");
  expect(container.querySelector("li.inProgress .turn-plan-marker")?.getAttribute("aria-label")).toBe("进行中");
  expect(screen.queryByText("查看恢复副本")).toBeNull();
});

it("keeps the running elapsed time in the footer tools", () => {
  const { container } = render(<Provider store={createAppStore()}><TurnFooter row={{ ...row, status: "running", recoveryDetailId: undefined }} /></Provider>);
  expect(container.querySelector(".turn-footer-tools .turn-footer-elapsed")).toBeTruthy();
  expect(container.querySelector(".turn-footer-status .turn-footer-elapsed")).toBeNull();
});

it("shows no recovery section after verification returns empty content", async () => {
  const details = vi.fn(async () => ({ text: "", nextCursor: null }));
  const { container } = render(<Provider store={createAppStore()}><ReadContext.Provider value={{ client: { details } as unknown as ReadClient, selection: { conversationId: "c", projectId: "p", agentInstanceId: "agent" } }}><TurnFooter row={row} /></ReadContext.Provider></Provider>);
  await vi.waitFor(() => expect(details).toHaveBeenCalledTimes(1));
  expect(container.querySelector('.turn-footer-recovery')).toBeNull();
  expect(screen.queryByText(/原始位置未知|本地补充输出/)).toBeNull();
});
