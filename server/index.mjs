import { createServer } from "node:http";
import { existsSync, statSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { registerStatic, staticVersion } from "./static.mjs";
import express from "express";
import { registerAccounts } from "./accounts.mjs";
import { AppServerClient } from "./codex-client.mjs";
import { isLoopbackIpv4, isPrivateIpv4, loadServerConfig, selectListenerAddress } from "./config.mjs";
import { json } from "./http.mjs";
import { registerProjects, resolveUploadedFiles } from "./projects.mjs";
import { AuthService, WorkspaceStore } from "./workspace-store.mjs";
import { createCodexAdapter } from "./agents/codex/adapter.mjs";
import { QueueCoordinator } from "./core/queue-coordinator.mjs";
import { ConversationService } from "./core/conversation-service.mjs";
import { registerLanRoutes } from "./core/routes.mjs";
import { codexlan } from "../products/codexlan/manifest.mjs";

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
const staticRoot = join(appRoot, "dist", "web");
const assetVersion = staticVersion(staticRoot);
const dataRoot = serverConfig.dataRoot;
const workspaceRoot = serverConfig.workspaceRoot;
const stateFile = join(dataRoot, "workspace-state.json");
const configuredCodexBin = serverConfig.codexBin;
if (!serverConfig.workspaceRootConfigured) await mkdir(workspaceRoot, { recursive: true });
if (!existsSync(workspaceRoot) || !statSync(workspaceRoot).isDirectory()) {
  throw new Error(`workspaceRoot is not a directory: ${workspaceRoot}`);
}
const store = new WorkspaceStore({
  dataRoot,
  stateFile,
  workspace: workspaceRoot,
  legacyJsonMirror: process.env.NODE_ENV === "test",
});
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
const agent = createCodexAdapter({
  store, connection: codex,
  autoApprove: serverConfig.autoApprove,
  autoApproveBrowser: serverConfig.autoApproveBrowser,
});
const queue = new QueueCoordinator(store, agent);
const conversations = new ConversationService(store, new Map([[agent.describe().instanceId, queue]]),
  (project, id, files) => resolveUploadedFiles(project, id, files, serverConfig.attachmentRoot));
codex.events.on("online", () => { void queue.recover().catch((error) => process.stderr.write(`[queue] 队列恢复失败：${error.message}\n`)); });
let lanStreams;
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
  const draining = queue.close(), closingAgent = agent.close();
  await codex.close();
  await draining;
  await closingAgent;
  lanStreams?.dispose();
  await Promise.all(httpServers.map((server) => new Promise((resolveClose) => server.close(resolveClose))));
  await store.persist({});
  store.close();
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
  registerAccounts(application, { auth, store, onSessionsRevoked: (userId) => {
    lanStreams?.closeUserEventStreams(userId);
  } });
  registerRuntimeRoutes(application);
  registerProjects(application, { store, attachmentRoot: serverConfig.attachmentRoot,
    onPermissionsChanged: () => lanStreams?.closeEventStreams(), projectBusy: agent.projectHasActiveThread,
    validateAgentSettings: agent.validateSettings, forgetProject: agent.forgetProject });
  lanStreams = registerLanRoutes(application, {
    edition: codexlan,
    agents: [agent], conversations,
    listProjects: (userId) => store.listProjects(userId),
    getProject: (id, userId) => store.getProject(id, userId),
    authorizeConversation: ({ conversationId, projectId, userId }) => store.requireThreadOwner(conversationId, userId, projectId),
    canReadConversation: ({ projectId, conversationId, userId }) => store.threadProjects[conversationId] === projectId
      && store.canAccessProject(store.projects.find((project) => project.id === projectId), userId),
    conversationProject: (id) => store.threadProjects[id],
    canReadProject: (id, userId) => store.canAccessProject(store.projects.find((project) => project.id === id), userId),
  });
  application.use("/api", (request, response) => json(response, 404, { error: "找不到 API。" }));
  registerStatic(application, staticRoot);
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
    workspaceSyncVersion: 3,
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





function setSecurityHeaders(response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Content-Security-Policy", "default-src 'self'; connect-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; style-src-elem 'self' 'unsafe-inline'; style-src-attr 'unsafe-inline'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'");
}

function normalizeSocketAddress(address) {
  if (address === "::1") return "127.0.0.1";
  return String(address || "").replace(/^::ffff:/, "");
}
