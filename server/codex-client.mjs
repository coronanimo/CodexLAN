import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { resolve } from "node:path";

const APP_SERVER_MAX_RESTARTS = 6;
const MAX_LOADED_THREADS = 300;

export class AppServerClient {
  constructor({ workspace, appVersion, codexBin }) {
    this.workspace = workspace;
    this.appVersion = appVersion;
    this.codexBin = codexBin;
    this.events = new EventEmitter();
    this.pending = new Map();
    this.loadedThreads = new Set();
    this.nextId = 1;
    this.buffer = "";
    this.state = "starting";
    this.process = null;
    this.startPromise = null;
    this.restartTimer = null;
    this.stableTimer = null;
    this.restartAttempts = 0;
    this.closed = false;
    this.agent = "";
    this.error = "";
    this.ready = this.ensureStarted();
    void this.ready.catch(() => {});
  }

  ensureStarted() {
    if (this.state === "ready" || this.state === "login_required") return Promise.resolve();
    if (this.startPromise) return this.startPromise;
    if (this.closed) return Promise.reject(new Error("Codex App Server 已关闭。"));
    this.state = "starting";
    this.error = "";
    const startPromise = this.start().then((state) => {
      if (this.closed) throw new Error("Codex App Server 已关闭。");
      this.state = state;
      this.error = state === "login_required" ? "Codex CLI 尚未登录。请先在这台电脑上完成 Codex 登录。" : "";
      if (this.stableTimer) clearTimeout(this.stableTimer);
      this.stableTimer = setTimeout(() => {
        this.stableTimer = null;
        this.restartAttempts = 0;
      }, 60_000);
      this.events.emit("online", { status: this.state, message: this.error });
    }).catch((error) => {
      if (this.state === "starting") {
        const child = this.process;
        child?.kill();
        this.handleFailure(child, error);
      }
      throw error;
    }).finally(() => {
      if (this.startPromise === startPromise) this.startPromise = null;
    });
    this.startPromise = startPromise;
    this.ready = startPromise;
    return startPromise;
  }

  async start() {
    const launch = this.appServerLaunch();
    this.agent = "";
    const child = spawn(launch.executable, launch.args, {
      cwd: this.workspace,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    this.process = child;
    this.buffer = "";
    this.loadedThreads.clear();
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => this.onOutput(chunk));
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => process.stderr.write(`[codex] ${chunk}`));
    child.once("error", (error) => this.handleFailure(child, error));
    child.once("exit", (code, signal) => {
      const error = new Error(`Codex App Server exited (${signal || code || "unknown"}).`);
      this.handleFailure(child, error, { code, signal });
    });

    const initialized = await this.rawRequest("initialize", {
      clientInfo: { name: "codexlan", title: "CodexLAN", version: this.appVersion },
      capabilities: { experimentalApi: true },
    });
    if (this.process !== child) throw new Error("Codex App Server 在初始化期间退出。");
    this.agent = typeof initialized?.userAgent === "string" ? initialized.userAgent.trim().replace(/\s+/g, " ").slice(0, 160) : "";
    this.notify("initialized", {});
    const account = await this.rawRequest("account/read", { refreshToken: false });
    if (!account || typeof account !== "object" || typeof account.requiresOpenaiAuth !== "boolean" || !Object.hasOwn(account, "account")) {
      throw new Error("Codex App Server 返回了无效的账号状态。");
    }
    return account.requiresOpenaiAuth && account.account === null ? "login_required" : "ready";
  }

