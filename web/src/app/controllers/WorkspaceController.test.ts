// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import type { ReadClient, WorkspaceUpdate } from "@lan/read-api";
import { WorkspaceController } from "./WorkspaceController";
import { preferencesFor } from "./Preferences";
import type { AgentSetting } from "@lan/agent-contract";

it("keeps manually chosen draft settings and still inherits the selected chat for untouched drafts", async () => {
  const saved = { id: "saved", projectId: "p", agentInstanceId: "a", title: "Saved" };
  const currentSettings = vi.fn(() => ({ "provider.model": "inherited" }));
  const client = { bootstrap: async () => ({ user: { id: "draft-settings-preservation" }, edition: { defaultProviderId: "provider" }, agents: [{ instanceId: "a", providerId: "provider" }], projects: [{ id: "p", available: true }] }),
    list: async () => ({ conversations: [saved], nextCursor: null }), create: vi.fn() } as unknown as ReadClient;
  const workspace = new WorkspaceController(client, () => {}, currentSettings); await workspace.start();
  await workspace.create(); const id = workspace.snapshot().selected!.id;
  workspace.select(saved); currentSettings.mockReturnValue({ "provider.model": "latest-inherited" });
  await workspace.create();
  expect(workspace.snapshot().selected!.id).toBe(id);
  expect(workspace.draftControls(id)!.settings["provider.model"]).toBe("latest-inherited");
  workspace.updateDraft(id, { "provider.model": "chosen", "provider.effort": "high" });
  workspace.select(saved); await workspace.create();
  expect(workspace.draftControls(id)!.settings).toMatchObject({ "provider.model": "chosen", "provider.effort": "high" });
  expect(client.create).not.toHaveBeenCalled(); workspace.close();
});

it('keeps model configuration errors visible when catalog loading succeeds and permits retry', async () => {
  const configuration = vi.fn().mockRejectedValueOnce(new Error('model list failed')).mockResolvedValue([{ key: 'provider.model', role: 'model', kind: 'choice', choices: [] }]);
  const client = { bootstrap: async () => ({ edition: { displayName: 'LAN', defaultProviderId: 'provider' }, agents: [{ instanceId: 'a', providerId: 'provider' }], projects: [{ id: 'p', available: true }] }), configuration,
    list: async () => ({ conversations: [{ id: 'c', projectId: 'p', agentInstanceId: 'a', title: 'chat' }], nextCursor: null }) } as unknown as ReadClient;
  const workspace = new WorkspaceController(client); await workspace.start();
  expect(workspace.snapshot().configurationError).toBe('model list failed');
  expect(workspace.snapshot().loading).toBe(false);
  await workspace.retryConfiguration();
  expect(workspace.snapshot().configurationError).toBe(''); expect(workspace.snapshot().fields).toHaveLength(1);
  workspace.close();
});

it("metadata patches preserve catalog position and selected identity; revoked scopes are evicted", async () => {
  let receive!: (event: WorkspaceUpdate) => void;
  const client = { bootstrap: async () => ({ version: 1, edition: { id: "lan", displayName: "LAN", defaultProviderId: "agent" }, agents: [{ instanceId: "agent", providerId: "agent" }],
    projects: [{ id: "p", name: "Project", available: true }] }),
    list: vi.fn(async () => ({ conversations: [{ id: "new", projectId: "p", agentInstanceId: "agent", title: "New" }, { id: "old", projectId: "p", agentInstanceId: "agent", title: "Old" }], nextCursor: null })),
    watchWorkspace: (fn: typeof receive) => { receive = fn; return () => {}; },
  } as unknown as ReadClient;
  const workspace = new WorkspaceController(client); await workspace.start();
  const selection = workspace.snapshot().selection;
  receive({ kind: "changed", conversation: { id: "old", projectId: "p", agentInstanceId: "agent", title: "Old now running", status: "running" } });
  expect(workspace.snapshot().catalog.map((item) => item.id)).toEqual(["new", "old"]);
  expect(workspace.snapshot().selection).toBe(selection); expect(client.list).toHaveBeenCalledTimes(1);
  receive({ kind: "snapshot", conversations: [], projects: [] });
  expect(workspace.snapshot().selection).toBeNull(); expect(workspace.snapshot().catalog).toEqual([]); workspace.close();
});

