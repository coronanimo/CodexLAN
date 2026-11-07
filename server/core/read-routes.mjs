import { json, validateId } from "../http.mjs";
import { httpError } from "../workspace-store.mjs";

// Application authorization and HTTP are independent of a provider's protocol.
export function registerLanReadRoutes(application, { edition, agents, listProjects, getProject, authorizeConversation }) {
  const registry = new Map(agents.map((agent) => [agent.describe().instanceId, agent]));
  if (!agents.length || registry.size !== agents.length) throw new Error("Agent instances must be nonempty and unique.");
  const getAgent = (query) => {
    const id = query.get("agentId") || (agents.find((agent) => agent.describe().providerId === edition.defaultProviderId) || agents[0]).describe().instanceId;
    const agent = registry.get(id);
    if (!agent) throw httpError(404, "代理不存在。");
    return agent;
  };
  application.get("/api/lan/bootstrap", async (request, response) => {
    const projects = await listProjects(request.identity.user.id);
    json(response, 200, { version: 1, edition, agents: agents.map((agent) => agent.describe()),
      projects: projects.map(({ id, name, available }) => ({ id, name, available })) });
  });
  application.get("/api/lan/projects/:projectId/conversations", async (request, response) => {
    const project = await getProject(request.params.projectId, request.identity.user.id);
    const result = await getAgent(request.codexUrl.searchParams).list(project, request.identity.user, { cursor: request.codexUrl.searchParams.get("cursor") });
    await getProject(project.id, request.identity.user.id);
    json(response, 200, result);
  });
  const authorized = async (request) => {
    const query = request.codexUrl.searchParams;
    const project = await getProject(query.get("projectId"), request.identity.user.id);
    const agent = getAgent(query);
    const conversationId = validateId(request.params.conversationId, "conversationId");
    await authorizeConversation({ conversationId, agentInstanceId: agent.describe().instanceId, projectId: project.id, userId: request.identity.user.id });
    return { agent, conversationId, project };
  };
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
    const result = await agent.readDetail(conversationId, { ref: query.get("ref"), offset: Number(query.get("offset") || 0) });
    await getProject(project.id, request.identity.user.id);
    json(response, 200, result);
  });
}
