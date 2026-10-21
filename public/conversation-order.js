// Updating a streamed message or question must not move it past later events.
export function renderInTimelinePosition(previousRoot, render) {
  const parent = previousRoot?.parentNode;
  const next = previousRoot?.nextSibling;
  const message = render();
  if (!parent || parent.isConnected === false || !message?.root) return message;
  const anchor = next?.parentNode === parent ? next : null;
  if (message.root.parentNode !== parent || message.root.nextSibling !== anchor) {
    parent.insertBefore(message.root, anchor);
  }
  return message;
}

// A turn may receive replies/questions before its first execution item.
// Move those existing nodes into the execution group in their original order.
export function moveExistingTurnContentIntoExecutionGroup(group, conversation) {
  if (!group?.turnId || !group.list) return;
  const roots = [...conversation.children].filter((root) => (
    root.dataset?.turnId === group.turnId
      && root.parentNode === conversation
      && (root.classList.contains("message") || root.classList.contains("progress-message") || root.classList.contains("user-input-card"))
      && !root.classList.contains("user")
  ));
  for (const root of roots) group.list.append(root);
}
