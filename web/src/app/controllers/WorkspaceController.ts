import type { AgentSetting } from "@lan/agent-contract";
import type { ReadBootstrap, ReadClient, ConversationMetadata, ConversationSummary, ConversationSelection, WorkspaceUpdate, CatalogPage } from "@lan/read-api";
import type { ConversationControls } from "@lan/commands";
import type { User } from "@lan/workspace";
import { HttpError } from "../../transport/http";
import { preferencesFor } from "./Preferences";
import { uiId } from "../../platform/ui-id";

export type WorkspaceState = {
  bootstrap: ReadBootstrap | null; projectId: string; agentId: string;
  catalog: ConversationSummary[]; globalCatalog: ConversationSummary[]; recent: ConversationSummary[]; active: ConversationSummary[]; selected: ConversationSummary | null;
  selection: ConversationSelection | null; nextCursor: string | null; globalCursor: string | null; fields: AgentSetting[];
  sidebarView: "projects" | "recent"; sidebarOrder: "original" | "recent"; globalLoading: boolean;
  loading: boolean; creating: boolean; unauthorized: boolean; error: string; globalError: string; focusDraftId: string; focusRequest: number;
  configurationLoading: boolean; configurationError: string;
};
const initial = (): WorkspaceState => ({ bootstrap: null, projectId: "", agentId: "", catalog: [], globalCatalog: [], recent: [], active: [], selected: null,
  selection: null, nextCursor: null, globalCursor: null, fields: [], sidebarView: "projects", sidebarOrder: "original", globalLoading: false, loading: false, creating: false, unauthorized: false, error: "", globalError: "", focusDraftId: "", focusRequest: 0, configurationLoading: false, configurationError: "" });
const activity = (item: ConversationSummary) => Date.parse(item.accessedAt || "") || (item.updatedAt || 0) * 1000;
const selectionOf = (item: ConversationSummary): ConversationSelection => ({ conversationId: item.id, projectId: item.projectId, agentInstanceId: item.agentInstanceId });

// A catalog page supplies order, not deletions. Keep previously loaded entries
// at the head or beside their next shared anchor; only an explicit removal
// evicts an entry.
function mergeCatalog(current: ConversationSummary[], page: ConversationSummary[], append = false) {
  const incoming = new Map(page.map((row) => [row.id, row]));
  if (append) {
    const loaded = new Set(current.map((row) => row.id));
    return [...current, ...[...incoming.values()].filter((row) => !loaded.has(row.id))];
  }
  const before = new Map<string, ConversationSummary[]>();
  let prefix: ConversationSummary[] = [], pending: ConversationSummary[] = [], anchored = false;
  for (const row of current) {
    if (incoming.has(row.id)) {
      if (anchored) before.set(row.id, pending); else { prefix = pending; anchored = true; }
      pending = [];
    }
    else pending.push(row);
  }
  return [...prefix, ...[...incoming.values()].flatMap((row) => [...(before.get(row.id) || []), row]), ...pending];
}

