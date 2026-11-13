// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { PreviewHost } from "./PreviewHost";
const selection = { conversationId: "c", projectId: "p", agentInstanceId: "a" };
beforeAll(() => { HTMLDialogElement.prototype.showModal = function () { this.open = true; }; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("requests a bounded remote preview and keeps the download action when it is too large", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(null, { status: 413 })); vi.stubGlobal("fetch", fetch);
  render(<PreviewHost selection={selection} preview={{ kind: "file", path: "large.log" }} onClose={() => {}} />);
  expect((await screen.findByRole("alert")).textContent).toContain("200 KB");
  expect(fetch.mock.calls[0]![0]).toContain("preview=true");
  expect(screen.getByRole("button", { name: "下载 ↓" })).toBeTruthy();
});
it("opens a Markdown document as formatted content with the original preview actions", async () => {
  const fetch = vi.fn(async () => new Response("# 报告\n\n**正文**")); vi.stubGlobal("fetch", fetch);
  render(<PreviewHost selection={selection} preview={{ kind: "file", path: "report.md" }} onClose={() => {}} />);
  expect(await screen.findByRole("heading", { name: "报告" })).toBeTruthy();
  expect(screen.getByText("正文").tagName).toBe("STRONG");
  expect(screen.getByRole("button", { name: "下载 ↓" })).toBeTruthy(); expect(screen.getByRole("button", { name: "复制内容" })).toBeTruthy();
  expect(document.querySelector("iframe")).toBeNull(); expect(fetch).toHaveBeenCalledTimes(1);
});
it("loads interactive HTML as a separate opaque document so the workbench CSP cannot disable its scripts", async () => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  render(<PreviewHost selection={selection} preview={{ kind: "visualization", path: "chart.html", title: "交互结果" }} onClose={() => {}} />);
  const frame = await screen.findByTitle("交互结果"); expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
  expect(frame.getAttribute("srcdoc")).toBeNull(); expect(frame.getAttribute("src")).toContain("/api/lan/conversations/c/visualization?"); expect(fetch).not.toHaveBeenCalled();
});
it("treats ordinary HTML file links as source code", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("<script>danger()</script>")));
  render(<PreviewHost selection={selection} preview={{ kind: "file", path: "source.html" }} onClose={() => {}} />);
  expect(await screen.findByText("<script>danger()</script>")).toBeTruthy(); expect(document.querySelector("iframe,script")).toBeNull();
});
it("reports image access failures within the original image window", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(null, { status: 403 })); vi.stubGlobal("fetch", fetch);
  render(<PreviewHost selection={selection} preview={{ kind: "file", path: "result.png", image: true }} onClose={() => {}} />);
  await screen.findByRole("alert");
  expect(screen.getByRole("alert").textContent).toContain("无权读取"); expect(fetch.mock.calls[0]![1]).toEqual(expect.objectContaining({ method: "HEAD" }));
  expect(screen.queryByRole("img")).toBeNull(); expect(document.querySelector("dialog")?.className).toContain("image-preview-dialog");
});
it("loads an authorized image with its download action", async () => {
  vi.stubGlobal("fetch", vi.fn<typeof globalThis.fetch>(async () => new Response()));
  render(<PreviewHost selection={selection} preview={{ kind: "file", path: "result.png", image: true }} onClose={() => {}} />);
  expect((await screen.findByRole("img")).getAttribute("src")).toContain("/api/projects/p/files/download?path=result.png");
  expect(screen.getByRole("button", { name: "下载 ↓" })).toBeTruthy();
});

it("previews an unsent image locally and releases its URL when the preview closes", async () => {
  const fetch = vi.fn(), createObjectURL = vi.fn(() => 'blob:local-image'), revokeObjectURL = vi.fn();
  vi.stubGlobal('fetch', fetch); vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL, revokeObjectURL }));
  const file = new File(['image'], '草稿截图.png', { type: 'image/png' });
  const { unmount } = render(<PreviewHost selection={selection} preview={{ kind: 'attachment', id: 'local', file }} onClose={() => {}} />);
  expect((await screen.findByRole('img')).getAttribute('src')).toBe('blob:local-image');
  expect(screen.getByRole('link', { name: '下载 ↓' }).getAttribute('download')).toBe(file.name);
  expect(createObjectURL).toHaveBeenCalledWith(file); expect(fetch).not.toHaveBeenCalled();
  unmount(); expect(revokeObjectURL).toHaveBeenCalledWith('blob:local-image');
});

it("reads unsent Markdown from the selected File rather than a server path", async () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL: () => 'blob:local-text', revokeObjectURL: vi.fn() }));
  const file = new File(['# 临时报告\n\n**本地正文**'], 'report.md', { type: 'text/markdown' });
  render(<PreviewHost selection={selection} preview={{ kind: 'attachment', id: 'local-text', file }} onClose={() => {}} />);
  expect(await screen.findByRole('heading', { name: '临时报告' })).toBeTruthy();
  expect(screen.getByText('本地正文').tagName).toBe('STRONG'); expect(fetch).not.toHaveBeenCalled();
});
