// Keep unchanged buttons attached so a streamed update between pointerdown
// and pointerup cannot swallow their click or discard keyboard focus.
export function reconcileSidebarChildren(parent, nodes) {
  const retained = new Set(nodes);
  for (const child of [...parent.children]) if (!retained.has(child)) child.remove();
  let anchor = parent.firstChild;
  for (const node of nodes) {
    if (node === anchor) anchor = anchor.nextSibling;
    else parent.insertBefore(node, anchor);
  }
}
