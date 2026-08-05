export function fileChangeUpdateItem(current, params = {}) {
  return {
    ...(current || {}),
    id: params.itemId,
    type: "fileChange",
    changes: Array.isArray(params.changes) ? params.changes : [],
    status: "inProgress",
    startedAt: current?.startedAt || Date.now(),
  };
}

export function terminalExecutionStatus(status) {
  const value = String(status || "").toLowerCase();
  if (["failed", "error", "declined"].includes(value)) return "failed";
  if (["interrupted", "cancelled"].includes(value)) return "interrupted";
  return "completed";
}

export function mergeHistoricalExecutionItem(item, metric, turnStatus) {
  const merged = { ...item, ...(metric || {}) };
  if (!isActiveStatus(turnStatus) && isActiveStatus(merged.status)) {
    merged.status = terminalExecutionStatus(item?.status);
  }
  return merged;
}

export function reconcileStaleExecutionTurn(turn, runtime) {
  if (!turn) return turn;
  const runtimeMatchesTurn = isActiveStatus(runtime?.status) && runtime?.activeTurnId === turn.id;
  if (runtimeMatchesTurn) return isActiveStatus(turn.status) ? turn : { ...turn, status: "inProgress" };
  if (!isActiveStatus(turn.status)) return turn;
  return {
    ...turn,
    status: "interrupted",
    items: (turn.items || []).map((item) => isActiveStatus(item?.status)
      ? { ...item, status: "interrupted" }
      : item),
  };
}

function isActiveStatus(status) {
  return ["active", "running", "inprogress", "started", "pending"].includes(String(status || "").toLowerCase());
}
