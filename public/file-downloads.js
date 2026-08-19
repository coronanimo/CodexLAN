export function downloadableFiles(value) {
  const files = [];
  const visualizations = [];
  const seen = new Set();
  const collect = (target, label) => {
    const path = localFileTarget(target);
    if (!path) return null;
    const key = path.replace(/\\/g, "/").toLowerCase();
    const name = fileNameFromPath(path);
    const file = { path, name, label: String(label || "").trim() || name };
    if (!seen.has(key)) {
      seen.add(key);
      files.push(file);
    }
    return file;
  };
  let text = String(value || "");
  text = text.replace(/visualize([^\r\n]+)/g, (match, descriptor) => {
    const visualization = visualizationDescriptor(descriptor);
    if (!visualization) return match;
    visualizations.push(visualization);
    return "";
  });
  text = text.replace(/:codex-file-citation\{([^}\r\n]*)\}/g, (match, attributes) => {
    const path = directiveAttribute(attributes, "path");
    const label = directiveAttribute(attributes, "label") || directiveAttribute(attributes, "name");
    return collect(path, label) ? "" : match;
  });
  text = text.replace(/\[([^\]\r\n]{1,160})\]\(\s*<?([^\)\r\n]+?)>?\s*\)/g, (match, label, target) => collect(target, label) ? label : match);
  text = text.replace(/<((?:file:\/\/\/|\/?[a-z]:[\\/])[^>\r\n]+)>/gi, (match, target) => collect(target, "")?.name || match);
  return { text: text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim(), files, visualizations };
}

function visualizationDescriptor(value) {
  let descriptor;
  try {
    descriptor = JSON.parse(value);
  } catch {
    descriptor = Object.fromEntries([...String(value).matchAll(/"(path|title|mode)"\s*:\s*"((?:\\.|[^"\\])*)"/g)]
      .map((match) => [match[1], decodedDirectiveString(match[2])]));
  }
  const path = localFileTarget(descriptor?.path);
  if (!path || !/\.html?$/i.test(path)) return null;
  return {
    path,
    name: fileNameFromPath(path),
    title: String(descriptor.title || "交互图表").trim() || "交互图表",
    mode: descriptor.mode === "wide" ? "wide" : "standard",
  };
}

function decodedDirectiveString(value) {
  try {
    return JSON.parse(`"${value}"`);
  } catch {
    return String(value).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
}

function directiveAttribute(attributes, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:^|\\s)${escapedName}\\s*=\\s*(?:"([^"\\r\\n]*)"|'([^'\\r\\n]*)')`).exec(attributes);
  return match?.[1] ?? match?.[2] ?? "";
}

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

function localFileTarget(target) {
  let value = String(target || "").trim();
  try {
    value = decodeURIComponent(value);
  } catch {
    return null;
  }
  if (/^file:\/\/\/[a-z]:\//i.test(value)) value = value.slice(8);
  if (/^\/[a-z]:[\\/]/i.test(value)) value = value.slice(1);
  if (/^[a-z]:[\\/]/i.test(value)) value = value.replace(/:\d+(?::\d+)?$/, "");
  if (/^[a-z]:[\\/][^\r\n]+$/i.test(value)) return value;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith("/") || /[?#]/.test(value)) return null;
  if (/^(?:\.\.?[\\/])?[^<>:"|?*\r\n]+(?:[\\/][^<>:"|?*\r\n]+)+$/.test(value)) return value;
  if (/^[^<>:"|?*\\/\r\n]+\.[a-z0-9]{1,12}$/i.test(value)) return value;
  return null;
}

function fileNameFromPath(path) {
  return String(path).split(/[\\/]/).filter(Boolean).pop() || "下载文件";
}

function normalizedWindowsPath(value) {
  const path = String(value || "").trim().replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  return /^[a-z]:\//.test(path) ? path : null;
}
