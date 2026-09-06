import assert from "node:assert/strict";
import test from "node:test";
import {
  fallbackThreadTitle,
  legacyFirstMessageName,
  selectTitleModels,
  shouldGenerateThreadTitle,
  titleTranscript,
} from "../server/thread-titles.mjs";

const turns = [{
  id: "turn-1",
  items: [
    { type: "userMessage", content: [{ type: "text", text: "## Diagnose **quota** reset timing" }] },
    { type: "agentMessage", text: "I found the reset window.", phase: "final" },
  ],
}];

test("builds a bounded title transcript from the first user turn", () => {
  assert.equal(titleTranscript(turns), JSON.stringify({
    user: "## Diagnose **quota** reset timing",
    assistant: "I found the reset window.",
  }));
});

test("manual title suggestions use recent conversation context", () => {
  const recent = titleTranscript([
    ...turns,
    {
      id: "turn-2",
      items: [
        { type: "userMessage", content: [{ type: "text", text: "Why is the refresh delayed?" }] },
        { type: "agentMessage", text: "The completion event contains only a summary.", phase: "final" },
      ],
    },
  ], { latest: true });
  assert.deepEqual(JSON.parse(recent), {
    turns: [
      { user: "## Diagnose **quota** reset timing", assistant: "I found the reset window." },
      { user: "Why is the refresh delayed?", assistant: "The completion event contains only a summary." },
    ],
  });
  assert.equal(recent.length <= 8_000, true);
});

test("replaces only an empty name or the legacy first-message title", () => {
  const legacyName = legacyFirstMessageName(turns);
  assert.equal(legacyName, "Diagnose quota reset timing");
  assert.equal(shouldGenerateThreadTitle({ name: null }, turns), true);
  assert.equal(shouldGenerateThreadTitle({ name: legacyName }, turns), true);
  assert.equal(shouldGenerateThreadTitle({ name: "My custom quota notes" }, turns), false);
});

test("prefers mini then terra for title generation", () => {
  assert.deepEqual(selectTitleModels([
    { id: "gpt-5.6-terra" },
    { id: "gpt-5.4-mini" },
    { id: "gpt-5.6-sol", isDefault: true },
  ]), ["gpt-5.4-mini", "gpt-5.6-terra", "gpt-5.6-sol"]);
});

test("uses an exclamation fallback from the first user message", () => {
  assert.equal(fallbackThreadTitle([{
    items: [{ type: "userMessage", content: [{ type: "text", text: "你好，帮我检查这个项目" }] }],
  }]), "!你好，帮我检查这");
});
