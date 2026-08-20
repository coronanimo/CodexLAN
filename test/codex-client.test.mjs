import assert from "node:assert/strict";
import test from "node:test";
import { appServerLaunch } from "../server/codex-client.mjs";

test("starts Codex App Server with an explicit standard service tier", () => {
  assert.deepEqual(appServerLaunch({
    codexBin: "custom-codex.exe",
    fixture: null,
  }), {
    executable: "custom-codex.exe",
    args: ["-c", 'service_tier="default"', "app-server", "--listen", "stdio://"],
  });
});
