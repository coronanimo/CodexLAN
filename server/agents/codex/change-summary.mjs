// Only counts and resource references cross the presentation boundary.
export function changeStats(changes = []) {
  let added = 0, removed = 0;
  for (const change of changes) {
    if (!change.diff && change.stats) { added += change.stats.added; removed += change.stats.removed; continue; }
    const diff = String(change.diff || ""), kind = typeof change.kind === "string" ? change.kind : change.kind?.type;
    if ((kind === "add" || kind === "delete") && !/^@@ /m.test(diff)) {
      const count = diff ? diff.replace(/\n$/, "").split("\n").length : 0;
      if (kind === "add") added += count; else removed += count;
    } else for (const line of diff.split("\n")) {
      if (line.startsWith("+") && !line.startsWith("+++ ")) added++;
      if (line.startsWith("-") && !line.startsWith("--- ")) removed++;
    }
  }
  return { files: new Set(changes.map((change) => change.path).filter(Boolean)).size, added, removed };
}

export function turnChangeStats(turn) {
  if (turn.presentationStats) return { ...turn.presentationStats };
  const byPath = new Map();
  for (const item of Array.isArray(turn.items) ? turn.items : []) if (item.type === "fileChange") for (const change of item.changes || []) byPath.set(change.path, change);
  return changeStats([...byPath.values()]);
}
