import assert from "node:assert/strict";
import test from "node:test";
import { reconcileOrder } from "../public/conversation-order.js";
import { reconcileTimelineChildren } from "../public/conversation-view.js";

class Node {
  constructor(id) { this.id = id; this.children = []; this.parentNode = null; this.moves = 0; }
  get firstChild() { return this.children[0] || null; }
  get nextSibling() { return this.parentNode?.children[this.parentNode.children.indexOf(this) + 1] || null; }
  remove() {
    if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1);
    this.parentNode = null;
  }
  insertBefore(node, anchor) {
    if (node === anchor) return;
    node.remove();
    const index = anchor ? this.children.indexOf(anchor) : this.children.length;
    assert.ok(index >= 0);
    this.children.splice(index, 0, node);
    node.parentNode = this;
    node.moves++;
  }
}

test("canonical order corrects earlier receipt order without type or timestamps", () => {
  assert.deepEqual(reconcileOrder(["b", "a"], ["a", "b"]), ["a", "b"]);
  assert.deepEqual(reconcileOrder(["t1", "t3"], ["t1", "t2", "t3"]), ["t1", "t2", "t3"]);
  assert.deepEqual(reconcileOrder(["u", "pending", "final"], ["u", "command", "final"]), ["u", "command", "pending", "final"]);
});

test("unchanged ordered nodes stay attached, preserving focus and open details", () => {
  const parent = new Node("timeline");
  const nodes = [new Node("reply"), new Node("question"), new Node("command")];
  reconcileTimelineChildren(parent, nodes);
  nodes[1].value = "typed answer";
  nodes[2].open = true;
  const moves = nodes.map((node) => node.moves);
  reconcileTimelineChildren(parent, nodes);
  assert.deepEqual(nodes.map((node) => node.moves), moves);
  assert.equal(nodes[1].value, "typed answer");
  assert.equal(nodes[2].open, true);
});

test("render follows the supplied model order and removes obsolete identities", () => {
  const parent = new Node("timeline");
  const a = new Node("a"), b = new Node("b"), c = new Node("c");
  reconcileTimelineChildren(parent, [b, a]);
  reconcileTimelineChildren(parent, [a, c, b]);
  assert.deepEqual(parent.children.map((node) => node.id), ["a", "c", "b"]);
  reconcileTimelineChildren(parent, [c]);
  assert.equal(a.parentNode, null);
  assert.equal(b.parentNode, null);
});
