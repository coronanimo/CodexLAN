import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { WorkspaceStore } from "../server/workspace-store.mjs";

test("repairs a legacy member project path without dropping its thread binding", async () => {
  const root = await mkdtemp(join(tmpdir(), "codexlan-member-project-"));
  const dataRoot = join(root, "data");
  const workspace = join(root, "workspace");
  const target = join(workspace, "li", "默认项目");
  const stateFile = join(dataRoot, "workspace-state.json");
  const now = new Date().toISOString();
  try {
    await Promise.all([mkdir(dataRoot), mkdir(target, { recursive: true })]);
    await writeFile(stateFile, `${JSON.stringify({
      version: 13,
      projects: [{
        id: "11111111-1111-4111-8111-111111111111",
        name: "默认项目",
        path: workspace,
        settings: {},
        createdAt: now,
        updatedAt: now,
        ownerId: "22222222-2222-4222-8222-222222222222",
      }],
      queues: {},
      queueRevisions: {},
      threadSettings: {},
      turnMetrics: {},
      users: [{
        id: "22222222-2222-4222-8222-222222222222",
        username: "li",
        displayName: "Li",
        role: "member",
        active: true,
        mustChangePassword: false,
        passwordSalt: Buffer.alloc(16).toString("base64"),
        passwordHash: Buffer.alloc(64).toString("base64"),
        createdAt: now,
        updatedAt: now,
      }],
      threadProjects: { "33333333-3333-4333-8333-333333333333": "11111111-1111-4111-8111-111111111111" },
      threadAccesses: {},
      sessions: {},
    }, null, 2)}\n`, "utf8");

    const store = new WorkspaceStore({ dataRoot, stateFile, workspace });
    await store.ready;
    const [project] = await store.listProjects("22222222-2222-4222-8222-222222222222");
    assert.equal(project.path, target);
    assert.deepEqual(store.threadIdsForProject(project.id), ["33333333-3333-4333-8333-333333333333"]);
    const persisted = JSON.parse(await readFile(stateFile, "utf8"));
    assert.equal(persisted.projects[0].path, target);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
