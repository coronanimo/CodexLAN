export function projectForLocalFile(projects, filePath) {
  const target = normalizedWindowsPath(filePath);
  if (!target) return null;
  return [...(projects || [])]
    .filter((project) => {
      const root = normalizedWindowsPath(project?.path);
      return root && (target === root || target.startsWith(`${root}/`));
    })
    .sort((left, right) => normalizedWindowsPath(right.path).length - normalizedWindowsPath(left.path).length)[0] || null;
}

function normalizedWindowsPath(value) {
  const path = String(value || "").trim().replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  return /^[a-z]:\//.test(path) ? path : null;
}
