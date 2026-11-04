import assert from "node:assert/strict";
import test from "node:test";
import { reconcileSidebarChildren } from "../public/sidebar-list.js";

test("sidebar updates keep unchanged click targets attached and reconcile additions/removals", () => {
  const operations = [];
  const parent = {
    children: [],
    get firstChild() { return this.children[0] || null; },
    insertBefore(node, anchor) {
      operations.push(`move ${node.id}`);
      const previous = this.children.indexOf(node);
      if (previous >= 0) this.children.splice(previous, 1);
      this.children.splice(anchor ? this.children.indexOf(anchor) : this.children.length, 0, node);
    },
  };
  const node = (id) => ({ id,
    get nextSibling() { return parent.children[parent.children.indexOf(this) + 1] || null; },
    remove() { operations.push(`remove ${id}`); parent.children.splice(parent.children.indexOf(this), 1); },
  });
  const a = node("a"), b = node("b"), c = node("c");
  parent.children = [a, b];
  reconcileSidebarChildren(parent, [a, b]);
  assert.deepEqual(operations, []);
  reconcileSidebarChildren(parent, [a, b, c]);
  assert.deepEqual(operations, ["move c"]);
  operations.length = 0;
  reconcileSidebarChildren(parent, [a, c]);
  assert.deepEqual(operations, ["remove b"]);
  reconcileSidebarChildren(parent, [c, a]);
  assert.deepEqual(parent.children, [c, a]);
});
