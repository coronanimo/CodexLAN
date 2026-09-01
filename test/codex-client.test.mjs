import assert from "node:assert/strict";
import test from "node:test";
import { appServerLaunch } from "../server/codex-client.mjs";

test("starts Codex App Server with an explicit standard service tier", () => {
  assert.deepEqual(appServerLaunch({
    codexBin: "custom-codex.exe",
    fixture: null,
    platform: "win32",
  }), {
    executable: "custom-codex.exe",
    args: [
      "-c", 'service_tier="default"',
      "-c", "features.tool_suggest=false",
      "-c", "features.unified_exec=false",
      "app-server", "--listen", "stdio://",
    ],
  });
});
