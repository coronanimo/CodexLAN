import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WorkspaceStore } from "../server/workspace-store.mjs";
import { canonicalFilePath, localFileDownloadUrl } from "../shared/content-files.mjs";
import { messagePresentation } from "../server/agents/codex/protocol-values.mjs";

let sqlite;
try { sqlite = await import("node:sqlite"); } catch {}

test("official data relocation preserves users, grants, queue order, settings and recovery", { skip: !sqlite }, async () => {
  const root = await mkdtemp(join(tmpdir(), "codexlan-formal-")), oldHome = join(root, ".codexlan-preview"), newHome = join(root, ".codexlan");
  await mkdir(oldHome); const workspace = join(oldHome, "projects"); await mkdir(workspace);
  const options = { dataRoot: oldHome, stateFile: join(oldHome, "state.json"), workspace, legacyJsonMirror: false };
  const store = new WorkspaceStore(options); await store.ready;
  const user = await store.createFirstAdmin({ username: "owner", password: "test-password-123", displayName: "Owner" });
  const project = (await store.listProjects(user.id))[0];
  const id = "33333333-3333-4333-8333-333333333333";
  await store.setThreadProject(id, project.id); await store.setThreadSettings(id, { model: "model", effort: "high" });
  const path = join(oldHome, "attachments", "file.txt"); await writeFile(path, "file").catch(async () => { await mkdir(join(oldHome, "attachments")); await writeFile(path, "file"); });
  await store.enqueue(id, project.id, "first", [{ id: "opaque", path, name: "file.txt", size: 4 }]);
  await store.enqueue(id, project.id, "second");
  await store.recordItemMetric(id, "r", "cmd", { type: "commandExecution", snapshot: { id: "cmd", type: "commandExecution", command: "work", cwd: oldHome, status: "inProgress", aggregatedOutput: "unique recovery" } });
  const expected = structuredClone(store.snapshot()); store.close();
  expected.projects[0].path = join(newHome, "projects", "默认项目");
  expected.queues[id][0].attachments[0].path = join(newHome, "attachments", "file.txt");
  expected.turnMetrics[id].r.items.cmd.snapshot.cwd = newHome;
  const { relocateState } = await import("../scripts/formalize-state.mjs");
  relocateState(join(oldHome, "workspace-state.sqlite"), oldHome, newHome);
  const db = new sqlite.DatabaseSync(join(oldHome, "workspace-state.sqlite"));
  const { WorkspaceDatabase } = await import("../server/workspace-database.mjs");
  try { assert.deepEqual(new WorkspaceDatabase(db, "unused").read(), expected); } finally { db.close(); }
});

test("saved attachment references resolve to the official home without duplicate image cards", () => {
  const old = "C:/Users/owner/.codexlan-preview/attachments/project/image.png";
  const current = "C:/Users/owner/.codexlan/attachments/project/image.png";
  assert.equal(canonicalFilePath(old), current);
  assert.equal(canonicalFilePath("D:/Code/react/project.png"), "D:/Code/react/project.png");
  assert.ok(decodeURIComponent(localFileDownloadUrl({ projects: [], projectId: "p", role: "member", path: old })).includes(current));
  const row = messagePresentation({ type: "userMessage", content: [{ type: "text", text: `[image](${old})` }, { type: "localImage", path: old }] });
  assert.equal(row.files.length, 1);
});