  onOutput(chunk) {
    this.buffer += chunk;
    let newline;
    while ((newline = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (!line) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch (error) {
        this.protocolFailure(`Codex App Server 返回了无效 JSON：${error.message}`);
        return;
      }
      if (!message || typeof message !== "object" || Array.isArray(message)) {
        this.protocolFailure("Codex App Server 返回了无效消息。");
        return;
      }
      if (Object.hasOwn(message, "id") && typeof message.method === "string" && message.method) {
        this.events.emit("serverRequest", message);
      } else if (Object.hasOwn(message, "id")) {
        const pending = this.pending.get(message.id);
        if (!pending) continue;
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        if (message.error) {
          const error = new Error(message.error.message || "Codex 请求失败。");
          error.codexResponse = true;
          pending.reject(error);
        } else {
          pending.resolve(message.result);
        }
      } else if (typeof message.method === "string" && message.method) {
        if (message.method === "thread/closed") this.loadedThreads.delete(message.params?.threadId);
        this.events.emit("notification", message);
      } else {
        this.protocolFailure("Codex App Server 返回了没有 id 或 method 的消息。");
        return;
      }
    }
  }

  protocolFailure(message) {
    const child = this.process;
    child?.kill();
    this.handleFailure(child, new Error(message));
  }

  rawRequest(method, params) {
    if (!this.process?.stdin?.writable) return Promise.reject(new Error("Codex App Server 不可用。"));
    const id = this.nextId++;
    return new Promise((resolveRequest, rejectRequest) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        rejectRequest(new Error(`Codex 在 60 秒内未响应 ${method}。`));
      }, 60_000);
      this.pending.set(id, { resolve: resolveRequest, reject: rejectRequest, timer });
      this.process.stdin.write(`${JSON.stringify({ method, id, params })}\n`);
    });
  }

  notify(method, params) {
    if (this.process?.stdin?.writable) this.process.stdin.write(`${JSON.stringify({ method, params })}\n`);
  }

  respond(id, result) {
    if (!this.process?.stdin?.writable) throw new Error("Codex App Server 不可用。");
    this.process.stdin.write(`${JSON.stringify({ id, result })}\n`);
  }

  respondError(id, code, message) {
    if (!this.process?.stdin?.writable) throw new Error("Codex App Server 不可用。");
    this.process.stdin.write(`${JSON.stringify({ id, error: { code, message } })}\n`);
  }

  async request(method, params) {
    if (this.state !== "ready") {
      if (this.startPromise) await this.startPromise;
      if (this.state === "login_required") throw new Error(this.error);
      else throw new Error(this.state === "failed" ? "Codex App Server 自动恢复失败，请查看服务日志。" : "Codex App Server 正在恢复，请稍后重试。");
    }
    return this.rawRequest(method, params);
  }

  async ensureLoaded(threadId, project) {
    if (this.loadedThreads.has(threadId)) {
      this.markThreadLoaded(threadId);
      return null;
    }
    const result = await this.request("thread/resume", { threadId, cwd: project.path });
    this.markThreadLoaded(threadId);
    return result;
  }

  markThreadLoaded(threadId) {
    this.loadedThreads.delete(threadId);
    this.loadedThreads.add(threadId);
    while (this.loadedThreads.size > MAX_LOADED_THREADS) this.loadedThreads.delete(this.loadedThreads.values().next().value);
  }

  fail(error) {
    for (const [id, pending] of this.pending) {
      this.pending.delete(id);
      clearTimeout(pending.timer);
      pending.reject(error);
    }
  }

  handleFailure(child, error, details = {}) {
    if (!child || this.process !== child) return;
    this.process = null;
    this.buffer = "";
    this.agent = "";
    this.error = this.failureMessage(error);
    this.loadedThreads.clear();
    this.fail(error);
    if (this.stableTimer) clearTimeout(this.stableTimer);
    this.stableTimer = null;
    if (this.closed) return;
    const retryable = error?.code !== "ENOENT";
    this.state = retryable ? "offline" : "failed";
    this.events.emit("offline", {
      ...details,
      message: this.error,
      restartAttempt: this.restartAttempts,
      ...(!retryable ? { retryStopped: true } : {}),
    });
    if (!retryable) return;
    this.scheduleRestart();
  }

  scheduleRestart() {
    if (this.closed || this.restartTimer) return;
    if (this.restartAttempts >= APP_SERVER_MAX_RESTARTS) {
      this.state = "failed";
      this.events.emit("offline", { message: "Codex App Server 自动恢复次数已用尽。", retryStopped: true });
      return;
    }
    const delay = Math.min(30_000, 1000 * (2 ** this.restartAttempts));
    this.restartAttempts += 1;
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      void this.ensureStarted().catch((error) => {
        process.stderr.write(`[web] Codex App Server 第 ${this.restartAttempts} 次恢复失败：${error.message}\n`);
      });
    }, delay);
  }

  async close() {
    this.closed = true;
    await this.stopProcess("Codex App Server 已关闭。");
  }

  async restart() {
    this.closed = true;
    await this.stopProcess("Codex App Server 正在重新连接。");
    this.closed = false;
    this.state = "starting";
    this.restartAttempts = 0;
    return this.ensureStarted();
  }

  async stopProcess(reason) {
    if (this.restartTimer) clearTimeout(this.restartTimer);
    if (this.stableTimer) clearTimeout(this.stableTimer);
    this.restartTimer = null;
    this.stableTimer = null;
    const child = this.process;
    this.process = null;
    this.agent = "";
    this.fail(new Error(reason));
    if (!child || child.exitCode !== null) return;
    await new Promise((resolveClose) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolveClose();
      };
      const timer = setTimeout(finish, 2_000);
      child.once("exit", finish);
      child.kill();
    });
  }

  appServerLaunch() {
    const fixture = process.env.CODEX_TEST_APP_SERVER;
    if (!fixture) return { executable: this.codexBin || "codex", args: ["app-server", "--listen", "stdio://"] };
    if (process.env.NODE_ENV !== "test") throw new Error("CODEX_TEST_APP_SERVER is available only when NODE_ENV=test.");
    return { executable: process.execPath, args: [resolve(fixture)] };
  }

  failureMessage(error) {
    if (error?.code === "ENOENT") {
      return this.codexBin
        ? `找不到配置的 Codex CLI：${this.codexBin}`
        : "没有找到 Codex CLI。请安装 Codex for Windows，或把 codex.exe 加入 PATH。";
    }
    return String(error?.message || "Codex App Server 启动失败。").trim().replace(/\s+/g, " ").slice(0, 300);
  }
}
