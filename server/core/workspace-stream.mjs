import { randomUUID } from "node:crypto";

// Background traffic contains authorized conversation summaries only. One
// publisher coalesces work for every browser; transcript bodies stay selected.
export function createWorkspaceStream({ agents, projectFor, canReadProject, listProjects }) {
  const epoch = randomUUID(), clients = new Set(), pending = new Map();
  let timer;
  const send = (client, event) => {
    const { response, identity } = client;
    if (response.destroyed || response.writableEnded) return;
    if (identity.session.expiresAt <= Date.now() || response.writableLength > 256 * 1024) { response.end(); return; }
    response.write(`event: workspace\ndata: ${JSON.stringify({ epoch, sequence: ++client.sequence, ...event })}\n\n`);
  };
  const stops = agents.map((agent) => agent.onEvent((id, event) => {
    if (!["controls.changed", "conversation.created", "catalog.changed", "removed", "input.accepted", "run.terminal"].includes(event.kind)) return;
    const projectId = projectFor(id);
    if (!projectId) return;
    const key = JSON.stringify([agent.describe().instanceId, id]), previous = pending.get(key);
    pending.set(key, { agent, id, projectId,
      kind: event.kind === "removed" || previous?.kind === "removed" ? "removed" : event.kind === "conversation.created" || previous?.kind === "created" ? "created" : "changed" });
    if (!timer) timer = setTimeout(() => {
      timer = undefined;
      for (const entry of pending.values()) {
        const conversation = { ...entry.agent.summary(entry.id), projectId: entry.projectId };
        for (const client of clients) if (canReadProject(entry.projectId, client.identity.user.id)) send(client, { kind: entry.kind, conversation });
      }
      pending.clear();
    }, 100);
  }));
  return {
    async open(response, identity) {
      const projects = (await listProjects(identity.user.id)).map(({ id, name, available }) => ({ id, name, available }));
      if (response.destroyed || response.writableEnded) return;
      response.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
      response.write("retry: 2000\n\n");
      const client = { response, identity, sequence: 0 }; clients.add(client);
      const conversations = agents.flatMap((agent) => agent.knownIds().filter((id) => canReadProject(projectFor(id), identity.user.id)).map((id) => agent.summary(id)));
      send(client, { kind: "snapshot", conversations, projects });
      const heartbeat = setInterval(() => send(client, { kind: "heartbeat" }), 20_000);
      const expiry = setTimeout(() => response.end(), Math.max(1, Math.min(2_147_483_647, identity.session.expiresAt - Date.now())));
      response.once("close", () => { clearInterval(heartbeat); clearTimeout(expiry); clients.delete(client); });
    },
    close() { for (const client of clients) client.response.end(); for (const stop of stops) stop(); clearTimeout(timer); pending.clear(); },
  };
}
