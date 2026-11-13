// A start notification records intent. Output or a terminal execution result
// establishes something recoverable; keep all other snapshots in storage only.
export function hasExecutionResult(snapshot) {
  return Boolean(snapshot && (snapshot.aggregatedOutput?.trim() ||
    ["completed", "failed", "declined", "interrupted"].includes(snapshot.status) &&
    (snapshot.command?.trim() || Number.isInteger(snapshot.exitCode))));
}

export function executionOutputCovered(canonical, saved, status) {
  if (typeof canonical !== "string" || typeof saved !== "string") return false;
  if (canonical.includes(saved)) return true;
  if (!["inProgress", "running"].includes(status)) return false;
  let offset = 0;
  return (saved.match(/[^\n]*\n|[^\n]+$/g) || []).every((line) => {
    const index = canonical.indexOf(line, offset);
    if (index < 0) return false;
    offset = index + line.length;
    return true;
  });
}
