// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ReadClient } from "@lan/read-api";
import { ReadContext } from "../../transport/ReadContext";
import { DetailDisclosure } from "./DetailDisclosure";

afterEach(cleanup);

it("loads output only after expansion and replaces chunks instead of accumulating full output", async () => {
  const details = vi.fn().mockResolvedValueOnce({ text: "first chunk", nextOffset: 16000 }).mockResolvedValueOnce({ text: "last chunk", nextOffset: null });
  const client = { details } as unknown as ReadClient;
  render(<ReadContext.Provider value={{ client, selection: { conversationId: "a", agentInstanceId: "agent", projectId: "project" } }}>
    <DetailDisclosure detailId="opaque-reference" />
  </ReadContext.Provider>);
  expect(details).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "查看输出" }));
  expect(await screen.findByText("first chunk")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "下一段" }));
  expect(await screen.findByText("last chunk")).toBeTruthy();
  expect(screen.queryByText("first chunk")).toBeNull();
  expect(details).toHaveBeenLastCalledWith(expect.anything(), "opaque-reference", 16000, expect.any(AbortSignal));
});
