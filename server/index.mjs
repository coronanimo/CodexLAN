import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createGzip } from "node:zlib";
import express from "express";
import { registerAccounts } from "./accounts.mjs";
import { AppServerClient } from "./codex-client.mjs";
import { isLoopbackIpv4, isPrivateIpv4, loadServerConfig, selectListenerAddress } from "./config.mjs";
import { createConversations } from "./conversations.mjs";
import { json } from "./http.mjs";
import { registerProjects } from "./projects.mjs";
import { AuthService, WorkspaceStore } from "./workspace-store.mjs";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageMetadata = JSON.parse(await readFile(join(appRoot, "package.json"), "utf8"));
if (typeof packageMetadata.version !== "string" || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(packageMetadata.version)) {
  throw new Error("package.json does not contain a valid application version.");
}
const appVersion = packageMetadata.version;
const nodeVersion = process.version.replace(/^v/, "");
const nodeArchitecture = process.arch;
const serverConfig = await loadServerConfig({ appRoot });
const port = serverConfig.port;
const requestedHost = serverConfig.host;
if (requestedHost !== undefined && !isPrivateIpv4(requestedHost) && !isLoopbackIpv4(requestedHost)) {
  throw new Error("host must be \"auto\" or a private/loopback IPv4 address.");
}
const localOnly = isLoopbackIpv4(requestedHost);
const lanHost = localOnly ? null : selectListenerAddress(requestedHost);
if (!localOnly && !lanHost) throw new Error("No private IPv4 address is available for the shared listener.");
const listenHost = localOnly ? "127.0.0.1" : "0.0.0.0";
const allowedListenerAddresses = new Set(["127.0.0.1", ...(lanHost ? [lanHost] : [])]);
const staticRoot = join(appRoot, "public");
const assetVersion = `${Math.trunc(statSync(join(staticRoot, "app.js")).mtimeMs)}`;
const dataRoot = serverConfig.dataRoot;
const workspaceRoot = serverConfig.workspaceRoot;
const stateFile = join(dataRoot, "workspace-state.json");
const configuredCodexBin = serverConfig.codexBin;
if (!serverConfig.workspaceRootConfigured) await mkdir(workspaceRoot, { recursive: true });
if (!existsSync(workspaceRoot) || !statSync(workspaceRoot).isDirectory()) {
  throw new Error(`workspaceRoot is not a directory: ${workspaceRoot}`);
}
const store = new WorkspaceStore({ dataRoot, stateFile, workspace: workspaceRoot });
await store.ready;
const auth = new AuthService(store);
const codex = new AppServerClient({ workspace: workspaceRoot, appVersion, codexBin: configuredCodexBin });

const httpServers = [];
const listenerState = {
  local: { status: "starting", url: null, error: null },
  lan: {
    enabled: Boolean(lanHost),
    status: lanHost ? "starting" : "disabled",
    url: null,
    error: null,
  },
};
const conversations = createConversations({ store, codex });
const workspaceApplication = createWorkspaceApplication();

void startHttpServers().catch((error) => {
  process.stderr.write(`[web] 本机工作台启动失败：${error.stack || error.message}\n`);
  process.exit(1);
});

let shuttingDown = false;
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => void shutdown(0));
}
process.on("message", (message) => {
  if (message?.type === "codexlan:shutdown") void shutdown(0);
});

function createWorkspaceServer() {
  return createServer(workspaceApplication);
}

async function startHttpServers() {
  const shared = await listen(createWorkspaceServer(), listenHost, port);
  listenerState.local = { status: "ready", url: `http://127.0.0.1:${port}`, error: null };
  if (lanHost) {
    listenerState.lan = { enabled: true, status: "ready", url: `http://${lanHost}:${port}`, error: null };
  }
  httpServers.push(shared.server);

  console.log("\nCodexLAN 已启动。");
  if (serverConfig.configPath) console.log(`配置文件：${serverConfig.configPath}`);
  console.log(`工作区根目录：${workspaceRoot}`);
  console.log(`本机工作台：${listenerState.local.url}`);
  if (listenerState.lan.url) console.log(`局域网地址：${listenerState.lan.url}`);
  console.log("账号隔离已启用：仍请仅在可信 Private 局域网使用。\n");
}

function listen(server, address, requestedPort) {
  return new Promise((resolveListen, rejectListen) => {
    const fail = (error) => rejectListen(error);
    server.once("error", fail);
    server.listen(requestedPort, address, () => {
      server.off("error", fail);
      server.on("error", (error) => process.stderr.write(`[web] HTTP 监听错误：${error.message}\n`));
      const actual = server.address();
      resolveListen({ server, url: `http://${address}:${actual.port}` });
    });
  });
}

