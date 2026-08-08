import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { networkInterfaces } from "node:os";
import { fileURLToPath } from "node:url";
import { createGzip } from "node:zlib";
import express from "express";
import { registerAccounts } from "./server/accounts.mjs";
import { AppServerClient } from "./server/codex-client.mjs";
import { createConversations } from "./server/conversations.mjs";
import { json } from "./server/http.mjs";
import { registerProjects } from "./server/projects.mjs";
import { AuthService, WorkspaceStore } from "./server/workspace-store.mjs";

const appRoot = dirname(fileURLToPath(import.meta.url));
const packageMetadata = JSON.parse(await readFile(join(appRoot, "package.json"), "utf8"));
if (typeof packageMetadata.version !== "string" || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(packageMetadata.version)) {
  throw new Error("package.json does not contain a valid application version.");
}
const appVersion = packageMetadata.version;
const nodeVersion = process.version.replace(/^v/, "");
const nodeArchitecture = process.arch;
const port = readPort("CODEX_WEB_PORT", 8687);
const requestedHost = process.env.CODEX_WEB_HOST;
if (requestedHost !== undefined && !isPrivateIpv4(requestedHost) && !isLoopbackIpv4(requestedHost)) {
  throw new Error("CODEX_WEB_HOST must be a private or loopback IPv4 address.");
}
const localOnly = isLoopbackIpv4(requestedHost);
const configuredLocalPort = readPort("CODEX_LOCAL_PORT", 0, 0);
const localPort = localOnly ? port : configuredLocalPort;
const lanSetting = process.env.CODEX_LAN_ENABLED;
if (lanSetting !== undefined && lanSetting !== "0" && lanSetting !== "1") {
  throw new Error("CODEX_LAN_ENABLED must be 0 or 1.");
}
const lanEnabled = !localOnly && lanSetting !== "0";
const lanHost = lanEnabled ? selectListenerAddress(requestedHost) : null;
const configuredWorkspace = process.env.CODEX_WORKDIR;
if (configuredWorkspace !== undefined && !configuredWorkspace.trim()) throw new Error("CODEX_WORKDIR must not be empty.");
const workspace = resolve(configuredWorkspace || join(appRoot, "workspace"));
const staticRoot = join(appRoot, "public");
const assetVersion = `${Math.trunc(statSync(join(staticRoot, "app.js")).mtimeMs)}`;
const configuredDataRoot = process.env.CODEX_WEB_DATA_DIR;
if (configuredDataRoot !== undefined && !configuredDataRoot.trim()) throw new Error("CODEX_WEB_DATA_DIR must not be empty.");
const dataRoot = resolve(configuredDataRoot || join(appRoot, "data"));
const stateFile = join(dataRoot, "workspace-state.json");
const configuredCodexBin = process.env.CODEX_BIN;
if (configuredCodexBin !== undefined && !configuredCodexBin.trim()) throw new Error("CODEX_BIN must not be empty when set.");
if (!configuredWorkspace) await mkdir(workspace, { recursive: true });
if (!existsSync(workspace) || !statSync(workspace).isDirectory()) {
  throw new Error(`CODEX_WORKDIR is not a directory: ${workspace}`);
}



const store = new WorkspaceStore({ dataRoot, stateFile, workspace });
await store.ready;
const auth = new AuthService(store);
const codex = new AppServerClient({ workspace, appVersion, codexBin: configuredCodexBin });

const httpServers = [];
const listenerState = {
  local: { status: "starting", url: null, error: null },
  lan: {
    enabled: lanEnabled,
    status: lanEnabled ? (lanHost ? "starting" : "unavailable") : "disabled",
    url: null,
    error: lanEnabled && !lanHost ? "没有可用的私有局域网 IPv4 地址。" : null,
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

function createWorkspaceServer() {
  return createServer(workspaceApplication);
}

async function startHttpServers() {
  const local = await listen(createWorkspaceServer(), "127.0.0.1", localPort);
  listenerState.local = { status: "ready", url: local.url, error: null };
  httpServers.push(local.server);

  if (lanHost) {
    try {
      const lan = await listen(createWorkspaceServer(), lanHost, port);
      listenerState.lan = { enabled: true, status: "ready", url: lan.url, error: null };
      httpServers.push(lan.server);
    } catch (error) {
      listenerState.lan = { enabled: true, status: "unavailable", url: null, error: listenerErrorMessage(error, lanHost, port) };
      process.stderr.write(`[web] ${listenerState.lan.error}\n`);
    }
  }

  console.log("\nCodexLAN 已启动。");
  console.log(`默认项目目录：${workspace}`);
  console.log(`本机工作台：${listenerState.local.url}`);
  if (listenerState.lan.url) console.log(`局域网地址：${listenerState.lan.url}`);
  else if (listenerState.lan.enabled) console.log(`局域网访问未启动：${listenerState.lan.error}`);
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
    request.codexUrl = new URL(request.originalUrl, `http://${request.headers.host || "localhost"}`);
    response.codexAcceptsGzip = /(?:^|,)\s*gzip(?:\s*;|\s*,|$)/i.test(request.headers["accept-encoding"] || "");
    setSecurityHeaders(response);
    next();
  });
  registerHealthRoutes(application);
  registerAccounts(application, { auth, store, onSessionsRevoked: conversations.closeUserEventStreams });
  registerRuntimeRoutes(application);
  registerProjects(application, { store, workspace, conversations });
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
    defaultWorkspace: workspace,
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

function readPort(name, fallback, minimum = 1) {
  const value = process.env[name];
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value)) throw new Error(`${name} must be an integer from ${minimum} to 65535.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > 65535) {
    throw new Error(`${name} must be an integer from ${minimum} to 65535.`);
  }
  return parsed;
}

function selectListenerAddress(requestedHost) {
  if (requestedHost) return requestedHost;
  const addresses = Object.values(networkInterfaces()).flat().filter((address) => address?.family === "IPv4" && !address.internal && isPrivateIpv4(address.address));
  const preferred = addresses.find((address) => address.address.startsWith("192.168.")) || addresses.find((address) => address.address.startsWith("10.")) || addresses[0];
  return preferred?.address || null;
}

function listenerErrorMessage(error, address, requestedPort) {
  if (error?.code === "EADDRINUSE") return `局域网端口 ${requestedPort} 已被占用。`;
  if (error?.code === "EADDRNOTAVAIL") return `局域网地址 ${address} 当前不可用。`;
  if (error?.code === "EACCES") return `没有权限监听局域网端口 ${requestedPort}。`;
  return `局域网访问未启动：${error?.message || "未知错误"}`;
}

function isLoopbackIpv4(address) {
  const octets = typeof address === "string" ? address.split(".").map((part) => Number(part)) : [];
  return octets.length === 4
    && octets.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
    && octets[0] === 127;
}

function isPrivateIpv4(address) {
  const octets = typeof address === "string" ? address.split(".").map((part) => Number(part)) : [];
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return octets[0] === 10 || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) || (octets[0] === 192 && octets[1] === 168);
}