it("retains project settings and browser model preference when configuration arrives after an empty-project draft", async () => {
  preferencesFor("late-config-user").set("defaultModel", "preferred");
  let resolve!: (fields: AgentSetting[]) => void;
  const configuration = new Promise<AgentSetting[]>((done) => { resolve = done; });
  const create = vi.fn<NonNullable<ReadClient["create"]>>(async () => ({ id: "native", projectId: "p", agentInstanceId: "a", title: "New" }));
  const client = { bootstrap: async () => ({ user: { id: "late-config-user" }, edition: { defaultProviderId: "provider" }, agents: [{ instanceId: "a", providerId: "provider" }], projects: [{ id: "p", available: true, settings: { a: { "provider.model": "configured", "provider.summary": "detailed" } } }] }),
    list: async () => ({ conversations: [], nextCursor: null }), configuration: () => configuration, create } as unknown as ReadClient;
  const workspace = new WorkspaceController(client); await workspace.start(); const draft = workspace.snapshot().selected!;
  expect(workspace.snapshot().focusRequest).toBe(0); expect(create).not.toHaveBeenCalled();
  const native = workspace.materialize(draft.id); expect(create).not.toHaveBeenCalled();
  resolve([{ key: "provider.model", label: "模型", role: "model", kind: "choice", choices: [{ value: "preferred", label: "Preferred" }], defaultValue: "configured" },
    { key: "provider.effort", label: "推理", kind: "choice", choices: [{ value: "medium", label: "中" }], defaultValue: "medium" }]);
  await native;
  expect(create.mock.calls[0]![3]).toEqual({ settings: { "provider.model": "preferred", "provider.summary": "detailed", "provider.effort": "medium" } });
  workspace.close();
});

it("restores user navigation and preferred conversation; lazy drafts inherit settings and materialize once", async () => {
  const pref = preferencesFor("navigation-user"); pref.set("project", "b"); pref.set("sidebarView", "recent"); pref.set("sidebarOrder", "recent");
  const selected = { id: "saved", projectId: "b", agentInstanceId: "agent", title: "Saved" };
  const create = vi.fn(async () => ({ ...selected, id: "real-draft" }));
  const client = { bootstrap: async () => ({ version: 1, user: { id: "navigation-user" }, edition: { defaultProviderId: "p" }, agents: [{ instanceId: "agent", providerId: "p" }], projects: [{ id: "a", available: true }, { id: "b", available: true }] }),
    list: vi.fn(async () => ({ conversations: [{ ...selected, id: "newest-created" }], preferred: selected, nextCursor: null })),
    listAll: vi.fn(async () => ({ conversations: [selected], nextCursor: null })), create,
  } as unknown as ReadClient;
  const workspace = new WorkspaceController(client, () => {}, () => ({ "provider.model": "chosen", "provider.effort": "high" }));
  await workspace.start();
  expect(workspace.snapshot().projectId).toBe("b"); expect(workspace.snapshot().selected?.id).toBe("saved"); expect(workspace.snapshot().sidebarView).toBe("recent");
  const selection = workspace.snapshot().selection;
  workspace.navigation("projects"); expect(workspace.snapshot().selection).toBe(selection);
  await workspace.create(); const draft = workspace.snapshot().selected!;
  expect(draft.draft).toBe(true); expect(create).not.toHaveBeenCalled();
  expect(workspace.draftControls(draft.id)?.settings).toEqual({ "provider.model": "chosen", "provider.effort": "high" });
  const [first, second] = await Promise.all([workspace.materialize(draft.id), workspace.materialize(draft.id)]);
  expect(first).toEqual(second); expect(create).toHaveBeenCalledTimes(1);
  workspace.activateDraft(draft.id); expect(workspace.snapshot().selected?.id).toBe("real-draft"); expect(workspace.snapshot().catalog.some((row) => row.draft)).toBe(false);
  workspace.close();
});

