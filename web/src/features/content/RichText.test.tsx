// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { RichText } from "./RichText";
afterEach(cleanup);
it("renders GFM and math while unobserved diagrams do not load a renderer", () => {
  const { container } = render(<RichText text={'| a | b |\n|---|---|\n| 1 | 2 |\n\n$x^2$\n\n```mermaid\nflowchart LR\nA-->B\n```'} />);
  expect(container.querySelector("table")).toBeTruthy(); expect(container.querySelector(".katex")).toBeTruthy();
  expect(screen.getByRole("button", { name: "放大流程图" })).toBeTruthy(); expect(container.querySelector("svg")).toBeNull();
});
it("bounds pathological markup and preserves formatted Markdown while streaming", () => {
  const { container, rerender } = render(<RichText text={"*x* ".repeat(1000)} />);
  expect(container.querySelectorAll("em").length).toBe(0); expect(container.textContent).toContain("*x* ".repeat(1000));
  rerender(<RichText text={"$x$ **draft**"} streaming />);
  expect(container.querySelector(".katex")).toBeTruthy(); expect(container.querySelector("strong")?.textContent).toBe("draft");
});
