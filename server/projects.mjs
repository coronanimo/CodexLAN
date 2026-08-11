import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, statSync } from "node:fs";
import { link, mkdir, realpath, unlink, writeFile } from "node:fs/promises";
import { basename, extname, isAbsolute, join, relative, resolve } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { requireAdmin } from "./accounts.mjs";
import { json, readJson, validateId } from "./http.mjs";
import { httpError, mergeSettings, samePath } from "./workspace-store.mjs";

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;

export function registerProjects(application, { store, conversations }) {
  application.get("/api/projects", async (request, response) => {
    json(response, 200, { projects: await store.listProjects(request.identity.user.id) });
  });

  application.post("/api/projects", async (request, response) => {
    const project = await store.createProject(await readJson(request), request.identity.user.id);
    json(response, 201, { project });
  });

  application.get("/api/projects/:projectId/files/download", async (request, response) => {
    const project = await store.getProject(request.params.projectId, request.identity.user.id);
    await sendProjectFile(response, project, request.codexUrl.searchParams.get("path"), request.method === "HEAD");
  });

  application.post("/api/projects/:projectId/files/upload", async (request, response) => {
    const user = request.identity.user;
    const project = await store.getProject(request.params.projectId, user.id);
    const threadId = validateId(request.codexUrl.searchParams.get("threadId"), "threadId");
    await store.requireThreadOwner(threadId, user.id, project.id);
    const file = await receiveProjectUpload(request, project, threadId, request.codexUrl.searchParams.get("name"));
    json(response, 201, { file });
  });

  application.delete("/api/projects/:projectId/files/attachment", async (request, response) => {
    const project = await store.getProject(request.params.projectId, request.identity.user.id);
    await removeProjectAttachment(project, request.codexUrl.searchParams.get("path"));
    json(response, 200, { removed: true });
  });

  application.get("/api/admin/files/download", async (request, response) => {
    requireAdmin(request.identity.user);
    await sendAdminFile(response, request.codexUrl.searchParams.get("path"), request.method === "HEAD");
  });

  application.patch("/api/projects/:projectId", async (request, response) => {
    const user = request.identity.user;
    const body = await readJson(request);
    const existing = await store.getProject(request.params.projectId, user.id, { requireAvailable: false });
    const pathChanged = Object.hasOwn(body, "path") && !samePath(String(body.path || ""), existing.path);
    if (pathChanged && conversations.projectHasActiveThread(existing.id)) throw httpError(409, "项目仍有任务正在执行，停止后才能修改目录。");
    const previousThreadIds = pathChanged ? store.threadIdsForProject(existing.id) : [];
    const settings = Object.hasOwn(body, "settings")
      ? await conversations.validateSettings(mergeSettings(existing.settings, body.settings))
      : undefined;
    const project = await store.updateProject(request.params.projectId, { ...body, ...(settings ? { settings } : {}) }, user.id);
    if (pathChanged) conversations.forgetProject(project.id, previousThreadIds);
    json(response, 200, { project });
  });

  application.delete("/api/projects/:projectId", async (request, response) => {
    const projectId = request.params.projectId;
    if (conversations.projectHasActiveThread(projectId)) throw httpError(409, "项目仍有任务正在执行，停止后才能删除。");
    const previousThreadIds = store.threadIdsForProject(projectId);
    const project = await store.removeProject(projectId, request.identity.user.id);
    conversations.forgetProject(project.id, previousThreadIds);
    json(response, 200, { project });
  });

  application.get("/api/projects/:projectId/threads", async (request, response) => {
    const project = await store.getProject(request.params.projectId, request.identity.user.id);
    const threads = await conversations.listProjectThreads(project, request.identity.user);
    json(response, 200, { threads });
  });
}

async function sendProjectFile(response, project, requestedPath, headOnly = false) {
  if (typeof requestedPath !== "string" || !requestedPath.trim()) throw httpError(400, "缺少要下载的文件路径。");
  const projectRoot = await realpath(project.path);
  const candidate = resolve(projectRoot, normalizeDownloadPath(requestedPath));
  let filePath;
  try {
    filePath = await realpath(candidate);
  } catch (error) {
    if (error.code === "ENOENT") throw httpError(404, "文件不存在或已经移动。");
    throw error;
  }
  const projectRelativePath = relative(projectRoot, filePath);
  if (projectRelativePath.startsWith(`..${pathSeparator()}`) || projectRelativePath === ".." || isAbsolute(projectRelativePath)) {
    throw httpError(403, "只能下载当前项目目录内的文件。");
  }
  const details = statSync(filePath);
  if (!details.isFile()) throw httpError(400, "该路径不是可下载文件。");
  return sendLocalFile(response, filePath, details, headOnly);
}