it("keeps unsent chats in project and recent lists, then replaces the draft with one native chat", async () => {
  const summary = (projectId: string) => ({ id: projectId + "-saved", projectId, agentInstanceId: "agent", title: "Saved" });
  const client = { bootstrap: async () => ({ edition: { defaultProviderId: "p" }, agents: [{ instanceId: "agent", providerId: "p" }], projects: [{ id: "a", available: true }, { id: "b", available: true }] }),
    list: async (projectId: string) => ({ conversations: [summary(projectId)], nextCursor: null }),
    listAll: async () => ({ conversations: [summary("a"), summary("b")], nextCursor: null }),
    create: vi.fn(async () => ({ ...summary("a"), id: "real" })),
  } as unknown as ReadClient;
  const workspace = new WorkspaceController(client); await workspace.start(); await workspace.create(); const draft = workspace.snapshot().selected!;
  workspace.navigation("recent"); await vi.waitFor(() => expect(workspace.snapshot().globalLoading).toBe(false));
  expect(workspace.snapshot().globalCatalog.some((row) => row.id === draft.id)).toBe(true);
  workspace.project("b"); await vi.waitFor(() => expect(workspace.snapshot().loading).toBe(false));
  workspace.project("a"); await vi.waitFor(() => expect(workspace.snapshot().catalog.some((row) => row.id === draft.id)).toBe(true));
  workspace.select(draft); await workspace.materialize(draft.id); workspace.activateDraft(draft.id);
  expect(workspace.snapshot().globalCatalog.filter((row) => row.id === "real")).toHaveLength(1);
  expect(workspace.snapshot().globalCatalog.some((row) => row.id === draft.id)).toBe(false); workspace.close();
});

it("keeps visited chats ahead of unvisited updates and retains expanded cross-project pages on refresh", async () => {
  const row = (id: string, accessedAt?: string, updatedAt = 0) => ({ id, accessedAt, updatedAt, projectId: "p", agentInstanceId: "agent", title: id });
  const visited = row("visited", "2026-01-01T00:00:00Z"), unvisited = row("unvisited", undefined, 2_000_000_000), older = row("older");
  const listAll = vi.fn(async (_agent: string, cursor: string | null) => ({ conversations: cursor ? [older] : [unvisited, visited], nextCursor: cursor ? null : "page-2" }));
  const client = { bootstrap: async () => ({ edition: { displayName: "LAN", defaultProviderId: "p" }, agents: [{ instanceId: "agent", providerId: "p" }], projects: [{ id: "p", available: true }] }), list: async () => ({ conversations: [visited], nextCursor: null }), listAll } as unknown as ReadClient;
  const workspace = new WorkspaceController(client); await workspace.start();
  workspace.navigation("recent"); await vi.waitFor(() => expect(workspace.snapshot().globalLoading).toBe(false));
  expect(workspace.snapshot().recent[0]?.id).toBe("visited");
  await workspace.more(); expect(workspace.snapshot().globalCatalog.map((item) => item.id)).toContain("older");
  workspace.select(older); workspace.navigation("recent");
  await vi.waitFor(() => expect(workspace.snapshot().globalLoading).toBe(false));
  expect(workspace.snapshot().globalCatalog.map((item) => item.id)).toContain("older");
  expect(workspace.snapshot().recent[0]?.id).toBe("older");
  expect(workspace.snapshot().globalCursor).toBeNull(); workspace.close();
});