async function shutdown(exitCode) {
  if (shuttingDown) return;
  shuttingDown = true;
  listenerState.local.status = "stopping";
  if (listenerState.lan.status === "ready") listenerState.lan.status = "stopping";
  await codex.close();
  conversations.closeEventStreams();
  await Promise.all(httpServers.map((server) => new Promise((resolveClose) => server.close(resolveClose))));
  process.exit(exitCode);
}

function createWorkspaceApplication() {
  const application = express();
  application.disable("x-powered-by");
  application.use((request, response, next) => {
    if (!allowedListenerAddresses.has(normalizeSocketAddress(request.socket.localAddress))) {
      return json(response, 403, { error: "这个网络接口不允许访问 CodexLAN。" });
    }
    request.codexUrl = new URL(request.originalUrl, `http://${request.headers.host || "localhost"}`);
    response.codexAcceptsGzip = /(?:^|,)\s*gzip(?:\s*;|\s*,|$)/i.test(request.headers["accept-encoding"] || "");
    setSecurityHeaders(response);
    next();
  });
  registerHealthRoutes(application);
  registerAccounts(application, { auth, store, onSessionsRevoked: conversations.closeUserEventStreams });
  registerRuntimeRoutes(application);
  registerProjects(application, { store, conversations });
  conversations.registerRoutes(application);
  application.use("/api", (request, response) => json(response, 404, { error: "找不到 API。" }));
  application.use((request, response) => serveStatic(request.codexUrl.pathname, request, response));
  application.use((error, request, response, next) => {
    process.stderr.write(`[web] ${error.stack || error.message}\n`);
    if (!response.headersSent) return json(response, error.statusCode || 500, { error: error.statusCode ? error.message : "服务端处理请求时发生错误。" });
    response.end();
  });
  return application;
}

function registerHealthRoutes(application) {
  application.get("/api/health", (request, response) => json(response, 200, {
    status: "alive",
    appVersion,
    assetVersion,
    nodeVersion,
    nodeArchitecture,
    codexStatus: codex.state,
    codexAgent: codex.agent,
    listeners: listenerState,
    pid: process.pid,
    uptimeSeconds: Math.floor(process.uptime()),
  }));

  application.get("/api/ready", (request, response) => {
    const ready = codex.state === "ready";
    json(response, ready ? 200 : 503, { status: codex.state });
  });

}

function registerRuntimeRoutes(application) {
  application.get("/api/status", (request, response) => json(response, 200, {
    status: codex.state,
    appVersion,
    assetVersion,
    nodeVersion,
    nodeArchitecture,
    codexAgent: codex.agent,
    codexError: codex.error,
    listeners: listenerState,
    workspaceRoot,
  }));
}




function serveStatic(pathname, request, response) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const filePath = normalize(join(staticRoot, requested));
  if (!filePath.startsWith(staticRoot) || !existsSync(filePath) || !statSync(filePath).isFile()) return text(response, 404, "Not found");
  const types = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
  };
  const extension = extname(filePath);
  const file = statSync(filePath);
  const etag = `W/"${file.size.toString(16)}-${Math.trunc(file.mtimeMs).toString(16)}"`;
  const headers = {
    "Content-Type": types[extension] || "application/octet-stream",
    "Cache-Control": extension === ".html" ? "no-cache" : "public, max-age=0, must-revalidate",
    ETag: etag,
  };
  if (request.headers["if-none-match"] === etag) {
    response.writeHead(304, headers);
    return response.end();
  }
  const compressible = new Set([".html", ".js", ".css", ".svg"]).has(extension);
  if (response.codexAcceptsGzip && compressible && file.size >= 1024) {
    response.writeHead(200, { ...headers, "Content-Encoding": "gzip", Vary: "Accept-Encoding" });
    return createReadStream(filePath).pipe(createGzip()).pipe(response);
  }
  response.writeHead(200, { ...headers, "Content-Length": file.size });
  return createReadStream(filePath).pipe(response);
}

function setSecurityHeaders(response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Content-Security-Policy", "default-src 'self'; connect-src 'self'; img-src 'self' blob: data:; style-src 'self'; style-src-elem 'self'; style-src-attr 'unsafe-inline'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'");
}

function text(response, status, body) {
  response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(body);
}

function normalizeSocketAddress(address) {
  if (address === "::1") return "127.0.0.1";
  return String(address || "").replace(/^::ffff:/, "");
}
