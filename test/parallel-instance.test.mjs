import assert from "node:assert/strict";
import test from "node:test";
import { fixtureService } from "./fixtures/lan-service.mjs";

test("normal React mode reads and operates existing conversations after a cold native start", async (t) => {
  const f = await fixtureService(t, { CODEX_TEST_REQUIRE_LOADED: "1", CODEX_TEST_METADATA_REQUIRES_LOADED: "1", CODEX_TEST_SEED_CONTENT: "1", CODEX_TEST_SEED_COUNT: "4" }, { seed: true });
  const projectId = f.bootstrap.projects[0].id;
  assert.equal(f.bootstrap.parallel, false);
  const catalog = await f.request(`/api/lan/projects/${projectId}/conversations`, f.admin);
  assert.equal(catalog.status, 200, f.errors());
  const ids = catalog.body.conversations.map((row) => row.id);
  const command = (id, command) => f.request(`/api/lan/conversations/${id}/commands`, { ...f.admin, method: "POST", body: { projectId, command } });
  assert.equal((await command(ids[0], { type: "rename", name: "Existing writable chat" })).status, 200, f.errors());
  assert.equal((await command(ids[1], { type: "goal", patch: { objective: "Retain the existing goal", status: "paused" } })).status, 200, f.errors());
  const id = ids.at(-1);
  const [history, controls] = await Promise.all([
    f.request(`/api/lan/conversations/${id}/history?projectId=${projectId}`, f.admin),
    f.request(`/api/lan/conversations/${id}/controls?projectId=${projectId}`, f.admin),
  ]);
  assert.equal(history.status, 200, f.errors()); assert.ok(history.body.rows.some((row) => row.kind === "assistant"));
  assert.equal(controls.status, 200, f.errors()); assert.equal(controls.body.writable, true);
  assert.equal(controls.body.activeRunId, null, "reading must not start a turn");
  const submit = await command(id, { type: "submit", text: "continue existing fixture conversation" });
  assert.equal(submit.status, 200, f.errors());
});

test("unloaded historical conversations stay readable without starting tasks", async (t) => {
  const f = await fixtureService(t, { CODEX_TEST_REQUIRE_LOADED: "1", CODEX_TEST_DENY_RESUME: "1", CODEX_TEST_SEED_CONTENT: "1" }, { parallel: true }), projectId = f.bootstrap.projects[0].id;
  const catalog = await f.request(`/api/lan/projects/${projectId}/conversations`, f.admin);
  assert.equal(catalog.status, 200);
  const id = catalog.body.conversations[0].id;
  const history = await f.request(`/api/lan/conversations/${id}/history?projectId=${projectId}`, f.admin);
  assert.equal(history.status, 200, f.errors()); assert.ok(history.body.rows.some((row) => row.kind === "assistant"));
  const controls = await f.request(`/api/lan/conversations/${id}/controls?projectId=${projectId}`, f.admin);
  assert.equal(controls.status, 200); assert.equal(controls.body.writable, false);
  const diff = history.body.rows.find((row) => row.preview === "diff");
  const detail = await f.request(`/api/lan/conversations/${id}/details?projectId=${projectId}&ref=${encodeURIComponent(diff.detailId)}`, f.admin);
  assert.equal(detail.status, 200); assert.ok(detail.body.text.includes("const value = 2"));
});

test("parallel HTTP denies old-conversation writes while newly created conversations remain interactive", async (t) => {
  const f = await fixtureService(t, {}, { parallel: true }), projectId = f.bootstrap.projects[0].id;
  assert.equal(f.bootstrap.parallel, true);
  const catalog = (await f.request(`/api/lan/projects/${projectId}/conversations`, f.admin)).body;
  const oldId = catalog.conversations[0].id;
  const controls = async (id) => (await f.request(`/api/lan/conversations/${id}/controls?projectId=${projectId}`, f.admin)).body;
  const command = (id, command) => f.request(`/api/lan/conversations/${id}/commands`, { ...f.admin, method: "POST", body: { projectId, command } });
  assert.equal((await controls(oldId)).writable, false);
  assert.equal((await command(oldId, { type: "submit", text: "must never run" })).status, 403);
  assert.equal((await command(oldId, { type: "rename", name: "must never rename" })).status, 403);
  assert.equal((await f.request(`/api/lan/conversations/${oldId}/fork`, { ...f.admin, method: "POST", body: { projectId } })).status, 403);
  assert.equal((await f.request(`/api/lan/conversations/${oldId}/history?projectId=${projectId}`, f.admin)).status, 200);
  const created = await f.request(`/api/lan/projects/${projectId}/conversations`, { ...f.admin, method: "POST", body: {} });
  assert.equal(created.status, 201); assert.equal((await controls(created.body.id)).writable, true);
  assert.equal((await command(created.body.id, { type: "rename", name: "parallel-owned" })).status, 200);
  assert.equal((await command(created.body.id, { type: "submit", text: "new isolated fixture task" })).status, 200);
});
