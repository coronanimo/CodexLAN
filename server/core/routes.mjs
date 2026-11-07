import { json, validateId, readJson } from "../http.mjs";
import { httpError, publicUser } from "../workspace-store.mjs";
import { openConversationStream } from "./conversation-stream.mjs";
import { createWorkspaceStream } from "./workspace-stream.mjs";

// Application authorization and HTTP are independent of a provider's protocol.
export function registerLanRoutes(application, { edition, agents, conversations, listProjects, getProject, authorizeConversation, canReadConversation, conversationProject, canReadProject }) {
  const streams = new Set();
  const registry = new Map(agents.map((agent) => [agent.describe().instanceId, agent]));
  if (!agents.length || registry.size !== agents.length) throw new Error("Agent instances must be nonempty and unique.");
  const workspace = createWorkspaceStream({ agents, projectFor: conversationProject, canReadProject, listProjects });
  const getAgent = (query) => {
    const id = query.get("agentId") || (agents.find((agent) => agent.describe().providerId === edition.defaultProviderId) || agents[0]).describe().instanceId;
    const agent = registry.get(id);
    if (!agent) throw httpError(404, "代理不存在。");
    return agent;
  };
  application.get("/api/lan/bootstrap", async (request, response) => {
    const projects = await listProjects(request.identity.user.id);
    json(response, 200, { version: 1, edition, user: publicUser(request.identity.user), agents: agents.map((agent) => agent.describe()),
      projects: projects.map(({ id, name, available }) => ({ id, name, available })) });
  });
  application.get("/api/lan/events", async (request, response) => {
    const client = { response, userId: request.identity.user.id }; streams.add(client);
    response.once("close", () => streams.delete(client)); await workspace.open(response, request.identity);
  });
  application.get("/api/lan/search", async (request, response) => {
    const query = request.codexUrl.searchParams, agent = getAgent(query);
    const projects = (await listProjects(request.identity.user.id)).filter((project) => project.available);
    const result = await agent.search(projects, request.identity.user, query.get("q"), query.get("cursor"));
    result.results = result.results.filter((row) => canReadProject(row.projectId, request.identity.user.id));
    json(response, 200, result);
  });
  application.get("/api/lan/projects/:projectId/conversations", async (request, response) => {
    const project = await getProject(request.params.projectId, request.identity.user.id);
    const result = await getAgent(request.codexUrl.searchParams).list(project, request.identity.user, { cursor: request.codexUrl.searchParams.get("cursor") });
    await getProject(project.id, request.identity.user.id);
    json(response, 200, result);
  });
  const authorized = async (request, query = request.codexUrl.searchParams) => {
    const project = await getProject(query.get("projectId"), request.identity.user.id);
    const agent = getAgent(query);
    const conversationId = validateId(request.params.conversationId, "conversationId");
    await authorizeConversation({ conversationId, agentInstanceId: agent.describe().instanceId, projectId: project.id, userId: request.identity.user.id });
    return { agent, conversationId, project };
  };
  application.get("/api/lan/agents/:agentId/settings", async (request, response) => {
    const agent = getAgent(new URLSearchParams({ agentId: request.params.agentId }));
    json(response, 200, await agent.configuration());
  });
  application.get("/api/lan/conversations/:conversationId/controls", async (request, response) => {
    const { agent, conversationId, project } = await authorized(request);
    const result = await conversations.controls(agent, conversationId);
    await getProject(project.id, request.identity.user.id); json(response, 200, result);
  });
  application.get("/api/lan/conversations/:conversationId/queue/:itemId", async (request, response) => {
    const { conversationId } = await authorized(request);
    json(response, 200, await conversations.queueItem(conversationId, validateId(request.params.itemId, "itemId")));
  });
  application.post("/api/lan/projects/:projectId/conversations", async (request, response) => {
    const body = await readJson(request), project = await getProject(request.params.projectId, request.identity.user.id);
    const agent = getAgent(new URLSearchParams({ agentId: String(body.agentId || "") }));
    json(response, 201, await agent.create(project, request.identity.user));
  });
  application.post("/api/lan/conversations/:conversationId/commands", async (request, response) => {
    const body = await readJson(request);
    const { agent, conversationId, project } = await authorized(request, new URLSearchParams({ projectId: String(body.projectId || ""), agentId: String(body.agentId || "") }));
    const command = body.command;
    if (!command || typeof command !== "object" || typeof command.type !== "string") throw httpError(400, "操作内容无效。");
    const result = await conversations.execute(agent, conversationId, project, command);
    json(response, 200, { ok: true, ...(result?.item?.id ? { receiptId: result.item.id } : {}), ...(result?.name ? { name: result.name } : {}) });
  });
  application.post("/api/lan/conversations/:conversationId/fork", async (request, response) => {
    const body = await readJson(request);
    const { agent, conversationId, project } = await authorized(request, new URLSearchParams({ projectId: String(body.projectId || ""), agentId: String(body.agentId || "") }));
    json(response, 201, await agent.fork(conversationId, project, request.identity.user));
  });
  application.get("/api/lan/conversations/:conversationId/export", async (request, response) => {
    const { agent, conversationId, project } = await authorized(request);
    const client = { response, userId: request.identity.user.id };
    streams.add(client); response.once("close", () => streams.delete(client));
    const iterator = agent.export(conversationId, request.codexUrl.searchParams.get("ref"));
    const first = await iterator.next();
    if (!canReadConversation({ projectId: project.id, conversationId, userId: request.identity.user.id })) { await iterator.return(); throw httpError(403, "项目访问权限已变化。"); }
    response.writeHead(200, { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": 'attachment; filename="conversation.md"', "Cache-Control": "no-store" });
    if (request.method === "HEAD") { await iterator.return(); return response.end(); }
    try {
      let next = first;
      while (!next.done) {
        if (response.destroyed || response.writableEnded || request.identity.session.expiresAt <= Date.now()
          || !canReadConversation({ projectId: project.id, conversationId, userId: request.identity.user.id })) break;
        if (!response.write(next.value)) await new Promise((resolve) => {
          const finish = () => { response.off("drain", finish); response.off("close", finish); resolve(); };
          response.once("drain", finish); response.once("close", finish);
        });
        if (response.destroyed) break;
        next = await iterator.next();
      }
      response.end();
    } catch { response.destroy(); }
    finally { await iterator.return(); }
  });
  application.get("/api/lan/conversations/:conversationId/history", async (request, response) => {
    const { agent, conversationId, project } = await authorized(request);
    const query = request.codexUrl.searchParams;
    const result = await agent.readHistory(conversationId, { before: query.get("before"), limit: Number(query.get("limit") || 100) });
    await getProject(project.id, request.identity.user.id);
    json(response, 200, result);
  });
  application.get("/api/lan/conversations/:conversationId/details", async (request, response) => {
    const { agent, conversationId, project } = await authorized(request);
    const query = request.codexUrl.searchParams;
    const result = await agent.readDetail(conversationId, { ref: query.get("ref"), after: query.get("after") });
    await getProject(project.id, request.identity.user.id);
    json(response, 200, result);
  });
  application.get("/api/lan/conversations/:conversationId/events", async (request, response) => {
    const { agent, conversationId, project } = await authorized(request);
    const client = { response, userId: request.identity.user.id };
    streams.add(client); response.once("close", () => streams.delete(client));
    return openConversationStream({ response, identity: request.identity, agent, conversationId,
      canRead: () => canReadConversation({ projectId: project.id, conversationId, userId: request.identity.user.id }) });
  });
  return {
    dispose() { workspace.close(); for (const { response } of streams) response.end(); },
    closeEventStreams() { for (const { response } of streams) response.end(); },
    closeUserEventStreams(userId) { for (const client of streams) if (client.userId === userId) client.response.end(); },
  };
}
