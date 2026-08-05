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