// Navigation metadata and local conversation drafts have independent lifetimes
// from transcript readers. Streamed status never invents a new selection.
export class WorkspaceController {
  private state = initial();
  private listeners = new Set<() => void>();
  private bootstrapRequest: AbortController | null = null;
  private catalogRequest: AbortController | null = null;
  private globalRequest: AbortController | null = null;
  private configurationRequest: AbortController | null = null;
  private configurationPending: Promise<void> = Promise.resolve();
  private stopWorkspace: (() => void) | null = null;
  private known = new Map<string, ConversationSummary>();
  private drafts = new Map<string, { summary: ConversationSummary; settings: Record<string, string | number | boolean>; inherited: Record<string, string | number | boolean>; modelEdited: boolean; settingsEdited: boolean }>();
  private materialized = new Map<string, ConversationSummary>();
  private creating = new Map<string, Promise<ConversationSummary>>();
  private identity: string | undefined;
  private completions = new Map<string, string>();
  private backgroundCount = 0;
  private scope = 0;
  private globalScope = "";
  private globalExpanded = false;
  private clearNotifications = () => { this.backgroundCount = 0; if (this.state.bootstrap) document.title = this.state.bootstrap.edition.displayName; };
  constructor(readonly client: ReadClient, private identityChanged: () => void = () => {}, private currentSettings: (id: string) => Record<string, string | number | boolean> = () => ({})) {}
  snapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private commit(patch: Partial<WorkspaceState>) {
    const recent = [...this.known.values()].filter((item) => item.agentInstanceId === (patch.agentId || this.state.agentId)).sort((a, b) => Number(!!Date.parse(b.accessedAt || "")) - Number(!!Date.parse(a.accessedAt || "")) || activity(b) - activity(a)).slice(0, 30);
    const next = { ...this.state, ...patch };
    const resolve = (rows: ConversationSummary[]) => rows.flatMap((row) => this.known.has(row.id) ? [this.known.get(row.id)!] : []);
    this.state = { ...next, catalog: resolve(next.catalog), globalCatalog: resolve(next.globalCatalog), active: resolve(next.active),
      selected: next.selected ? this.known.get(next.selected.id) || null : null, recent };
    for (const listener of this.listeners) listener();
  }
  private remember(rows: ConversationMetadata[], baseline?: Map<string, ConversationSummary>) {
    for (const row of rows) {
      const previous = this.known.get(row.id);
      if (baseline?.has(row.id) && !previous) continue;
      // Metadata changed while this read was in flight. The response cannot
      // overwrite a newer creation, rename, status update or local visit.
      const value = baseline && previous && previous !== baseline.get(row.id) ? { ...row, ...previous } : { ...previous, ...row, title: row.title ?? previous?.title ?? "未命名聊天" };
      if ((Date.parse(previous?.accessedAt || "") || 0) > (Date.parse(value.accessedAt || "") || 0)) value.accessedAt = previous?.accessedAt;
      this.known.set(row.id, value);
    }
  }
  private include(summary: ConversationMetadata) {
    const fresh = !this.known.has(summary.id);
    this.remember([summary]);
    if (fresh) this.known = new Map([[summary.id, this.known.get(summary.id)!], ...this.known]);
    const insert = (rows: ConversationSummary[]) => rows.some((row) => row.id === summary.id) ? rows : [this.known.get(summary.id)!, ...rows];
    return {
      catalog: summary.projectId === this.state.projectId && summary.agentInstanceId === this.state.agentId ? insert(this.state.catalog) : this.state.catalog,
      globalCatalog: summary.agentInstanceId === this.state.agentId ? insert(this.state.globalCatalog) : this.state.globalCatalog,
    };
  }
  private authRequired = () => {
    this.scope++;
    this.close(); this.known.clear(); this.drafts.clear(); this.materialized.clear(); this.globalScope = ""; this.globalExpanded = false;
    this.commit({ ...initial(), unauthorized: true });
  };
  start = async (preferredProjectId?: string) => {
    window.addEventListener("lan-auth-required", this.authRequired);
    window.addEventListener("focus", this.clearNotifications);
    this.bootstrapRequest?.abort();
    const request = this.bootstrapRequest = new AbortController();
    this.commit({ loading: true, error: "" });
    try {
      const bootstrap = await this.client.bootstrap(request.signal); if (request.signal.aborted) return;
      if (this.identity && this.identity !== bootstrap.user?.id) {
        this.scope++; this.completions.clear(); this.globalScope = ""; this.globalExpanded = false;
        this.known.clear(); this.drafts.clear(); this.materialized.clear(); this.stopWorkspace?.(); this.stopWorkspace = null; this.identityChanged(); this.state = initial();
      }
      this.identity = bootstrap.user?.id;
      const pref = preferencesFor(this.identity).snapshot();
      const projectId = bootstrap.projects.find((project) => project.id === (preferredProjectId || this.state.projectId || pref.project))?.id || bootstrap.projects[0]?.id || "";
      const agentId = bootstrap.agents.find((agent) => agent.instanceId === this.state.agentId)?.instanceId || bootstrap.agents.find((agent) => agent.providerId === bootstrap.edition.defaultProviderId)?.instanceId || bootstrap.agents[0]?.instanceId || "";
      const allowed = new Set(bootstrap.projects.map((project) => project.id));
      for (const [id, row] of this.known) if (!allowed.has(row.projectId)) this.known.delete(id);
      for (const [id, draft] of this.drafts) if (!allowed.has(draft.summary.projectId)) { this.drafts.delete(id); this.materialized.delete(id); }
      this.commit({ bootstrap, unauthorized: false, sidebarView: pref.sidebarView, sidebarOrder: pref.sidebarOrder });
      document.title = bootstrap.edition.displayName;
      if (!this.stopWorkspace && this.client.watchWorkspace) this.stopWorkspace = this.client.watchWorkspace(this.receive);
      void this.configure(agentId); await this.load(projectId, agentId, true); void this.loadAll();
    } catch (error) {
      if (!request.signal.aborted) {
        if (error instanceof HttpError && error.status === 401) this.authRequired();
        else this.commit({ loading: false, error: error instanceof Error ? error.message : "连接失败。" });
      }
    }
  };
  close() {
    this.bootstrapRequest?.abort(); this.catalogRequest?.abort(); this.globalRequest?.abort(); this.configurationRequest?.abort();
    this.stopWorkspace?.(); this.stopWorkspace = null; window.removeEventListener("lan-auth-required", this.authRequired);
    window.removeEventListener("focus", this.clearNotifications);
  }
  private configure(agentId: string) { this.configurationPending = this.readConfiguration(agentId); return this.configurationPending; }
  retryConfiguration = () => this.configure(this.state.agentId);
  private async readConfiguration(agentId: string) {
    this.configurationRequest?.abort(); const request = this.configurationRequest = new AbortController(); this.commit({ fields: [], configurationLoading: !!agentId && !!this.client.configuration, configurationError: "" });
    if (!agentId || !this.client.configuration) return;
    try { const fields = await this.client.configuration(agentId, request.signal); if (!request.signal.aborted) {
      this.commit({ fields, configurationLoading: false });
      const model = fields.find((field) => field.role === "model"), preferred = preferencesFor(this.identity).snapshot().defaultModel;
      for (const draft of this.drafts.values()) if (draft.summary.agentInstanceId === agentId) {
        if (model && preferred && !draft.modelEdited && !draft.inherited[model.key]) draft.settings[model.key] = preferred;
        draft.settings = this.draftDefaults(draft.settings);
      }
      if (this.state.selected?.draft) { this.remember([this.state.selected]); this.commit({}); }
    } }
    catch (error) { if (!request.signal.aborted) this.commit({ configurationLoading: false, configurationError: error instanceof Error ? error.message : "读取设置失败。" }); }
  }
  private draftDefaults(values: Record<string, string | number | boolean>) {
    const settings = { ...values };
    for (const field of this.state.fields) {
      if (!settings[field.key] && field.role === "model" && preferencesFor(this.identity).snapshot().defaultModel) settings[field.key] = preferencesFor(this.identity).snapshot().defaultModel;
      if (settings[field.key] === undefined && field.defaultValue !== undefined) settings[field.key] = field.defaultValue;
      if (field.kind === "choice" && field.choiceSource) {
        const source = String(settings[field.choiceSource.key]), choices = field.choiceSource.values[source];
        if (choices?.length && !choices.some((choice) => choice.value === settings[field.key])) settings[field.key] = field.choiceSource.defaults?.[source] || choices[0]!.value;
      }
    }
    return settings;
  }
  private selected(summary: ConversationSummary | null) {
    const current = this.state.selection;
    const same = summary && current?.conversationId === summary.id && current.projectId === summary.projectId && current.agentInstanceId === summary.agentInstanceId;
    return { selected: summary, selection: same ? current : summary ? selectionOf(summary) : null };
  }
  private async load(projectId: string, agentId: string, preserve = false) {
    this.catalogRequest?.abort(); const request = this.catalogRequest = new AbortController();
    const retained = preserve && this.state.selected?.projectId === projectId && this.state.selected.agentInstanceId === agentId ? this.state.selected : null;
    const catalog = this.state.projectId === projectId && this.state.agentId === agentId ? this.state.catalog : [...this.known.values()].filter((row) => row.projectId === projectId && row.agentInstanceId === agentId);
    this.commit({ projectId, agentId, catalog, nextCursor: null, loading: Boolean(projectId && agentId), ...this.selected(retained) });
    preferencesFor(this.identity).set("project", projectId);
    if (!projectId || !agentId) { this.commit({ loading: false }); return; }
    if (this.state.bootstrap?.projects.find((p) => p.id === projectId)?.available === false) { this.commit({ loading: false, error: "项目目录当前不可用，请恢复目录后刷新工作台。" }); return; }
    const baseline = new Map(this.known);
    try {
      const page = await this.client.list(projectId, agentId, null, request.signal, this.state.sidebarOrder); if (request.signal.aborted) return;
      this.remember([...page.conversations, ...(page.preferred ? [page.preferred] : [])], baseline);
      const desired = this.state.selected;
      const candidate = page.conversations.find((item) => item.id === desired?.id) || desired || page.preferred || [...page.conversations].sort((a, b) => activity(b) - activity(a))[0] || null;
      const selected = candidate ? { ...(this.known.get(candidate.id) || candidate), ...(!retained && !candidate.draft ? { accessedAt: new Date().toISOString() } : {}) } : null;
      if (selected) this.remember([selected]);
      const rows = selected && !this.state.catalog.some((row) => row.id === selected.id) ? [selected, ...this.state.catalog] : this.state.catalog;
      this.commit({ catalog: mergeCatalog(rows, page.conversations), nextCursor: page.nextCursor, loading: false, error: "", ...this.selected(selected) });
      if (!selected && this.client.create) await this.create(false);
    } catch (error) { if (!request.signal.aborted) this.commit({ loading: false, error: error instanceof Error ? error.message : "读取会话失败。" }); }
  }
  private async loadAll(append = false) {
    if (!this.client.listAll || !this.state.agentId) return;
    if (append && this.state.globalLoading) return;
    this.globalRequest?.abort(); const request = this.globalRequest = new AbortController();
    const order = this.state.sidebarView === "recent" ? this.state.sidebarOrder : "recent";
    const scope = JSON.stringify([this.state.agentId, order, this.state.bootstrap?.projects.map((project) => project.id)]);
    const expanded = this.globalScope === scope && this.globalExpanded;
    if (this.globalScope !== scope) this.globalExpanded = false;
    this.globalScope = scope;
    this.commit({ globalLoading: true, globalError: "" });
    const baseline = new Map(this.known);
    try {
      let cursor = append ? this.state.globalCursor : null, page: CatalogPage;
      do { page = await this.client.listAll(this.state.agentId, cursor, request.signal, order); cursor = page.nextCursor; } while (!page.conversations.length && cursor && !request.signal.aborted);
      if (request.signal.aborted) return;
      this.remember(page.conversations, baseline);
      const previous = this.state.globalCatalog.filter((row) => row.agentInstanceId === this.state.agentId);
      const rows = mergeCatalog(previous, page.conversations, append);
      this.globalExpanded = append || expanded;
      this.commit({ globalCatalog: rows, globalCursor: !append && expanded ? this.state.globalCursor : cursor, globalLoading: false, globalError: "" });
    } catch (error) { if (!request.signal.aborted) this.commit({ globalLoading: false, globalError: error instanceof Error ? error.message : "读取最近对话失败。" }); }
  }
  navigation = (view?: "projects" | "recent", order?: "original" | "recent") => {
    const pref = preferencesFor(this.identity);
    if (view) pref.set("sidebarView", view); if (order) pref.set("sidebarOrder", order);
    this.commit({ ...(view ? { sidebarView: view } : {}), ...(order ? { sidebarOrder: order } : {}) });
    if (order) void this.load(this.state.projectId, this.state.agentId, true);
    if (this.state.sidebarView === "recent") void this.loadAll();
  };
  project = (projectId: string) => void this.load(projectId, this.state.agentId, this.state.projectId === projectId);
  agent = (agentId: string) => { void this.configure(agentId); void this.load(this.state.projectId, agentId); void this.loadAll(); };
  select = (summary: ConversationSummary) => {
    const touched = { ...summary, accessedAt: new Date().toISOString() }; this.remember([touched]);
    if (summary.projectId !== this.state.projectId || summary.agentInstanceId !== this.state.agentId) {
      this.commit({ ...this.selected(touched) });
      void this.configure(summary.agentInstanceId); void this.load(summary.projectId, summary.agentInstanceId, true);
    } else this.commit(this.selected(touched));
  };
  more = async () => {
    if (this.state.sidebarView === "recent") return this.loadAll(true);
    const { projectId, agentId, nextCursor } = this.state; if (!nextCursor || this.state.loading) return;
    this.catalogRequest?.abort(); const request = this.catalogRequest = new AbortController(); this.commit({ loading: true });
    const baseline = new Map(this.known);
    try { const page = await this.client.list(projectId, agentId, nextCursor, request.signal, this.state.sidebarOrder); if (!request.signal.aborted) { this.remember(page.conversations, baseline); this.commit({ catalog: mergeCatalog(this.state.catalog, page.conversations, true), nextCursor: page.nextCursor, loading: false }); } }
    catch (error) { if (!request.signal.aborted) this.commit({ loading: false, error: error instanceof Error ? error.message : "读取失败。" }); }
  };
  create = async (focusPrompt = true) => {
    const { projectId, agentId, selected } = this.state; if (!projectId || !agentId || !this.client.create || this.state.bootstrap?.projects.find((p) => p.id === projectId)?.available === false) return;
    const existing = [...this.drafts.values()].find(({ summary }) => summary.projectId === projectId && summary.agentInstanceId === agentId);
    if (existing && (existing.settingsEdited || selected?.id === existing.summary.id)) {
      this.commit({ focusDraftId: focusPrompt ? existing.summary.id : "", focusRequest: this.state.focusRequest + (focusPrompt ? 1 : 0) });
      this.add(this.known.get(existing.summary.id) || existing.summary);
      return;
    }
    const summary: ConversationSummary = existing?.summary || { id: "local-" + uiId(), title: "未命名聊天", projectId, agentInstanceId: agentId, status: "idle", draft: true, accessedAt: new Date().toISOString() };
    const inherited = selected?.projectId === projectId ? this.currentSettings(selected.id) : {};
    const settings = Object.keys(inherited).length ? { ...inherited } : { ...this.state.bootstrap?.projects.find((project) => project.id === projectId)?.settings?.[agentId] };
    const model = this.state.fields.find((field) => field.role === "model");
    if (model && !inherited[model.key] && preferencesFor(this.identity).snapshot().defaultModel) settings[model.key] = preferencesFor(this.identity).snapshot().defaultModel;
    this.drafts.set(summary.id, { summary, inherited, modelEdited: false, settingsEdited: false, settings: this.draftDefaults(settings) });
    this.commit({ focusDraftId: focusPrompt ? summary.id : "", focusRequest: this.state.focusRequest + (focusPrompt ? 1 : 0) }); this.add(summary);
  };
  draftControls(id: string): ConversationControls | null {
    const draft = this.drafts.get(id); return draft ? { conversationId: id, writable: true, status: "idle", activeRunId: null, queue: [], queueCount: 0, queueRevision: 0, questions: [], approvals: [], answered: [], goal: null, settings: draft.settings } : null;
  }
  updateDraft(id: string, values: Record<string, string | number | boolean>) { const draft = this.drafts.get(id); if (!draft) return null; draft.settingsEdited = true; if (this.state.fields.some((field) => field.role === "model" && Object.hasOwn(values, field.key))) draft.modelEdited = true; draft.settings = this.draftDefaults({ ...draft.settings, ...values }); return this.draftControls(id); }
  async materialize(id: string) {
    if (this.materialized.has(id)) return selectionOf(this.materialized.get(id)!);
    const draft = this.drafts.get(id); if (!draft || !this.client.create) throw new Error("草稿会话已失效。");
    const scope = this.scope;
    await this.configurationPending;
    if (scope !== this.scope || !this.drafts.has(id)) throw new Error("账号或项目访问权限已变化，草稿操作已结束。");
    draft.settings = this.draftDefaults(draft.settings);
    if (!this.creating.has(id)) this.creating.set(id, this.client.create(draft.summary.projectId, draft.summary.agentInstanceId, new AbortController().signal, { settings: draft.settings }).then((summary) => { if (scope !== this.scope) throw new Error("账号已切换，原草稿操作已结束。"); this.materialized.set(id, summary); return summary; }).finally(() => this.creating.delete(id)));
    return selectionOf(await this.creating.get(id)!);
  }
  materializedId(id: string) { return this.materialized.get(id)?.id; }
  activateDraft(id: string) {
    const real = this.materialized.get(id); if (!real) return null;
    const summary = { ...real, ...this.known.get(real.id), accessedAt: this.known.get(id)?.accessedAt || new Date().toISOString() };
    this.drafts.delete(id); this.known.delete(id); this.materialized.delete(id);
    const catalogs = this.include(summary);
    this.commit({ catalog: catalogs.catalog.filter((item) => item.id !== id), globalCatalog: catalogs.globalCatalog.filter((item) => item.id !== id),
      ...(this.state.selected?.id === id ? this.selected(summary) : {}) }); return real.id;
  }
  add(summary: ConversationSummary) { this.commit({ ...this.include(summary), ...this.selected(summary) }); }
  remove(id: string) {
    const wasSelected = this.state.selected?.id === id;
    this.known.delete(id); this.drafts.delete(id); this.materialized.delete(id);
    const catalog = this.state.catalog.filter((item) => item.id !== id);
    this.commit({ catalog, globalCatalog: this.state.globalCatalog.filter((item) => item.id !== id), active: this.state.active.filter((item) => item.id !== id), ...(this.state.selected?.id === id ? this.selected(catalog[0] || null) : {}) });
    if (wasSelected && !catalog.length && this.client.create) void this.create(false);
  }
  rename(id: string, title: string) {
    const row = this.known.get(id); if (row) this.remember([{ ...row, title }]);
    if (this.drafts.has(id)) this.drafts.get(id)!.summary = { ...this.drafts.get(id)!.summary, title };
    this.commit({});
  }
  user(user: User) { if (this.state.bootstrap) this.commit({ bootstrap: { ...this.state.bootstrap, user } }); }
  loggedOut() { this.authRequired(); }
  private receive = (event: WorkspaceUpdate) => {
    if (event.kind === "snapshot" && event.projects && this.state.bootstrap) {
      const allowed = new Set(event.projects.map((project) => project.id));
      for (const [id, row] of this.known) if (!allowed.has(row.projectId)) this.known.delete(id);
      for (const [id, draft] of this.drafts) if (!allowed.has(draft.summary.projectId)) { this.drafts.delete(id); this.materialized.delete(id); }
      const projects = event.projects.map((project) => ({ ...this.state.bootstrap?.projects.find((previous) => previous.id === project.id), ...project }));
      this.commit({ bootstrap: { ...this.state.bootstrap, projects }, globalCatalog: this.state.globalCatalog.filter((item) => allowed.has(item.projectId)) });
      if (this.state.projectId && !allowed.has(this.state.projectId)) { this.commit({ active: [] }); void this.load(event.projects[0]?.id || "", this.state.agentId); return; }
    }
    if (event.kind === "removed") { this.remove(event.conversation.id); return; }
    const values = event.kind === "snapshot" ? event.conversations : [event.conversation];
    for (const row of values) {
      const completion = row.completion;
      if (!completion || this.completions.get(row.id) === completion.id) continue;
      this.completions.set(row.id, completion.id);
      if (event.kind !== "snapshot" && document.hidden && preferencesFor(this.identity).snapshot().completionNotifications) {
        document.title = `(${++this.backgroundCount}) ${this.state.bootstrap?.edition.displayName || "LAN"}`;
        if ("Notification" in window && Notification.permission === "granted") try { const n = new Notification(completion.status === "failed" ? "任务执行失败" : completion.status === "interrupted" ? "任务已停止" : "任务已完成", { body: [this.state.bootstrap?.projects.find((p) => p.id === row.projectId)?.name, row.title].filter(Boolean).join(" · "), tag: "lan-run-" + completion.id }); n.onclick = () => { window.focus(); n.close(); }; } catch {}
      }
    }
    const catalogs = event.kind === "created" ? this.include(event.conversation) : {};
    if (event.kind !== "created") this.remember(values);
    const active = new Map((event.kind === "snapshot" ? [] : this.state.active).map((item) => [item.id, item]));
    for (const row of values) { if (row.status === "running" || row.goalStatus === "active" || (row.queueCount || 0) > 0) active.set(row.id, this.known.get(row.id)!); else active.delete(row.id); }
    this.commit({ ...catalogs, active: [...active.values()] });
  };
}
