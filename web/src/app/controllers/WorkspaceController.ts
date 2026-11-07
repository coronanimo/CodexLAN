import type { AgentSetting } from "@lan/agent-contract";
import type { ReadBootstrap, ReadClient, ConversationSummary, ConversationSelection, WorkspaceUpdate } from "@lan/read-api";
import type { User } from "@lan/workspace";
import { HttpError } from "../../transport/http";

export type WorkspaceState = {
  bootstrap: ReadBootstrap | null; projectId: string; agentId: string;
  catalog: ConversationSummary[]; active: ConversationSummary[]; selected: ConversationSummary | null;
  selection: ConversationSelection | null; nextCursor: string | null; fields: AgentSetting[];
  loading: boolean; creating: boolean; unauthorized: boolean; error: string;
};
const initial = (): WorkspaceState => ({ bootstrap: null, projectId: "", agentId: "", catalog: [], active: [], selected: null,
  selection: null, nextCursor: null, fields: [], loading: false, creating: false, unauthorized: false, error: "" });

// Catalog metadata has its own lifetime. Updating a title/activity preserves the
// selected identity object, so it cannot reconnect the transcript controller.
export class WorkspaceController {
  private state = initial();
  private listeners = new Set<() => void>();
  private bootstrapRequest: AbortController | null = null;
  private catalogRequest: AbortController | null = null;
  private configurationRequest: AbortController | null = null;
  private stopWorkspace: (() => void) | null = null;
  private active = new Map<string, ConversationSummary>();
  private identity: string | undefined;
  constructor(readonly client: ReadClient, private identityChanged: () => void = () => {}) {}
  snapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private commit(patch: Partial<WorkspaceState>) { this.state = { ...this.state, ...patch }; for (const listener of this.listeners) listener(); }
  private authRequired = () => {
    this.bootstrapRequest?.abort(); this.catalogRequest?.abort(); this.configurationRequest?.abort();
    this.stopWorkspace?.(); this.stopWorkspace = null;
    this.commit({ ...initial(), unauthorized: true });
  };
  start = async () => {
    window.addEventListener("lan-auth-required", this.authRequired);
    this.bootstrapRequest?.abort();
    const request = this.bootstrapRequest = new AbortController();
    this.commit({ loading: true, error: "" });
    try {
      const bootstrap = await this.client.bootstrap(request.signal);
      if (request.signal.aborted) return;
      const previousUser = this.identity;
      if (previousUser && previousUser !== bootstrap.user?.id) { this.active.clear(); this.stopWorkspace?.(); this.stopWorkspace = null; }
      if (previousUser && previousUser !== bootstrap.user?.id) this.identityChanged();
      this.identity = bootstrap.user?.id;
      const projectId = bootstrap.projects.find((project) => project.id === this.state.projectId && project.available)?.id
        || bootstrap.projects.find((project) => project.available)?.id || "";
      const agentId = bootstrap.agents.find((agent) => agent.instanceId === this.state.agentId)?.instanceId
        || bootstrap.agents.find((agent) => agent.providerId === bootstrap.edition.defaultProviderId)?.instanceId || bootstrap.agents[0]?.instanceId || "";
      this.commit({ bootstrap, unauthorized: false }); document.title = bootstrap.edition.displayName;
      if (!this.stopWorkspace && this.client.watchWorkspace) this.stopWorkspace = this.client.watchWorkspace(this.receive);
      this.configure(agentId); await this.load(projectId, agentId, true);
    } catch (error) {
      if (!request.signal.aborted) {
        if (error instanceof HttpError && error.status === 401) this.authRequired();
        else this.commit({ loading: false, error: error instanceof Error ? error.message : "连接失败。" });
      }
    }
  };
  close() {
    this.bootstrapRequest?.abort(); this.catalogRequest?.abort(); this.configurationRequest?.abort();
    this.stopWorkspace?.(); this.stopWorkspace = null;
    window.removeEventListener("lan-auth-required", this.authRequired);
  }
  private async configure(agentId: string) {
    this.configurationRequest?.abort();
    const request = this.configurationRequest = new AbortController();
    this.commit({ fields: [] });
    if (!agentId || !this.client.configuration) return;
    try { const fields = await this.client.configuration(agentId, request.signal); if (!request.signal.aborted) this.commit({ fields }); }
    catch (error) { if (!request.signal.aborted) this.commit({ error: error instanceof Error ? error.message : "读取设置失败。" }); }
  }
  private selected(summary: ConversationSummary | null) {
    const current = this.state.selection;
    const same = summary && current?.conversationId === summary.id && current.projectId === summary.projectId && current.agentInstanceId === summary.agentInstanceId;
    return { selected: summary, selection: same ? current : summary ? { conversationId: summary.id, projectId: summary.projectId, agentInstanceId: summary.agentInstanceId } : null };
  }
  private async load(projectId: string, agentId: string, preserve = false) {
    this.catalogRequest?.abort();
    const request = this.catalogRequest = new AbortController();
    const retained = preserve && this.state.selected?.projectId === projectId && this.state.selected.agentInstanceId === agentId ? this.state.selected : null;
    this.commit({ projectId, agentId, catalog: [], nextCursor: null, loading: Boolean(projectId && agentId), ...this.selected(retained) });
    if (!projectId || !agentId) return;
    try {
      const page = await this.client.list(projectId, agentId, null, request.signal);
      if (request.signal.aborted) return;
      const desired = this.state.selected;
      const selected = page.conversations.find((item) => item.id === desired?.id) || desired || page.conversations[0] || null;
      const createdDuringRead = this.state.catalog.filter((item) => !page.conversations.some((entry) => entry.id === item.id));
      this.commit({ catalog: [...createdDuringRead, ...page.conversations], nextCursor: page.nextCursor, loading: false, error: "", ...this.selected(selected) });
    } catch (error) { if (!request.signal.aborted) this.commit({ loading: false, error: error instanceof Error ? error.message : "读取会话失败。" }); }
  }
  project = (projectId: string) => void this.load(projectId, this.state.agentId);
  agent = (agentId: string) => { void this.configure(agentId); void this.load(this.state.projectId, agentId); };
  select = (summary: ConversationSummary) => {
    if (summary.projectId !== this.state.projectId || summary.agentInstanceId !== this.state.agentId) {
      this.commit({ ...this.selected(summary), projectId: summary.projectId, agentId: summary.agentInstanceId });
      void this.configure(summary.agentInstanceId); void this.load(summary.projectId, summary.agentInstanceId, true);
    } else this.commit(this.selected(summary));
  };
  more = async () => {
    const { projectId, agentId, nextCursor } = this.state;
    if (!nextCursor || this.state.loading) return;
    this.catalogRequest?.abort(); const request = this.catalogRequest = new AbortController(); this.commit({ loading: true });
    try {
      const page = await this.client.list(projectId, agentId, nextCursor, request.signal);
      if (!request.signal.aborted) this.commit({ catalog: [...this.state.catalog, ...page.conversations.filter((item) => !this.state.catalog.some((old) => old.id === item.id))], nextCursor: page.nextCursor, loading: false });
    } catch (error) { if (!request.signal.aborted) this.commit({ loading: false, error: error instanceof Error ? error.message : "读取失败。" }); }
  };
  create = async () => {
    if (this.state.creating || !this.client.create) return;
    const { projectId, agentId } = this.state; this.commit({ creating: true, error: "" });
    try {
      const summary = await this.client.create(projectId, agentId, new AbortController().signal);
      if (this.state.projectId === projectId && this.state.agentId === agentId) this.add(summary);
    } catch (error) { this.commit({ error: error instanceof Error ? error.message : "创建失败。" }); }
    finally { this.commit({ creating: false }); }
  };
  add(summary: ConversationSummary) {
    this.commit({ catalog: [summary, ...this.state.catalog.filter((item) => item.id !== summary.id)], ...this.selected(summary) });
  }
  remove(id: string) {
    this.active.delete(id);
    const catalog = this.state.catalog.filter((item) => item.id !== id);
    this.commit({ catalog, active: [...this.active.values()], ...(this.state.selected?.id === id ? this.selected(catalog[0] || null) : {}) });
  }
  rename(id: string, title: string) {
    this.commit({ catalog: this.state.catalog.map((item) => item.id === id ? { ...item, title } : item),
      ...(this.state.selected?.id === id ? { selected: { ...this.state.selected, title } } : {}) });
  }
  user(user: User) { if (this.state.bootstrap) this.commit({ bootstrap: { ...this.state.bootstrap, user } }); }
  loggedOut() { this.active.clear(); this.authRequired(); }
  private receive = (event: WorkspaceUpdate) => {
    if (event.kind === "snapshot" && event.projects && this.state.bootstrap) {
      this.commit({ bootstrap: { ...this.state.bootstrap, projects: event.projects } });
      if (this.state.projectId && !event.projects.some((project) => project.id === this.state.projectId && project.available)) {
        this.active.clear(); this.commit({ active: [] });
        void this.load(event.projects.find((project) => project.available)?.id || "", this.state.agentId);
        return;
      }
    }
    if (event.kind === "removed") { this.remove(event.conversation.id); return; }
    const values = event.kind === "snapshot" ? event.conversations : [event.conversation];
    if (event.kind === "snapshot") this.active.clear();
    const updates = new Map(values.map((value) => [value.id, value]));
    for (const value of values) {
      if (value.status === "running" || (value.queueCount || 0) > 0) this.active.set(value.id, value);
      else this.active.delete(value.id);
    }
    let catalog = this.state.catalog.map((item) => updates.has(item.id) ? { ...item, ...updates.get(item.id) } : item);
    if (event.kind === "created" && event.conversation.projectId === this.state.projectId && event.conversation.agentInstanceId === this.state.agentId
      && !catalog.some((item) => item.id === event.conversation.id)) catalog = [event.conversation, ...catalog];
    const selected = this.state.selected;
    this.commit({ catalog, active: [...this.active.values()], ...(selected && updates.has(selected.id) ? { selected: { ...selected, ...updates.get(selected.id) } } : {}) });
  };
}
