// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import type { ReadClient, WorkspaceUpdate } from "@lan/read-api";
import { WorkspaceController } from "./WorkspaceController";

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
