import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isLoopbackIpv4, loadServerConfig, selectListenerAddress } from "./config.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const appRoot = resolve(dirname(scriptPath), "..");
const action = process.argv[2] || "status";
const managedProcessEnvironment = "CODEXLAN_MANAGED_PROCESS";
const externalOnlyActions = new Set(["stop", "restart", "handoff"]);

if (process.env[managedProcessEnvironment] === "1" && externalOnlyActions.has(action)) {
  throw new Error(`Refusing service ${action} from a CodexLAN-managed process. Run this command from an external terminal.`);
}

const config = await loadServerConfig({ appRoot });
const serviceRoot = join(config.dataRoot, "service");
const statePath = join(serviceRoot, "state.json");
const commandPath = join(serviceRoot, "command.json");
const logRoot = join(appRoot, "logs");
const logPath = join(logRoot, "codexlan.log");

await Promise.all([
  mkdir(serviceRoot, { recursive: true }),
  mkdir(logRoot, { recursive: true }),
]);

if (action === "daemon") await runDaemon();
else if (action === "handoff") await handoffService();
else if (action === "start") await startService();
else if (action === "stop") await stopService();
else if (action === "restart") await restartService();
else if (action === "status") await showStatus();
else if (action === "log") await showLog();
else throw new Error(`Unknown service command: ${action}`);

async function handoffService() {
  const current = await readJson(statePath);
  if (isProcessRunning(current?.supervisorPid)) {
    await sendCommand("stop");
    await waitFor(() => !isProcessRunning(current.supervisorPid), 15_000, "Existing CodexLAN supervisor did not stop in time.");
  }
  await startService();
}

async function startService() {
  const current = await readJson(statePath);
  if (isProcessRunning(current?.supervisorPid)) {
    if (current.status === "failed") {
      await preflightPorts();
      const ready = await restartRunningSupervisor(current);
      printReady(ready);
      return;
    }
    process.stdout.write(`CodexLAN supervisor is already running (PID ${current.supervisorPid}).\n`);
    return;
  }
  await preflightPorts();
  await rm(commandPath, { force: true });
  const daemonEnvironment = { ...process.env };
  delete daemonEnvironment[managedProcessEnvironment];
  const daemon = spawn(process.execPath, [scriptPath, "daemon"], {
    cwd: appRoot,
    detached: true,
    env: daemonEnvironment,
    stdio: "ignore",
    windowsHide: true,
  });
  daemon.unref();
  const ready = await waitFor(async () => {
    const state = await readJson(statePath);
    return state?.supervisorPid === daemon.pid && state.status === "ready" ? state : null;
  }, 20_000, `CodexLAN did not become ready. Check ${logPath}`);
  printReady(ready);
}

async function stopService() {
  const current = await readJson(statePath);
  if (!isProcessRunning(current?.supervisorPid)) {
    process.stdout.write("CodexLAN supervisor is not running.\n");
    return;
  }
  await sendCommand("stop");
  await waitFor(() => !isProcessRunning(current.supervisorPid), 15_000, "CodexLAN supervisor did not stop in time.");
  process.stdout.write("CodexLAN stopped.\n");
}

async function restartService() {
  const current = await readJson(statePath);
  if (!isProcessRunning(current?.supervisorPid)) {
    await startService();
    return;
  }
  if (current.status === "failed") await preflightPorts();
  const ready = await restartRunningSupervisor(current);
  printReady(ready);
}

async function restartRunningSupervisor(current) {
  const generation = Number(current.generation) || 0;
  await sendCommand("restart");
  return waitFor(async () => {
    const state = await readJson(statePath);
    if (state?.supervisorPid !== current.supervisorPid || state.generation <= generation) return null;
    if (state.status === "failed") throw new Error(state.lastError || `CodexLAN failed to start. Check ${logPath}`);
    return state.status === "ready" ? state : null;
  }, 20_000, `CodexLAN did not restart in time. Check ${logPath}`);
}

