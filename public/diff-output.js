export function diffLineKind(line, changeType = "update") {
  if (changeType === "add") return "added";
  if (changeType === "delete") return "removed";
  if (line.startsWith("@@")) return "hunk";
  if (line.startsWith("+++ ") || line.startsWith("--- ")) return "header";
  if (line.startsWith("+")) return "added";
  if (line.startsWith("-")) return "removed";
  return "context";
}

export function diffLineStats(changes) {
  let added = 0;
  let removed = 0;
  for (const change of changes || []) {
    const contents = String(change.diff || "");
    const changeType = fileChangeType(change);
    if (changeType === "add") {
      added += textLineCount(contents);
      continue;
    }
    if (changeType === "delete") {
      removed += textLineCount(contents);
      continue;
    }
    for (const line of contents.split("\n")) {
      const kind = diffLineKind(line);
      if (kind === "added") added += 1;
      else if (kind === "removed") removed += 1;
    }
  }
  return { added, removed };
}

export function fileChangeType(change) {
  return typeof change?.kind === "string" ? change.kind : change?.kind?.type || "update";
}

export function textLineCount(contents) {
  if (!contents) return 0;
  const lines = String(contents).split(/\r?\n/);
  return lines.length - (lines.at(-1) === "" ? 1 : 0);
}

export function unifiedDiffChanges(value) {
  const changes = [];
  let current = null;
  const finish = () => {
    if (!current) return;
    current.diff = current.lines.join("\n");
    delete current.lines;
    if (current.path || current.diff) changes.push(current);
    current = null;
  };
  for (const line of String(value || "").split("\n")) {
    const boundary = /^diff --git a\/(.+) b\/(.+)$/.exec(line);
    if (boundary) {
      finish();
      current = { path: boundary[2], kind: "update", lines: [line] };
      continue;
    }
    if (!current) continue;
    current.lines.push(line);
    if (line === "new file mode 100644" || line === "--- /dev/null") current.kind = "add";
    if (line === "deleted file mode 100644" || line === "+++ /dev/null") current.kind = "delete";
    const addedPath = /^\+\+\+ b\/(.+)$/.exec(line);
    if (addedPath && current.kind !== "delete") current.path = addedPath[1];
    const removedPath = /^--- a\/(.+)$/.exec(line);
    if (removedPath && current.kind === "delete") current.path = removedPath[1];
  }
  finish();
  return changes;
}

export function renderFileChanges(element, changes) {
  element.replaceChildren();
  for (const change of changes || []) {
    const changeType = fileChangeType(change);
    const file = document.createElement("section");
    file.className = "diff-file";
    const path = document.createElement("div");
    path.className = "diff-path";
    path.textContent = change.path || "未命名文件";
    file.append(path);
    const diff = document.createElement("div");
    diff.className = "diff-lines";
    const lines = String(change.diff || "").split("\n");
    for (const line of lines) {
      const row = document.createElement("span");
      row.className = `diff-line ${diffLineKind(line, changeType)}`;
      row.textContent = line || " ";
      diff.append(row);
    }
    file.append(diff);
    element.append(file);
  }
}
