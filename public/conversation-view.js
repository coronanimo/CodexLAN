// Preserve focus and open details while applying the model's explicit order.
export function reconcileTimelineChildren(parent, nodes) {
  const retained = new Set(nodes);
  for (const child of [...parent.children]) if (!retained.has(child)) child.remove();
  let anchor = parent.firstChild;
  for (const node of nodes) {
    if (node === anchor) anchor = anchor.nextSibling;
    else parent.insertBefore(node, anchor);
  }
}
