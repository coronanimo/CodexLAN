import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import {
  createThreadTitleService,
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

function titleCodex({ failReads = false, duringGeneration = () => {} } = {}) {
  const events = new EventEmitter();
  const calls = [];
  let name = null;
  return {
    events, calls,
    async request(method, params) {
      calls.push({ method, params });
      if (method === "thread/read") {
        if (failReads) throw new Error("rollout at test.jsonl is empty");
        return { thread: { name } };
      }
      if (method === "model/list") return { data: [{ id: "gpt-5.4-mini" }] };
      if (method === "thread/start") return { thread: { id: "helper" } };
      if (method === "turn/start") {
        duringGeneration(events);
        queueMicrotask(() => {
          events.emit("notification", { method: "item/completed", params: { threadId: "helper", item: { type: "agentMessage", text: '{"title":"Quota timing"}' } } });
          events.emit("notification", { method: "turn/completed", params: { threadId: "helper", turn: { status: "completed" } } });
        });
        return {};
      }
      if (method === "thread/name/set") name = params.name;
      return {};
    },
  };
}

test("new-thread naming uses in-memory state without reading the rollout", async () => {
  const codex = titleCodex({ failReads: true });
  const service = createThreadTitleService({ codex });
  const job = service.schedule({ threadId: "main", cwd: ".", turns, getCurrentName: () => "" });
  assert.equal(service.schedule({ threadId: "main", cwd: ".", turns }), job);
  assert.equal(await job, "Quota timing");
  assert.equal(codex.calls.filter((call) => call.method === "thread/read").length, 0);
  assert.equal(codex.calls.filter((call) => call.method === "thread/name/set").length, 1);
  assert.equal(codex.events.listenerCount("notification"), 0);
});

test("a name change event cancels an in-flight automatic title even if it matches the first message", async () => {
  const codex = titleCodex({ duringGeneration: (events) => events.emit("notification", {
    method: "thread/name/updated", params: { threadId: "main", threadName: legacyFirstMessageName(turns) },
  }) });
  assert.equal(await createThreadTitleService({ codex }).schedule({ threadId: "main", cwd: ".", turns, getCurrentName: () => "" }), null);
  assert.equal(codex.calls.some((call) => call.method === "thread/name/set"), false);
  assert.equal(codex.events.listenerCount("notification"), 0);
});

test("legacy naming retains metadata reads without polling", async () => {
  const codex = titleCodex();
  assert.equal(await createThreadTitleService({ codex }).schedule({ threadId: "main", cwd: ".", turns }), "Quota timing");
  assert.equal(codex.calls.filter((call) => call.method === "thread/read").length, 2);
});

test("manual rename requests cancel title submission before their response or event arrives", async () => {
  let service;
  const codex = titleCodex({ duringGeneration: () => service.cancel("main") });
  service = createThreadTitleService({ codex });
  assert.equal(await service.schedule({ threadId: "main", cwd: ".", turns, getCurrentName: () => "" }), null);
  assert.equal(codex.calls.some((call) => call.method === "thread/name/set"), false);
});

test("deletion events discard the generated title", async () => {
  const codex = titleCodex({ duringGeneration: (events) => events.emit("notification", {
    method: "thread/deleted", params: { threadId: "main" },
  }) });
  assert.equal(await createThreadTitleService({ codex }).schedule({ threadId: "main", cwd: ".", turns, getCurrentName: () => "" }), null);
  assert.equal(codex.calls.some((call) => call.method === "thread/name/set"), false);
});

test("a known custom name prevents generation, including a name matching the first message", async () => {
  const codex = titleCodex({ failReads: true });
  const name = legacyFirstMessageName(turns);
  assert.equal(await createThreadTitleService({ codex }).schedule({ threadId: "main", cwd: ".", turns, getCurrentName: () => name }), name);
  assert.equal(codex.calls.length, 0);
});

test("legacy naming does not retry read failures", async () => {
  let reads = 0;
  const codex = { events: new EventEmitter(), request: async () => { reads++; throw new Error("permission denied"); } };
  await assert.rejects(createThreadTitleService({ codex }).schedule({ threadId: "main", cwd: ".", turns }), /permission denied/);
  assert.equal(reads, 1);
});
