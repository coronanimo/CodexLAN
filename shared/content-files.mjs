// Generic file presentation preserved from the original client.
const MARKDOWN_EXTENSIONS = new Set(["md", "markdown", "mdown", "mkd", "mdx"]);
const JSON_EXTENSIONS = new Set(["json", "jsonc", "jsonl", "ndjson", "ipynb"]);
const WRAPPED_TEXT_EXTENSIONS = new Set(["txt", "text", "log", "out", "rst", "tex"]);
const SOURCE_EXTENSIONS = new Set([
  "asm", "astro", "bash", "bat", "c", "cc", "cfg", "cjs", "clj", "cljs", "cmake", "cmd", "coffee", "conf", "cpp", "cs", "csproj", "css", "cts", "cxx",
  "dart", "diff", "dockerignore", "editorconfig", "env", "eslintrc", "ex", "exs", "fish", "fs", "fsproj", "fsx", "gitattributes", "gitignore", "gitmodules", "go", "gradle", "graphql", "graphqls", "groovy", "h", "hpp", "hs", "htm", "html", "http", "hxx",
  "ini", "java", "jl", "js", "json5", "jsx", "kt", "kts", "less", "lock", "lua", "m", "mak", "map", "mjs", "mm", "mts", "nim", "npmrc", "nvmrc", "patch", "php", "pl", "plist", "pm", "prettierrc", "properties", "props", "proto", "ps1", "psd1", "psm1",
  "py", "pyi", "pyw", "r", "rb", "rs", "sass", "scala", "scss", "sh", "sln", "sol", "sql", "stylelintrc", "svg", "svelte", "swift", "targets", "toml", "ts", "tsx", "tsv", "vb", "vbs", "vcxproj", "vue", "xml", "yaml", "yarnrc", "yml", "zig", "zsh", "csv",
]);
const SOURCE_FILE_NAMES = new Set([
  "codeowners", "cmakelists.txt", "dockerfile", "gemfile", "gradlew", "justfile", "license", "makefile", "mvnw", "pipfile", "procfile", "rakefile", "vagrantfile",
]);

export function textPreviewKind(fileName) {
  const name = String(fileName || "").trim().toLowerCase();
  if (SOURCE_FILE_NAMES.has(name) || name.startsWith(".env.")) return "code";
  const extension = name.includes(".") ? name.split(".").pop() : "";
  if (MARKDOWN_EXTENSIONS.has(extension)) return "markdown";
  if (JSON_EXTENSIONS.has(extension)) return "json";
  if (WRAPPED_TEXT_EXTENSIONS.has(extension)) return "text";
  if (SOURCE_EXTENSIONS.has(extension)) return "code";
  return null;
}

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

export function localFileDownloadUrl({ projects, projectId, role, path, name }) {
  path = canonicalFilePath(path);
  const project = projectForLocalFile(projects, path);
  // Relative references belong to the conversation's project, including for
  // administrators. The admin endpoint only accepts absolute paths.
  const absolute = /^(?:\/?[a-z]:[\\/]|file:\/\/\/|[\\/]{2})/i.test(String(path || ""));
  const endpoint = project ? `/api/projects/${encodeURIComponent(project.id)}/files/download`
    : absolute && role === "admin" ? "/api/admin/files/download"
      : `/api/projects/${encodeURIComponent(projectId)}/files/download`;
  return `${endpoint}?path=${encodeURIComponent(path)}&name=${encodeURIComponent(name || "download")}`;
}

export function localFileTarget(target) {
  let value = String(target || "").trim();
  try {
    value = decodeURIComponent(value);
  } catch {
    return null;
  }
  if (/^file:\/\/\/[a-z]:\//i.test(value)) value = value.slice(8);
  value = canonicalFilePath(value);
  if (/^\/[a-z]:[\\/]/i.test(value)) value = value.slice(1);
  if (/^[a-z]:[\\/]/i.test(value)) value = value.replace(/:\d+(?::\d+)?$/, "");
  if (/^[a-z]:[\\/][^\r\n]+$/i.test(value)) return value;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith("/") || /[?#]/.test(value)) return null;
  if (/^(?:\.\.?[\\/])?[^<>:"|?*\r\n]+(?:[\\/][^<>:"|?*\r\n]+)+$/.test(value)) return value;
  if (/^[^<>:"|?*\\/\r\n]+\.[a-z0-9]{1,12}$/i.test(value)) return value;
  return null;
}

export function fileNameFromPath(path) {
  return String(path).split(/[\\/]/).filter(Boolean).pop() || "下载文件";
}

function normalizedWindowsPath(value) {
  const path = String(value || "").trim().replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  return /^[a-z]:\//.test(path) ? path : null;
}

// Saved conversations can still contain paths from a former installation.
export function canonicalFilePath(value) {
  return String(value || "").replace(/([\\/])\.codexlan-[^\\/]+(?=[\\/](?:projects|attachments)[\\/])/gi, "$1.codexlan");
}