it("inserts created events in both catalogs and preserves them before the provider list catches up", async () => {
  let receive!: (event: WorkspaceUpdate) => void;
  const saved = { id: "saved", projectId: "p", agentInstanceId: "agent", title: "Saved" };
  const created = { ...saved, id: "created", title: "New chat" };
  let globalRows = [saved];
  const client = { bootstrap: async () => ({ user: { id: "created-catalog-user" }, edition: { defaultProviderId: "provider" }, agents: [{ instanceId: "agent", providerId: "provider" }], projects: [{ id: "p", available: true }, { id: "other", available: true }] }),
    list: async (projectId: string) => ({ conversations: projectId === "p" ? [saved] : [], nextCursor: null }),
    listAll: async () => ({ conversations: globalRows, nextCursor: null }),
    watchWorkspace: (fn: typeof receive) => { receive = fn; return () => {}; },
  } as unknown as ReadClient;
  const workspace = new WorkspaceController(client); await workspace.start();
  await vi.waitFor(() => expect(workspace.snapshot().globalLoading).toBe(false));
  const selection = workspace.snapshot().selection;
  receive({ kind: "created", conversation: created });
  expect(workspace.snapshot().catalog.map((row) => row.id)).toEqual(["created", "saved"]);
  expect(workspace.snapshot().globalCatalog.map((row) => row.id)).toEqual(["created", "saved"]);
  expect(workspace.snapshot().selection).toBe(selection);
  receive({ kind: "created", conversation: created });
  receive({ kind: "changed", conversation: { ...created, title: "Updated title", status: "running" } });
  globalRows = [{ ...saved, id: "indexed" }, saved];
  workspace.navigation("recent");
  await vi.waitFor(() => expect(workspace.snapshot().globalLoading).toBe(false));
  expect(workspace.snapshot().globalCatalog.map((row) => row.id)).toEqual(["created", "indexed", "saved"]);
  expect(workspace.snapshot().globalCatalog.filter((row) => row.id === created.id)).toEqual([{ ...created, title: "Updated title", status: "running" }]);
  workspace.project("other"); await vi.waitFor(() => expect(workspace.snapshot().loading).toBe(false));
  expect(workspace.snapshot().catalog).toEqual([]);
  workspace.project("p"); await vi.waitFor(() => expect(workspace.snapshot().loading).toBe(false));
  expect(workspace.snapshot().catalog.map((row) => row.id)).toEqual(["created", "saved", "indexed"]);
  receive({ kind: "removed", conversation: created });
  workspace.navigation("recent"); await vi.waitFor(() => expect(workspace.snapshot().globalLoading).toBe(false));
  expect(workspace.snapshot().globalCatalog.some((row) => row.id === created.id)).toBe(false);
  workspace.close();
});

it("keeps a submitted draft in both catalogs across stale list responses and preserves its visit", async () => {
  const saved = { id: "saved", projectId: "p", agentInstanceId: "agent", title: "Saved", accessedAt: "2026-01-01T00:00:00Z" };
  let resolveList!: (page: { conversations: typeof saved[]; nextCursor: null }) => void;
  const listAll = vi.fn(async () => ({ conversations: [saved], nextCursor: null as string | null }));
  const client = { bootstrap: async () => ({ user: { id: "submitted-catalog-user" }, edition: { defaultProviderId: "provider" }, agents: [{ instanceId: "agent", providerId: "provider" }], projects: [{ id: "p", available: true }, { id: "other", available: true }] }),
    list: async (projectId: string) => ({ conversations: projectId === "p" ? [saved] : [], nextCursor: null }), listAll,
    create: async () => ({ id: "real", projectId: "p", agentInstanceId: "agent", title: "New chat" }),
  } as unknown as ReadClient;
  const workspace = new WorkspaceController(client); await workspace.start();
  await vi.waitFor(() => expect(workspace.snapshot().globalLoading).toBe(false));
  await workspace.create(); const draft = workspace.snapshot().selected!;
  listAll.mockImplementationOnce(() => new Promise((resolve) => { resolveList = resolve; }));
  workspace.navigation("recent");
  await workspace.materialize(draft.id); workspace.activateDraft(draft.id);
  resolveList({ conversations: [saved], nextCursor: null });
  await vi.waitFor(() => expect(workspace.snapshot().globalLoading).toBe(false));
  expect(workspace.snapshot().globalCatalog.map((row) => row.id)).toEqual(["real", "saved"]);
  expect(workspace.snapshot().recent[0]?.id).toBe("real");
  workspace.project("other"); await vi.waitFor(() => expect(workspace.snapshot().loading).toBe(false));
  workspace.project("p"); await vi.waitFor(() => expect(workspace.snapshot().loading).toBe(false));
  expect(workspace.snapshot().catalog.map((row) => row.id)).toEqual(["real", "saved"]);
  workspace.close();
});

