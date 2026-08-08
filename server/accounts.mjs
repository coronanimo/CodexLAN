import { json, readJson, requireLocalRequest } from "./http.mjs";
import {
  LEGACY_SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  httpError,
  publicUser,
  safeEqualText,
  verifyPassword,
} from "./workspace-store.mjs";

export function registerAccounts(application, { auth, store, onSessionsRevoked }) {
  application.get("/api/auth/session", async (request, response) => {
    const identity = await auth.authenticate(request);
    if (!identity) return json(response, 401, { error: "请先登录。", setupRequired: await auth.setupRequired() });
    if (identity.cookieName === LEGACY_SESSION_COOKIE) setSessionCookie(request, response, auth.cookieName, identity.token);
    return json(response, 200, { user: publicUser(identity.user), csrfToken: identity.session.csrfToken });
  });

  application.post("/api/auth/setup", async (request, response) => {
    requireSameOrigin(request);
    requireLocalRequest(request, "首次设置只能在服务器电脑上完成。");
    const body = await readJson(request);
    const user = await auth.createFirstAdmin({
      username: body.username,
      displayName: body.displayName,
      password: body.password,
    });
    const session = await auth.createSession(user.id);
    setSessionCookie(request, response, auth.cookieName, session.token);
    json(response, 201, { user, csrfToken: session.csrfToken });
  });

  application.post("/api/auth/login", async (request, response) => {
    requireSameOrigin(request);
    const body = await readJson(request);
    const result = await auth.login(body.username, body.password, request.socket.remoteAddress);
    setSessionCookie(request, response, auth.cookieName, result.token);
    json(response, 200, { user: result.user, csrfToken: result.csrfToken });
  });

  application.use("/api", async (request, response, next) => {
    const identity = await auth.authenticate(request);
    if (!identity) throw httpError(401, "登录已失效，请重新登录。");
    if (["POST", "PATCH", "PUT", "DELETE"].includes(request.method)) requireCsrf(request, identity);
    request.identity = identity;
    next();
  });

  application.post("/api/auth/logout", async (request, response) => {
    await auth.destroySession(request.identity.token);
    clearSessionCookie(request, response, auth.cookieName);
    json(response, 200, { ok: true });
  });

  application.post("/api/auth/password", async (request, response) => {
    const user = request.identity.user;
    const body = await readJson(request);
    if (!(await verifyPassword(body.currentPassword, user))) throw httpError(400, "当前密码不正确。");
    const updated = await store.setUserPassword(user.id, body.newPassword);
    await auth.destroyUserSessions(user.id);
    onSessionsRevoked(user.id);
    const session = await auth.createSession(user.id);
    setSessionCookie(request, response, auth.cookieName, session.token);
    json(response, 200, { user: updated, csrfToken: session.csrfToken });
  });

  application.get("/api/users", async (request, response) => {
    requireAdmin(request.identity.user);
    json(response, 200, { users: await store.listUsers() });
  });

  application.post("/api/users", async (request, response) => {
    requireAdmin(request.identity.user);
    json(response, 201, { user: await store.createUser(await readJson(request)) });
  });

  application.patch("/api/users/:userId", async (request, response) => {
    const user = request.identity.user;
    requireAdmin(user);
    const body = await readJson(request);
    if (request.params.userId === user.id && body.active === false) throw httpError(400, "不能停用当前登录的管理员。");
    const updated = await store.updateUser(request.params.userId, body);
    if (!updated.active) {
      await auth.destroyUserSessions(updated.id);
      onSessionsRevoked(updated.id);
    }
    json(response, 200, { user: updated });
  });

  application.post("/api/users/:userId/password", async (request, response) => {
    requireAdmin(request.identity.user);
    const body = await readJson(request);
    const updated = await store.setUserPassword(request.params.userId, body.password, { mustChangePassword: true });
    await auth.destroyUserSessions(request.params.userId);
    onSessionsRevoked(request.params.userId);
    json(response, 200, { user: updated });
  });
}

export function requireAdmin(user) {
  if (user.role !== "admin") throw httpError(403, "只有管理员可以管理账号。");
}

function requireSameOrigin(request) {
  const host = String(request.headers.host || "").toLowerCase();
  const origin = String(request.headers.origin || "").toLowerCase();
  if (origin !== `http://${host}` && origin !== `https://${host}`) {
    throw httpError(403, "请求来源无效，请从工作台页面重试。");
  }
}

function requireCsrf(request, identity) {
  requireSameOrigin(request);
  if (!safeEqualText(request.headers["x-codex-csrf-token"], identity.session.csrfToken)) {
    throw httpError(403, "页面凭据已失效，请刷新后重试。");
  }
}

function setSessionCookie(request, response, cookieName, token) {
  const secure = String(request.headers.origin || "").toLowerCase().startsWith("https://") ? "; Secure" : "";
  response.setHeader("Set-Cookie", `${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}${secure}`);
}

function clearSessionCookie(request, response, cookieName) {
  const secure = String(request.headers.origin || "").toLowerCase().startsWith("https://") ? "; Secure" : "";
  response.setHeader("Set-Cookie", `${cookieName}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure}`);
}
