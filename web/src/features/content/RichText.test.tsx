// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { RichText } from "./RichText";
afterEach(cleanup);
it("renders GFM and math through maintained parsers, while diagrams stay on demand", () => {
  const { container } = render(<RichText text={'| a | b |\n|---|---|\n| 1 | 2 |\n\n$x^2$\n\n```mermaid\nflowchart LR\nA-->B\n```'} />);
  expect(container.querySelector("table")).toBeTruthy(); expect(container.querySelector(".katex")).toBeTruthy();
  expect(screen.getByRole("button", { name: "查看流程图" })).toBeTruthy(); expect(container.querySelector("svg")).toBeNull();
});
it("bounds pathological markup and keeps streaming content out of the rich parser", () => {
  const { container, rerender } = render(<RichText text={"*x* ".repeat(1000)} />);
  expect(container.querySelectorAll("em").length).toBe(0); expect(container.textContent?.length).toBeLessThan(2200);
  rerender(<RichText text={"$x$ **draft**"} streaming />);
  expect(container.querySelector(".katex")).toBeNull(); expect(container.textContent).toContain("**draft**");
});