it("does not roll back metadata or resurrect a removed chat when an older catalog request finishes", async () => {
  let receive!: (event: WorkspaceUpdate) => void;
  const row = (id: string) => ({ id, projectId: "p", agentInstanceId: "agent", title: id });
  const rows = [row("kept"), row("removed")];
  let resolveList!: (page: { conversations: typeof rows; nextCursor: null }) => void;
  const listAll = vi.fn(async () => ({ conversations: rows, nextCursor: null }));
  const client = { bootstrap: async () => ({ user: { id: "stale-catalog-user" }, edition: { defaultProviderId: "provider" }, agents: [{ instanceId: "agent", providerId: "provider" }], projects: [{ id: "p", available: true }] }),
    list: async () => ({ conversations: rows, nextCursor: null }), listAll,
    watchWorkspace: (fn: typeof receive) => { receive = fn; return () => {}; },
  } as unknown as ReadClient;
  const workspace = new WorkspaceController(client); await workspace.start();
  await vi.waitFor(() => expect(workspace.snapshot().globalLoading).toBe(false));
  listAll.mockImplementationOnce(() => new Promise((resolve) => { resolveList = resolve; }));
  workspace.navigation("recent");
  receive({ kind: "changed", conversation: { ...row("kept"), title: "Latest title", status: "running" } });
  receive({ kind: "removed", conversation: row("removed") });
  resolveList({ conversations: rows, nextCursor: null });
  await vi.waitFor(() => expect(workspace.snapshot().globalLoading).toBe(false));
  for (const catalog of [workspace.snapshot().catalog, workspace.snapshot().globalCatalog]) {
    expect(catalog.map((item) => item.id)).toEqual(["kept"]);
    expect(catalog[0]).toMatchObject({ title: "Latest title", status: "running" });
  }
  workspace.close();
});

it("preserves names across title-less status snapshots and still accepts every explicit rename", async () => {
  let receive!: (event: WorkspaceUpdate) => void;
  const saved = { id: "named", projectId: "p", agentInstanceId: "agent", title: "Existing title" };
  const client = { bootstrap: async () => ({ user: { id: "metadata-title-user" }, edition: { defaultProviderId: "provider" }, agents: [{ instanceId: "agent", providerId: "provider" }], projects: [{ id: "p", available: true }] }),
    list: async () => ({ conversations: [saved], nextCursor: null }), listAll: async () => ({ conversations: [saved], nextCursor: null }),
    watchWorkspace: (fn: typeof receive) => { receive = fn; return () => {}; },
  } as unknown as ReadClient;
  const workspace = new WorkspaceController(client); await workspace.start();
  await vi.waitFor(() => expect(workspace.snapshot().globalLoading).toBe(false));
  const selection = workspace.snapshot().selection;
  const { title: _title, ...identity } = saved;
  receive({ kind: "changed", conversation: { ...identity, status: "running" } });
  receive({ kind: "snapshot", conversations: [{ ...identity, status: "idle" }] });
  for (const rows of [workspace.snapshot().catalog, workspace.snapshot().globalCatalog, workspace.snapshot().recent]) expect(rows[0]?.title).toBe("Existing title");
  expect(workspace.snapshot().selection).toBe(selection);
  receive({ kind: "changed", conversation: { ...identity, title: "未命名聊天" } });
  expect(workspace.snapshot().selected?.title).toBe("未命名聊天");
  receive({ kind: "changed", conversation: { ...identity, title: "New explicit title" } });
  expect(workspace.snapshot().selected?.title).toBe("New explicit title");
  workspace.close();
});
