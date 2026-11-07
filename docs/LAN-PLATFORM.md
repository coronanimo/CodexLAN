# Shared LAN platform

The platform is designed for CodexLAN, AGYLAN (Google Antigravity), PILAN (Pi Coding Agent) and CLAUDELAN (Claude Code) to share a React workbench and application services. Only the CodexLAN manifest and Codex adapter currently exist; the other products are future integration work.

[Current architecture diagram](ARCHITECTURE.md)

## Ownership

| Concern | Shared application | Provider adapter |
| --- | --- | --- |
| Account/project access | Enforces identity, grants and revocation | Receives authorized operations |
| Attachments/files | Owns upload IDs, realpath scope, previews and downloads | Converts validated files to native input |
| Queue | Owns order, edits, persistence, delivery uncertainty and explicit retries | Reports real acceptance and terminal facts |
| History | Owns public DTOs, selection/window lifetime, authorization and transport | Establishes canonical positions and bounded presentation |
| Streaming | Owns browser epoch/sequence, backpressure and project filtering | Synchronously interprets native identity/order/lifecycle |
| Controls | Generic capability-driven components | Native semantics for questions, approvals, interruption, goals and options |
| Output | On-demand bounded UI and download delivery | Native extraction, full-body resource materialization |
| Product | Runtime name, default provider and assembly | No copied account, queue or UI implementations |

Application input errors use explicit delivery outcomes. A transport timeout is uncertain, not a definite rejection. Only a definite inactive-run rejection allows an async answer to switch from guidance to queue delivery. These decisions are implemented without Codex error-message matching in `server/core/`.

## Real extension seams

- `shared/agent-contract.ts`: capabilities, namespaced settings descriptors and product metadata.
- `shared/presentation.ts`: committed rows, revision and explicit anchored updates.
- `shared/commands.ts`: commands and control DTOs.
- `shared/read-api.ts`: full LAN client port, history/detail/metadata streams and selection.
- `server/agents/adapter-contract.ts`: implemented server adapter surface.
- `server/agents/operation-error.mjs`: provider-independent delivery outcome.
- `server/core/conversation-service.mjs`, `queue-coordinator.mjs`: shared application policy.
- `server/core/routes.mjs`, stream modules: authorization and transport delivery.
- `server/agents/codex/`: replaceable native implementation.
- `products/`: small product manifests.

The existing Codex connection client and browser-signature host remain independent infrastructure. They have no imports from deleted frontend files. UI features never parse `thread/*` or `turn/*` messages.

## Adding another provider

1. Verify its actual SDK/process/HTTP protocol, acceptance semantics, pagination and recovery behavior.
2. Implement the server adapter and composition. Use genuine capabilities; do not emulate steer as submit, or goals as a hidden system prompt.
3. Supply namespaced settings descriptors and native validation; shared components render them.
4. Extend binding persistence with agent instance/native identity mapping. Codex keeps existing UUIDs for compatibility; a non-UUID provider must map its IDs to LAN UUIDs rather than weakening project/attachment scope checks.
5. Preserve queue order, project grants, settings and recovery records through that binding migration, checking business fields and relationships.
6. Exercise the affected contract with isolated native fixtures, then build the selected product manifest with the same web workbench.

This does not implement speculative Antigravity, Pi or Claude integrations. It removes the old frontend/runtime coupling so their native work has an explicit place to go.
