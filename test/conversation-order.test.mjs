import assert from "node:assert/strict";
import test from "node:test";
import { moveExistingTurnContentIntoExecutionGroup, renderInTimelinePosition } from "../public/conversation-order.js";

class TimelineNode {
  constructor(name, classes = [], turnId = null) {
    this.name = name;
    this.children = [];
    this.parentNode = null;
    this.dataset = turnId ? { turnId } : {};
    this.classList = { contains: (value) => classes.includes(value) };
    this.isConnected = true;
  }

  get nextSibling() {
    if (!this.parentNode) return null;
    return this.parentNode.children[this.parentNode.children.indexOf(this) + 1] || null;
  }

  remove() {
    if (!this.parentNode) return;
    const siblings = this.parentNode.children;
    siblings.splice(siblings.indexOf(this), 1);
    this.parentNode = null;
  }

  append(...nodes) {
    for (const node of nodes) this.insertBefore(node, null);
  }

  insertBefore(node, anchor) {
    if (node === anchor) return;
    node.remove();
    const index = anchor ? this.children.indexOf(anchor) : this.children.length;
    assert.ok(index >= 0, "the insertion anchor must belong to this parent");
    this.children.splice(index, 0, node);
    node.parentNode = this;
  }
}

const names = (parent) => parent.children.map((node) => node.name);

test("completing a streamed reply preserves its position before asynchronous questions and later commands", () => {
  const list = new TimelineNode("execution-list");
  const streaming = new TimelineNode("streaming-reply");
  list.append(new TimelineNode("command-before"), streaming, new TimelineNode("async-question"), new TimelineNode("command-after"));

  const completed = renderInTimelinePosition(streaming, () => {
    streaming.remove();
    const root = new TimelineNode("completed-reply");
    list.append(root);
    return { root };
  });

  assert.equal(completed.root.parentNode, list);
  assert.deepEqual(names(list), ["command-before", "completed-reply", "async-question", "command-after"]);
});

test("updating an existing question card restores its original position even if the renderer reattaches it", () => {
  const conversation = new TimelineNode("conversation");
  const list = new TimelineNode("execution-list");
  const question = new TimelineNode("async-question");
  list.append(new TimelineNode("reply-before"), question, new TimelineNode("command-after"), new TimelineNode("reply-after"));

  renderInTimelinePosition(question, () => {
    conversation.append(question);
    return { root: question };
  });

  assert.deepEqual(names(list), ["reply-before", "async-question", "command-after", "reply-after"]);
  assert.deepEqual(names(conversation), []);
  renderInTimelinePosition(question, () => ({ root: question }));
  assert.deepEqual(names(list), ["reply-before", "async-question", "command-after", "reply-after"]);
});

test("new messages append naturally and existing last messages can be replaced in place", () => {
  const list = new TimelineNode("execution-list");
  list.append(new TimelineNode("async-question"));
  const message = renderInTimelinePosition(null, () => {
    const root = new TimelineNode("reply");
    list.append(root);
    return { root };
  });
  assert.deepEqual(names(list), ["async-question", "reply"]);

  renderInTimelinePosition(message.root, () => {
    message.root.remove();
    const root = new TimelineNode("completed-reply");
    list.append(root);
    return { root };
  });
  assert.deepEqual(names(list), ["async-question", "completed-reply"]);
});

test("history refresh never moves a reused card back into the detached old timeline", () => {
  const oldList = new TimelineNode("old-list");
  oldList.isConnected = false;
  const question = new TimelineNode("async-question");
  oldList.append(question, new TimelineNode("old-command"));
  const refreshedList = new TimelineNode("refreshed-list");

  renderInTimelinePosition(question, () => {
    refreshedList.append(question);
    return { root: question };
  });

  assert.equal(question.parentNode, refreshedList);
  assert.deepEqual(names(refreshedList), ["async-question"]);
  assert.deepEqual(names(oldList), ["old-command"]);
});

test("the first execution group keeps earlier replies and question cards together in chronological order", () => {
  const conversation = new TimelineNode("conversation");
  const group = { turnId: "turn", list: new TimelineNode("execution-list") };
  conversation.append(
    new TimelineNode("user", ["message", "user"], "turn"),
    new TimelineNode("reply", ["message", "assistant"], "turn"),
    new TimelineNode("async-question", ["user-input-card", "async-question-card"], "turn"),
    new TimelineNode("progress", ["progress-message"], "turn"),
    new TimelineNode("other-turn", ["message", "assistant"], "other"),
    new TimelineNode("execution-group"),
  );

  moveExistingTurnContentIntoExecutionGroup(group, conversation);
  group.list.append(new TimelineNode("first-command"));

  assert.deepEqual(names(group.list), ["reply", "async-question", "progress", "first-command"]);
  assert.deepEqual(names(conversation), ["user", "other-turn", "execution-group"]);
});
