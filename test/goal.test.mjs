import assert from "node:assert/strict";
import test from "node:test";

import { goalPresentation, goalShortcut, isActiveGoal } from "../public/goal.js";

test("parses Goal slash commands without stealing ordinary prompts", () => {
  assert.equal(goalShortcut("review /goal behavior"), null);
  assert.deepEqual(goalShortcut(" /goal "), { action: "show", objective: "" });
  assert.deepEqual(goalShortcut("/GOAL pause"), { action: "pause", objective: "" });
  assert.deepEqual(goalShortcut("/goal resume"), { action: "resume", objective: "" });
  assert.deepEqual(goalShortcut("/goal clear"), { action: "clear", objective: "" });
  assert.deepEqual(goalShortcut("/goal clear the compatibility failures"), {
    action: "set",
    objective: "clear the compatibility failures",
  });
  assert.deepEqual(goalShortcut("/goal\nship after npm run check passes"), {
    action: "set",
    objective: "ship after npm run check passes",
  });
});

test("presents every persisted Goal state with its available control", () => {
  assert.deepEqual(goalPresentation(null), {
    exists: false,
    status: null,
    label: "尚未设置目标",
    shortLabel: "目标",
    tone: "empty",
    control: null,
    objective: "",
  });
  assert.equal(goalPresentation({ objective: "Finish it", status: "active" }).control, "pause");
  assert.equal(goalPresentation({ objective: "Finish it", status: "paused" }).control, "resume");
  assert.equal(goalPresentation({ objective: "Finish it", status: "blocked" }).tone, "blocked");
  assert.equal(goalPresentation({ objective: "Finish it", status: "usageLimited" }).tone, "limited");
  assert.equal(goalPresentation({ objective: "Finish it", status: "budgetLimited" }).shortLabel, "预算用尽");
  assert.equal(goalPresentation({ objective: "Finish it", status: "complete" }).control, null);
  assert.equal(isActiveGoal({ status: "active" }), true);
  assert.equal(isActiveGoal({ status: "paused" }), false);
});
