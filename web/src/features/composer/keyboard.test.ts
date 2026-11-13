import { expect, it } from "vitest";
import { submitsMessage } from "./keyboard";
const desktop = { userAgent: "Windows Chrome" } as Navigator, mobile = { userAgent: "Android Mobile" } as Navigator;
const enter = { key: "Enter", shiftKey: false, ctrlKey: false, metaKey: false };
it("retains desktop Enter/modified-Enter preferences and mobile newline behavior", () => {
  expect(submitsMessage(enter, "enter", false, desktop)).toBe(true);
  expect(submitsMessage({ ...enter, ctrlKey: true }, "enter", false, desktop)).toBe(false);
  expect(submitsMessage(enter, "ctrl-enter", false, desktop)).toBe(false);
  expect(submitsMessage({ ...enter, metaKey: true }, "ctrl-enter", false, desktop)).toBe(true);
  expect(submitsMessage(enter, "enter", false, mobile)).toBe(false);
  expect(submitsMessage({ ...enter, ctrlKey: true }, "ctrl-enter", false, mobile)).toBe(false);
});
it("does not send IME confirmation or Shift+Enter as a task", () => {
  expect(submitsMessage(enter, "enter", true, desktop)).toBe(false);
  expect(submitsMessage({ ...enter, isComposing: true }, "enter", false, desktop)).toBe(false);
  expect(submitsMessage({ ...enter, keyCode: 229 }, "enter", false, desktop)).toBe(false);
  expect(submitsMessage({ ...enter, shiftKey: true }, "enter", false, desktop)).toBe(false);
});
