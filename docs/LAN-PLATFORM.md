# A shared LAN workbench for multiple agents

The architecture target is one LAN application core with replaceable agent
adapters and small product manifests. CodexLAN, AGYLAN, PILAN and CLAUDELAN should
not become four copied repositories with separate account, project, attachment,
queue, event and UI implementations.

This document describes the target and incremental extraction. Existing
`server/conversations.mjs` and `server/codex-client.mjs` are still Codex-specific.
The Codex read-only HTTP seam and React client are implemented; command/lifecycle
extraction and realtime subscription are pending. This is not a working integration
for other products. Their native APIs and actual capabilities must be verified
before implementing an adapter; a product name is not evidence of API support.

Product targets confirmed by the user: AGYLAN integrates Google Antigravity,
PILAN integrates Pi Coding Agent, and CLAUDELAN integrates Claude Code.

## Ownership

```text
CodexLAN / AGYLAN / PILAN / CLAUDELAN
           product identity + configured agent instances
                              |
                  Shared React LAN workbench
       conversations, editor, virtual timeline, controls, files
                              |
                      Shared LAN API / SSE
                              |
                    Shared application services
      accounts, access, projects, attachments, queues, bindings,
        history/detail delivery, event envelopes, subscriptions
                              |
                  Agent adapter registry / lifecycle
                       /        |        \
                    Codex      Pi       other providers
                 native protocol, auth, process/SDK/HTTP, history
```

| Concern | Shared application | Agent adapter | Product manifest |
| --- | --- | --- | --- |
| Accounts/access | Owns and enforces | Receives authorized local work | No credentials |
| Projects/files/attachments | Owns paths, uploads, downloads | Converts authorized attachments into native input | Default label/config only |
| Queue | Owns order, edits, retries and durability | Reports submit acceptance and run termination | No queue implementation |
| Conversations | Owns LAN identity, project binding and catalog DTOs | Maps native sessions and histories | No copied conversation code |
| Realtime | Owns browser epoch/sequence, scoping, batching | Translates native facts and recovery limitations | No event parsing |
| Rendering | Owns viewport, drafts and standard rows | Supplies bounded summaries/detail references | Brand and defaults |
| Optional features | Presents capabilities and enforces permissions | Implements true native semantics | Cannot claim unsupported capabilities |
| Provider settings | Renders typed settings descriptors | Namespaces, validates and applies native options | Selects defaults only |

A queue is not automatically equivalent to a provider's follow-up API. A guide
command is not automatically equivalent to a new prompt. Goals are not silently
implemented by adding a system prompt. Acceptance, interruption and retry
semantics must be explicit, especially after a transport timeout.

## Code boundaries

The current preparation creates these real entry points:

- `shared/presentation.ts`: provider-neutral, committed timeline rows/updates.
  Public IDs are owned by the LAN application; display order is explicit.
- `shared/agent-contract.ts`: agent instances, capabilities, namespaced settings,
  product metadata and the LAN event envelope. No Node/browser dependencies.
- `server/agents/adapter-contract.ts`: server-only lifecycle, input, history,
  subscription and optional interrupt/guide ports. This is a draft interface to
  validate with Codex before it becomes a stable extension contract.
- `server/core/read-routes.mjs`: shared authorized bootstrap, catalog, bounded
  history and output-detail routes, with providers supplied at composition.
- `server/agents/codex/`: native history reader and transitional read adapter;
  the reader is shared with legacy routes so overlap/recovery rules have one owner.
- `products/codexlan/manifest.ts`: CodexLAN identity/default provider. Product
  metadata is composed at the app boundary, not imported by shared UI features.
- `web/src/features/`: shared conversation and editor components. Their model
  speaks `conversationId` / `runId`, not native Codex request names.

Further extraction will move remaining application services into `server/core/`
and Codex-specific behavior into `server/agents/codex/`. The existing server files are
the working source during extraction, not a permanent second implementation.
Do not create a package/DI/plugin platform merely to populate these directories.
Use ordinary modules and constructor injection; adapters receive only the ports
they need. The repository keeps one package lock and one frontend toolchain.

### Adapter rules

1. Native request names, IDs/cursors, protocol versions, authentication and
   process management stay inside the adapter. StdIO, SDK and HTTP adapters are
   all allowed; do not force every backend to behave like `codex app-server`.
2. The shared core binds LAN conversation/run IDs to native IDs. Existing Codex
   IDs can be preserved during migration; a later binding migration must retain
   project ownership, queues, settings, receipts and recovery data.
3. Native event ordering and read/live reconciliation are adapter work. Emit
   committed common changes, or explicit recovery-required facts. Do not invent
   order from status, item role, timestamps or arrival time. The core owns browser
   delivery sequences; those are not native-history cursors.
4. Unsupported features remain unsupported. Capability metadata controls display
   but never replaces server-side authorization or adapter validation. Registering
   an adapter must verify that advertised operations actually exist.
5. Full outputs remain in provider history or dedicated detail resources. Do not
   serialize megabytes of native objects into generic rows, Redux or hidden DOM.
6. Advanced native features use typed extensions/settings. Do not add a public
   arbitrary-native-RPC endpoint or grow a giant provider switch inside shared UI.

### UI rules

Rows, virtual scrolling, editor drafts, pending obligations, plans and file views
are shared features. Capability/setting metadata selects available controls. An
agent name is presentation metadata; native quotas/service tiers are not generic
Codex fields copied into every agent's state.

Virtualization is per visible message/execution/summary, not per enormous run.
Protocol handling and provider processes are independent of component mounting.
Changing a provider cannot reconnect it once per mounted row or copy its history
on every keystroke. Shared row/entity subscriptions and detail loading boundaries
remain the same across products.

## How another LAN edition is added

1. Verify the actual supported integration/auth/history/events for that agent.
2. Implement its adapter and focused acceptance against native facts.
3. Register an agent instance in server configuration and add a small edition
   manifest (name, provider default and optional design tokens).
4. Serve that edition's public metadata/capabilities at bootstrap; use the same
   frontend bundle. Server executable paths, credentials and native IDs remain
   private configuration, not client manifest fields.
5. Reuse the shared suite for streaming/order, queued acceptance, interruption,
   permissions, history prepend, drafts and bounded rendering. Add tests only for
   genuinely different native semantics.

Provider choice is runtime configuration; a new product should not require a
new frontend build or a fork of the service. The read-only client receives product
metadata through bootstrap. Only the isolated fixture entry imports a manifest.
Only CodexLAN has a manifest/implementation in this phase. Other names are targets,
not advertised working adapters.

## Extraction order and completion gates

1. Preserve the working baseline and prepare neutral contracts + React boundaries.
2. Extract a Codex adapter using current regression cases; separate HTTP/auth and
   queue application services from native requests. Keep the old API usable via
   compatibility routes while adding the neutral bootstrap/read/event boundary.
3. Integrate read-only React history/SSE through that neutral boundary. Implement
   bounded summaries/detail loading and controller-driven cache release.
4. Migrate submissions, control requests, goals/settings and Android features.
5. Complete UI/large-content/mobile acceptance, then switch the product entry.
6. Implement a second real adapter to validate the abstraction before freezing
   the contract or promising rapid third/fourth integrations.

Avoid mapping all future providers into a fake Codex protocol. Also avoid a
lowest-common-denominator chat model that drops execution details, approvals,
questions or native metadata. Keep a small common model plus honest optional
capabilities and typed extensions. The old Pi research's reuse percentages and
protocol mappings are historical estimates, not acceptance evidence.
