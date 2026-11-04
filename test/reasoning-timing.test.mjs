import assert from "node:assert/strict";
import test from "node:test";
import { reconcileStaleExecutionTurn } from "../public/execution-events.js";
import { reduceConversationEvent } from "../public/conversation-state.js";
import { elapsedTiming } from "../public/elapsed-time.js";

const start = 1_780_000_000_000;
const reasoning = { id: "r1", type: "reasoning", status: "inProgress", startedAt: start };
const guide = { id: "guide", type: "userMessage", inputKind: "guide", startedAt: start + 2000 };

test("guidance and successor activity cannot end reasoning or background tools", () => {
  const command = { id: "cmd", type: "commandExecution", status: "inProgress", startedAt: start - 1000 };
  const next = { ...reasoning, id: "r2", startedAt: start + 3000 };
  const turn = { id: "turn", status: "inProgress", items: [command, reasoning, guide, next] };
  const view = reconcileStaleExecutionTurn(turn, { status: "running", activeTurnId: "turn" });
  assert.equal(view.status, "inProgress");
  assert.equal(view.items[0], command);
  assert.equal(view.items[1].completedAt, undefined);
  assert.equal(view.items[1].status, "inProgress");
  assert.equal(elapsedTiming(view.items[1]).final, false);
  assert.equal(elapsedTiming(view.items[3]).final, false);
  assert.equal(turn.items[1], reasoning, "display timing must not mutate source facts");
});

test("only the matching lifecycle completion stops an item's timer", () => {
  const command = { id: "cmd", type: "commandExecution", status: "inProgress", startedAt: start };
  const turns = [{ id: "turn", status: "inProgress", items: [reasoning, command, guide] }];
  const next = reduceConversationEvent(turns, { method: "item/completed", params: { turnId: "turn", item: { id: "r1", type: "reasoning" }, completedAtMs: start + 2500 } }, 1);
  assert.equal(next[0].items[0].completedAt, start + 2500);
  assert.equal(elapsedTiming(next[0].items[0]).final, true);
  assert.equal(elapsedTiming(next[0].items[1]).final, false);
});
