// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { FileCards } from "./FileCards";
import { PreviewContext } from "./PreviewContext";
import { ReadContext } from "../../transport/ReadContext";
import type { ReadClient } from "@lan/read-api";

afterEach(cleanup);
it("shows two image thumbnails, opens the selected original, and keeps documents as file cards", () => {
  const preview = vi.fn();
  render(<ReadContext.Provider value={{ client: {} as ReadClient, selection: { conversationId: "c", projectId: "p", agentInstanceId: "a" } }}><PreviewContext.Provider value={preview}><FileCards files={[
    { path: "C:/uploads/one.png", name: "one.png", image: true },
    { path: "C:/uploads/two.png", name: "two.png", image: true },
    { path: "report.md", name: "report.md", image: false },
  ]} /></PreviewContext.Provider></ReadContext.Provider>);
  expect(screen.getAllByRole("img")).toHaveLength(2);
  expect(screen.getByRole("img", { name: "one.png" }).getAttribute("src")).toContain("path=C%3A%2Fuploads%2Fone.png");
  fireEvent.click(screen.getByRole("button", { name: "预览 two.png" }));
  expect(preview).toHaveBeenCalledWith({ kind: "file", path: "C:/uploads/two.png", image: true });
  expect(screen.getByRole("button", { name: "下载 report.md" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "下载 one.png" })).toBeNull();
  fireEvent.error(screen.getByRole("img", { name: "one.png" }));
  expect(screen.getByText("图片无法载入，点击重试预览")).toBeTruthy();
});
