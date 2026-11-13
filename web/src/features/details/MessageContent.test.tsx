// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ReadClient } from "@lan/read-api";
import { ReadContext } from "../../transport/ReadContext";
import { MessageContent } from "./MessageContent";
afterEach(cleanup);
it("shows a complete long reply without an extra output click and retains it across virtual remounts", async () => {
  const details = vi.fn(async (_selection, _ref, cursor) => ({ text: cursor ? "final paragraph" : "first paragraph\n\n", nextCursor: cursor ? null : "next", files: [{ name: "complete-report.md", path: "complete-report.md", image: false }] }));
  const source = { client: { details } as unknown as ReadClient, selection: { conversationId: "c", projectId: "p", agentInstanceId: "a" }, details: new Map() };
  const content = <ReadContext.Provider value={source}><MessageContent rich text="summary only" detailId="reply" truncated revision={1} /></ReadContext.Provider>;
  const first = render(content); await screen.findByText("final paragraph"); expect(details).toHaveBeenCalledTimes(2);
  expect(screen.getByText("complete-report.md", { selector: "strong" })).toBeTruthy();
  first.unmount(); render(content); expect(screen.getByText("final paragraph")).toBeTruthy(); expect(details).toHaveBeenCalledTimes(2);
});