async function showStatus() {
  const state = await readJson(statePath);
  if (!isProcessRunning(state?.supervisorPid)) {
    process.stdout.write("CodexLAN supervisor is not running.\n");
    process.exitCode = 1;
    return;
  }
  process.stdout.write([
    `Supervisor PID: ${state.supervisorPid}`,
    `Server PID: ${state.serverPid || "-"}`,
    `Status: ${state.status}`,
    `Restarts: ${state.restartCount || 0}`,
    `Local: ${state.localUrl || "-"}`,
    `LAN: ${state.lanUrl || "-"}`,
    ...(state.lastError ? [`Error: ${state.lastError}`] : []),
    `Log: ${logPath}`,
    "",
  ].join("\n"));
}

async function showLog() {
  const contents = await readFile(logPath, "utf8").catch(() => "");
  const lines = contents.trimEnd().split(/\r?\n/).slice(-80);
  process.stdout.write(`Log: ${logPath}\n${lines.length && lines[0] ? `${lines.join("\n")}\n` : "No log entries.\n"}`);
}

async function runDaemon() {
  const existing = await readJson(statePath);
  if (existing?.supervisorPid !== process.pid && isProcessRunning(existing?.supervisorPid)) process.exit(2);

  const log = createWriteStream(logPath, { flags: "a" });
  let server = null;
  let mode = "run";
  let controlBusy = false;
  let restartTimer = null;
  let stableTimer = null;
  let killTimer = null;
  let stdoutBuffer = "";
  let stderrBuffer = "";
  let launchReady = false;
  let state = {
    supervisorPid: process.pid,
    serverPid: null,
    status: "starting",
    generation: 0,
    restartCount: 0,
    localUrl: null,
    lanUrl: null,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  let stateWrite = Promise.resolve();

  const writeLog = (message) => log.write(`[${new Date().toISOString()}] ${message}\n`);
  const saveState = (patch = {}) => {
    state = { ...state, ...patch, updatedAt: new Date().toISOString() };
    const snapshot = { ...state };
    stateWrite = stateWrite.then(() => writeJson(statePath, snapshot)).catch((error) => writeLog(`state write failed: ${error.message}`));
    return stateWrite;
  };

  const finish = async () => {
    clearInterval(controlTimer);
    clearTimeout(restartTimer);
    clearTimeout(stableTimer);
    clearTimeout(killTimer);
    await saveState({ serverPid: null, status: "stopped" });
    writeLog("supervisor stopped");
    log.end(() => process.exit(0));
  };

  const terminateServer = () => {
    if (!server) {
      if (mode === "stop") void finish();
      else spawnServer();
      return;
    }
    saveState({ status: mode === "stop" ? "stopping" : "restarting" });
    if (server.connected) server.send({ type: "codexlan:shutdown" });
    else server.kill();
    const expected = server;
    killTimer = setTimeout(() => {
      if (server !== expected) return;
      writeLog(`server PID ${expected.pid} did not stop gracefully; terminating its process tree`);
      const killer = spawn("taskkill.exe", ["/PID", String(expected.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
      killer.unref();
    }, 10_000);
  };

  const scheduleRestart = (code, signal) => {
    const failures = state.restartCount + 1;
    const delay = Math.min(30_000, 1_000 * (2 ** Math.min(failures - 1, 5)));
    writeLog(`server exited unexpectedly (code=${code}, signal=${signal || "none"}); restarting in ${delay} ms`);
    saveState({ serverPid: null, status: "restarting", restartCount: failures });
    restartTimer = setTimeout(spawnServer, delay);
  };

  const acceptOutput = (chunk, source) => {
    log.write(chunk);
    if (source === "stderr") {
      stderrBuffer = `${stderrBuffer}${chunk}`.slice(-4_000);
      return;
    }
    stdoutBuffer += chunk;
    const lines = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = lines.pop() || "";
    for (const line of lines) {
      const local = line.match(/本机工作台：(https?:\/\/\S+)/);
      const lan = line.match(/局域网地址：(https?:\/\/\S+)/);
      if (local) saveState({ localUrl: local[1] });
      if (lan) saveState({ lanUrl: lan[1] });
      if (line.includes("CodexLAN 已启动。")) {
        launchReady = true;
        saveState({ status: "ready", lastError: null });
        clearTimeout(stableTimer);
        stableTimer = setTimeout(() => saveState({ restartCount: 0 }), 60_000);
      }
    }
  };

  function spawnServer() {
    clearTimeout(restartTimer);
    clearTimeout(killTimer);
    mode = "run";
    stdoutBuffer = "";
    stderrBuffer = "";
    launchReady = false;
    state.generation += 1;
    state.localUrl = null;
    state.lanUrl = null;
    server = spawn(process.execPath, [join(appRoot, "server", "index.mjs")], {
      cwd: appRoot,
      env: { ...process.env, [managedProcessEnvironment]: "1" },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      windowsHide: true,
    });
    writeLog(`starting server PID ${server.pid}`);
    saveState({ serverPid: server.pid, status: "starting", generation: state.generation, localUrl: null, lanUrl: null });
    server.stdout.setEncoding("utf8");
    server.stderr.setEncoding("utf8");
    server.stdout.on("data", (chunk) => acceptOutput(chunk, "stdout"));
    server.stderr.on("data", (chunk) => acceptOutput(chunk, "stderr"));
    const launched = server;
    server.once("exit", (code, signal) => {
      if (server !== launched) return;
      clearTimeout(killTimer);
      clearTimeout(stableTimer);
      server = null;
      if (mode === "stop") void finish();
      else if (mode === "restart") {
        writeLog("server stopped for restart");
        spawnServer();
      } else if (launchReady) scheduleRestart(code, signal);
      else {
        const failure = compactFailure(stderrBuffer, code, signal);
        writeLog(`server failed during startup: ${failure}`);
        saveState({ serverPid: null, status: "failed", lastError: failure });
      }
    });
  }

  const handleCommand = async () => {
    if (controlBusy) return;
    controlBusy = true;
    try {
      const command = await readJson(commandPath);
      if (!command) return;
      await rm(commandPath, { force: true });
      if (command.action !== "stop" && command.action !== "restart") {
        writeLog(`ignored unknown command: ${command.action}`);
        return;
      }
      writeLog(`received ${command.action} command`);
      mode = command.action;
      terminateServer();
    } catch (error) {
      writeLog(`command failed: ${error.message}`);
    } finally {
      controlBusy = false;
    }
  };

  const controlTimer = setInterval(() => void handleCommand(), 250);
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      if (mode === "stop") return;
      mode = "stop";
      terminateServer();
    });
  }
  process.on("uncaughtException", (error) => {
    writeLog(`supervisor failure: ${error.stack || error.message}`);
    mode = "stop";
    terminateServer();
  });
  process.on("unhandledRejection", (error) => {
    writeLog(`supervisor rejection: ${error?.stack || error}`);
  });

  writeLog(`supervisor started (PID ${process.pid})`);
  await saveState();
  spawnServer();
}

async function sendCommand(commandAction) {
  await writeJson(commandPath, {
    id: `${Date.now()}-${process.pid}`,
    action: commandAction,
    requestedAt: new Date().toISOString(),
  });
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function writeJson(path, value) {
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}

function isProcessRunning(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

async function waitFor(check, timeout, message) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = await check();
    if (result) return result;
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(message);
}

function printReady(state) {
  process.stdout.write([
    `CodexLAN is ready (server PID ${state.serverPid}, supervisor PID ${state.supervisorPid}).`,
    `Local: ${state.localUrl || "-"}`,
    `LAN: ${state.lanUrl || "-"}`,
    "",
  ].join("\n"));
}

async function preflightPorts() {
  const localOnly = isLoopbackIpv4(config.host);
  if (!localOnly && !selectListenerAddress(config.host)) {
    throw new Error("No private IPv4 address is available for the shared listener.");
  }
  await assertPortAvailable(localOnly ? "127.0.0.1" : "0.0.0.0", config.port, "port");
}

function assertPortAvailable(host, port, name) {
  return new Promise((resolveAvailable, rejectAvailable) => {
    const probe = createServer();
    probe.once("error", (error) => rejectAvailable(new Error(`${name} ${host}:${port} is not available (${error.code || error.message}).`)));
    probe.listen(port, host, () => probe.close(resolveAvailable));
  });
}

function compactFailure(stderr, code, signal) {
  const line = String(stderr || "").split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean)[0];
  return line || `server exited during startup (code=${code}, signal=${signal || "none"})`;
}
