import { readFile, realpath, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import { httpError } from "../../workspace-store.mjs";
import { canonicalFilePath } from "../../../shared/content-files.mjs";

export const visualizationPolicy = "default-src 'none'; script-src 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src data: blob: https:; font-src data: https:; connect-src https://cdn.jsdelivr.net; base-uri 'none'; form-action 'none'";
let stylesheet;
export async function readVisualization(value, { project, user }) {
  const path = await visualizationFilePath(value, { projectRoot: project.path, allowAnyLocalFile: user.role === "admin" });
  const details = await stat(path);
  if (!details.isFile()) throw httpError(400, "可视化路径不是文件。");
  if (details.size > 5 * 1024 * 1024) throw httpError(413, "可视化文件不能超过 5 MB。");
  stylesheet ||= readFile(new URL("./visualization.css", import.meta.url), "utf8");
  const [contents, css] = await Promise.all([readFile(path, "utf8"), stylesheet]);
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${visualizationPolicy}"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body>${contents}</body></html>`;
}

async function visualizationFilePath(value, { projectRoot = null, allowAnyLocalFile = false } = {}) {
  if (typeof value !== "string" || !value.trim() || !isAbsolute(value.trim())) throw httpError(400, "可视化路径无效。");
  const extension = extname(value.trim()).toLowerCase();
  if (extension !== ".html" && extension !== ".htm") throw httpError(400, "可视化文件必须是 HTML。");
  let temporaryRoot;
  let filePath;
  try {
    temporaryRoot = await realpath(tmpdir());
    filePath = await realpath(resolve(canonicalFilePath(value.trim())));
  } catch (error) {
    if (error.code === "ENOENT") throw httpError(404, "可视化文件不存在或已经清理。");
    throw error;
  }
  if (allowAnyLocalFile) return filePath;

  if (projectRoot) {
    const resolvedProjectRoot = await realpath(projectRoot);
    const projectRelativePath = relative(resolvedProjectRoot, filePath);
    if (projectRelativePath && projectRelativePath !== ".." && !projectRelativePath.startsWith(`..${sep}`) && !isAbsolute(projectRelativePath)) {
      return filePath;
    }
  }
  const relativePath = relative(temporaryRoot, filePath);
  const firstSegment = relativePath.split(sep)[0];
  if (!relativePath || relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath) || !/^codex-[^\\/]+$/i.test(firstSegment)) {
    throw httpError(403, "只能查看当前项目内或 Codex 临时目录中的可视化文件。");
  }
  return filePath;
}