async function receiveProjectUpload(request, project, threadId, requestedName) {
  const fileName = validateUploadFileName(requestedName);
  const declaredLength = Number(request.headers["content-length"]);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_UPLOAD_BYTES) throw httpError(413, "单个上传文件不能超过 2 GB。");
  const projectRoot = await realpath(project.path);
  const requestedWorkspaceDirectory = join(projectRoot, ".codexlan");
  await mkdir(requestedWorkspaceDirectory, { recursive: true });
  const workspaceDirectory = await realpath(requestedWorkspaceDirectory);
  requirePathInside(projectRoot, workspaceDirectory, "工作台附件目录必须位于当前项目中。");
  await writeFile(join(workspaceDirectory, ".gitignore"), "*\n", { flag: "wx" }).catch((error) => {
    if (error.code !== "EEXIST") throw error;
  });
  const day = new Date().toISOString().slice(0, 10);
  const requestedDirectory = join(projectRoot, ".codexlan", "attachments", threadId, day);
  await mkdir(requestedDirectory, { recursive: true });
  const attachmentDirectory = await realpath(requestedDirectory);
  requirePathInside(projectRoot, attachmentDirectory, "附件目录必须位于当前项目中。");
  const storedName = `${randomUUID()}-${fileName}`;
  const destination = join(attachmentDirectory, storedName);
  const temporary = join(attachmentDirectory, `.upload-${randomUUID()}.part`);
  let total = 0;
  const sizeLimit = new Transform({
    transform(chunk, encoding, callback) {
      total += chunk.length;
      callback(total > MAX_UPLOAD_BYTES ? httpError(413, "单个上传文件不能超过 2 GB。") : null, chunk);
    },
  });
  try {
    await pipeline(request, sizeLimit, createWriteStream(temporary, { flags: "wx" }));
    try {
      await link(temporary, destination);
    } catch (error) {
      if (error.code === "EEXIST") throw httpError(409, "附件文件名发生冲突，请重试。");
      throw error;
    }
    await unlink(temporary);
    return { name: fileName, path: destination, size: total };
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

async function removeProjectAttachment(project, requestedPath) {
  if (typeof requestedPath !== "string" || !requestedPath.trim()) throw httpError(400, "缺少附件路径。");
  const projectRoot = await realpath(project.path);
  const attachmentRoot = join(projectRoot, ".codexlan", "attachments");
  let attachmentRootReal;
  let filePath;
  try {
    attachmentRootReal = await realpath(attachmentRoot);
    filePath = await realpath(resolve(projectRoot, normalizeDownloadPath(requestedPath)));
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  requirePathInside(projectRoot, attachmentRootReal, "附件目录必须位于当前项目中。");
  requirePathInside(attachmentRootReal, filePath, "只能删除工作台生成的附件。");
  const details = statSync(filePath);
  if (!details.isFile()) throw httpError(400, "附件路径不是文件。");
  await unlink(filePath);
}

function requirePathInside(root, candidate, message) {
  const relativePath = relative(root, candidate);
  if (relativePath.startsWith(`..${pathSeparator()}`) || relativePath === ".." || isAbsolute(relativePath)) {
    throw httpError(403, message);
  }
}

function validateUploadFileName(value) {
  if (typeof value !== "string" || !value.trim()) throw httpError(400, "缺少上传文件名。");
  const fileName = value.trim();
  if (fileName !== basename(fileName) || /[<>:"/\\|?*\u0000-\u001f]/.test(fileName) || /[ .]$/.test(fileName)) {
    throw httpError(400, "上传文件名包含 Windows 不允许的字符。");
  }
  if (fileName.length > 180) throw httpError(400, "上传文件名不能超过 180 个字符。");
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(fileName)) throw httpError(400, "该文件名是 Windows 保留名称。");
  return fileName;
}

async function sendAdminFile(response, requestedPath, headOnly = false) {
  if (typeof requestedPath !== "string" || !requestedPath.trim()) throw httpError(400, "缺少要读取的文件路径。");
  if (!isAbsolute(requestedPath.trim())) throw httpError(400, "文件路径必须是绝对路径。");
  const candidate = resolve(requestedPath.trim());
  let filePath;
  try {
    filePath = await realpath(candidate);
  } catch (error) {
    if (error.code === "ENOENT") throw httpError(404, "文件不存在或已经移动。");
    throw error;
  }
  const details = statSync(filePath);
  if (!details.isFile()) throw httpError(400, "该路径不是文件。");
  return sendLocalFile(response, filePath, details, headOnly);
}

function sendLocalFile(response, filePath, details, headOnly) {
  const fileName = basename(filePath);
  response.writeHead(200, {
    "Content-Type": downloadContentType(fileName),
    "Content-Length": details.size,
    "Content-Disposition": contentDisposition(fileName),
    "Cache-Control": "no-store",
  });
  if (headOnly) return response.end();
  createReadStream(filePath).pipe(response);
}

function normalizeDownloadPath(value) {
  let path = value.trim();
  if (/^file:\/\/\/[a-z]:\//i.test(path)) path = path.slice(8);
  if (/^\/[a-z]:[\\/]/i.test(path)) path = path.slice(1);
  return path;
}

function pathSeparator() {
  return process.platform === "win32" ? "\\" : "/";
}

function downloadContentType(fileName) {
  const types = {
    ".apk": "application/vnd.android.package-archive",
    ".csv": "text/csv; charset=utf-8",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".gif": "image/gif",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".json": "application/json; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".svg": "image/svg+xml",
    ".txt": "text/plain; charset=utf-8",
    ".webp": "image/webp",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".zip": "application/zip",
  };
  return types[extname(fileName).toLowerCase()] || "application/octet-stream";
}

function contentDisposition(fileName) {
  const fallback = fileName.replace(/[^\x20-\x7e]|["\\]/g, "_");
  const encoded = encodeURIComponent(fileName).replace(/['()]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
