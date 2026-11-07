import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { loadServerConfig } from "../server/config.mjs";

test("loads server settings from config/codexlan.json and resolves relative paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "codexlan-config-"));
  try {
    await mkdir(join(root, "config"));
    await writeFile(join(root, "config", "codexlan.json"), JSON.stringify({
      port: 8688,
      host: "auto",
      workspaceRoot: "../workspace",
      dataRoot: "../runtime",
      codexBin: null,
      logRoot: "../logs-external",
      attachmentRoot: "../attachments-external",
    }));
    const config = await loadServerConfig({ appRoot: root, env: {} });
    assert.equal(config.port, 8688);
    assert.equal(config.host, undefined);
    assert.equal(config.workspaceRoot, join(root, "workspace"));
    assert.equal(config.dataRoot, join(root, "runtime"));
    assert.equal(config.logRoot, join(root, "logs-external"));
    assert.equal(config.attachmentRoot, join(root, "attachments-external"));
    assert.equal(config.configPath, join(root, "config", "codexlan.json"));
    assert.equal(config.autoApproveBrowser, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("uses the config file ahead of inherited environment settings", async () => {
  const root = await mkdtemp(join(tmpdir(), "codexlan-config-env-"));
  try {
    await mkdir(join(root, "config"));
    await writeFile(join(root, "config", "codexlan.json"), JSON.stringify({ port: 8688, host: "auto" }));
    const config = await loadServerConfig({
      appRoot: root,
      env: { CODEX_WEB_PORT: "9000", CODEX_LAN_ENABLED: "0" },
    });
    assert.equal(config.port, 8688);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects unknown settings instead of silently ignoring them", async () => {
  const root = await mkdtemp(join(tmpdir(), "codexlan-config-invalid-"));
  try {
    await mkdir(join(root, "config"));
    await writeFile(join(root, "config", "codexlan.json"), JSON.stringify({ webPort: 8688 }));
    await assert.rejects(
      loadServerConfig({ appRoot: root, env: {} }),
      /Unknown setting.*webPort/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("browser auto-approval is a strict, file-only boolean independent of command approval", async () => {
  const root = await mkdtemp(join(tmpdir(), "codexlan-config-browser-"));
  try {
    await mkdir(join(root, "config"));
    const configPath = join(root, "config", "codexlan.json");
    await writeFile(configPath, JSON.stringify({ autoApproveBrowser: true }));
    const enabled = await loadServerConfig({ appRoot: root, env: {} });
    assert.equal(enabled.autoApproveBrowser, true);
    assert.equal(enabled.autoApprove, false);

    await writeFile(configPath, JSON.stringify({ autoApprove: true, autoApproveBrowser: false }));
    assert.equal((await loadServerConfig({ appRoot: root, env: {} })).autoApproveBrowser, false);
    await writeFile(configPath, JSON.stringify({ autoApprove: true }));
    assert.equal((await loadServerConfig({ appRoot: root, env: { CODEX_AUTO_APPROVE_BROWSER: "true" } })).autoApproveBrowser, false);

    for (const value of ["true", 1, null]) {
      await writeFile(configPath, JSON.stringify({ autoApproveBrowser: value }));
      await assert.rejects(loadServerConfig({ appRoot: root, env: {} }), /autoApproveBrowser must be a boolean/);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
