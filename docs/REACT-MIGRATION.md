# React client migration

Status: foundation plus authenticated read-only integration, not a production replacement.

The product target is the [shared LAN platform](LAN-PLATFORM.md): CodexLAN,
AGYLAN, PILAN and CLAUDELAN reuse this frontend and application core. Shared
presentation contracts live in `shared/`, native operations belong to server
agent adapters, and edition metadata lives in `products/`.

The pre-migration baseline is `4b7814b` on `main`. React preparation lives on
`refactor/react-foundation`. The existing service continues serving `public/`.
The production static entry, accounts, tasks and persistence remain unchanged;
the server gains additive read-only API routes.

## Problem and intended behavior

Long Codex turns contain many executions, not merely a few chat messages. The
current renderer scans loaded history for small updates, performs repeated
per-turn work inside item updates, and writes timing data back while rendering.
That can invalidate its own reference cache. Typing also measures textarea
geometry synchronously while history has no mounted-node budget.

The replacement must keep editor work local, preserve ordering and business
semantics, and bound mounted history by the viewport. Rewriting the same loops
as JSX does not satisfy this migration.

## Decisions

- React and TypeScript provide component ownership and explicit contracts.
- Vite supplies dependency resolution, TSX transformation and fast development;
  it does not provide the state architecture. Production output is static files.
- Redux Toolkit core provides entity storage and selectors. RTK Query is deferred
  until the network/cache ownership problem is designed; do not maintain a second
  transcript copy in an HTTP cache beside the entity store.
- `react-virtuoso` (MIT) handles variable-size rows and prepend coordinates.
  The commercial Message List package is not included.
- `react-markdown` and `remark-gfm` replace custom Markdown parsing. Streaming
  block reuse, large-message treatment, math and Mermaid are later acceptance
  items. The current renderer is not claimed to solve all streaming costs.
- Existing native controls and design language remain the starting point.
  No comprehensive UI framework, SSR, additional production server or editor
  framework is required. Autosize is not a dependency in this foundation.

Dependencies are pinned in the lockfile. Web packages are root dev dependencies:
Node never imports them at runtime, and a deployed server only needs compiled
assets plus its existing runtime dependencies. Use Node 24 for this frontend
toolchain; the legacy server's engine declaration is not a frontend support matrix.

## Boundaries and data flow

```text
HTTP history [implemented] / selected-thread SSE [pending]
                       |
         read adapter and selection controller
      epochs, revisions, cancellation, canonical order
                       |
             committed presentation updates
                       |
        normalized entity store + ordered row IDs      [foundation]
                       |
              per-ID React subscriptions
                       |
           virtualized messages / executions

editor keystrokes -> component-local draft -> explicit submit command
detail expansion -> detail request/cache -> visible detail body
```

| Location | Owns | Must not own |
| --- | --- | --- |
| `web/src/app/` | Composition, store setup, draft cache lifetime | Codex event interpretation |
| `features/conversation/model/` | Committed rows, canonical display membership, release | Fetching, raw events, DOM or timing side effects |
| `features/conversation/ui/` | Per-ID presentation, viewport mounting | Transport, chronological guesses, model writes during render |
| `features/composer/` | Draft input, selection and composition behavior | Conversation rendering or streamed output |
| `transport/` and app controllers | HTTP ownership, cancellation and selection lifetime; future SSE reconciliation | React/DOM rendering |
| `features/details/` | On-demand output chunks and request lifetime | Hidden megabyte bodies in every row |
| `web/src/dev/` | Deterministic isolated fixture preview | Product imports or live task execution |

### Entity and order ownership

Stable row keys include thread, turn and item identity. The list subscribes to
ordered row IDs, while a row subscribes to its own entity. Updating one entity
does not replace the timeline ID array. Individual executions and turn summaries
are separate rows; an arbitrarily large turn is never one virtual item.

The presentation store deliberately does not implement a second Codex reducer.
It accepts committed snapshots from the read controller and changes from the
future streaming adapter.
`rowsCommitted` cannot append unknown IDs by receipt order: it requests recovery.
`orderedRowsPrepended` and `orderedRowsAppended` require an already established
canonical position. Snapshot replacement is allowed O(N) work; streaming must
not implement every update as a snapshot.

The adapter must preserve the existing cases for optimistic/native input identity,
late completions, overlapping reads, transport revisions versus projection
versions, server epochs, queue revisions and pending requests. Existing pure
protocol tests remain the starting evidence. Do not copy the old DOM coordinator
or the active-turn-last heuristic into a new React effect.

### Resource lifetime

- Switching thread remounts the viewport; drafts live in a separate app-owned UI
  cache. No keystroke dispatches conversation actions or synchronously reads
  layout. The initial textarea has bounded native height.
- The read controller dispatches `conversationReleased` when selection closes.
  Inactive history is released; limits for accumulated pages within one selected
  conversation still need a content-size policy.
- Complete tool output is a detail resource referenced by rows. The new LAN API
  bounds summaries and detail chunks; native history reads can still return full
  turns internally. The legacy browser API remains unchanged.
- Open detail/request state and drafts must survive virtualization unmounting;
  do not rely on component-local state for durable user work. Only the draft case
  is implemented in this foundation.
- Variable-height messages are supported by the list. A single enormous answer
  still needs a block/content policy; list virtualization alone is insufficient.
- Completed times are static. Later live clocks must subscribe only while an
  active item is visible; no document-wide timer scan.

## Development and publication

Install dependencies once with `npm ci`. Existing backend development remains
`npm run dev`. Start the separate React preview with:

```powershell
npm run web:dev
```

Open `http://127.0.0.1:5173` for the authenticated read-only client. Its `/api`
proxy targets a separately started development service at loopback port 8689;
`LAN_API_ORIGIN` overrides that target. That service must contain the new read
routes. The client can log in with an existing development account, select
projects/conversations, page backward, manually refresh latest history and read
output in chunks. First-time administrator setup stays in the existing client.
No task submission or realtime subscription is enabled yet.

Open `http://127.0.0.1:5173/fixtures.html` for the isolated architecture fixture.
It seeds two conversations with 2,000 executions each, supports reply updates,
history prepend and draft switching, and makes no API requests. Never point
automated checks at production state.

For the existing save-and-refresh style of work:

```powershell
npm run web:watch
```

This automatically rebuilds into `dist/web-preview/`. That directory is not
served by the current production application. After the cutover phase, the
static server can serve complete built asset sets without restarting Codex.
Development HMR is an alternative, not an additional production service.
Type checking runs separately from hot updates:

```powershell
npm run web:typecheck
npm run web:test
npm run web:build
```

Production cutover must update static-root/asset-version handling (currently
based on `public/app.js`), ship matching HTML/CSS/JS, and retain referenced chunks
for already-open clients. Source checkout and deployed release are distinct.
Release preparation includes `shared/` and `products/` because the server now
imports their runtime `.mjs` modules; React source/build tools are not server
runtime dependencies. Operational preparation/migration scripts were not run
as part of this refactor.

## Stages and acceptance

1. **Foundation (implemented):** pinned tools, normalized row state, row-level
   subscription, virtual list, isolated local editor and deterministic fixture.
   Tests assert stable order/unchanged identities, unknown-ID recovery, history
   prepend coordinates, release, draft retention and input/stream isolation.
2. **Read-only integration (HTTP slice implemented; SSE pending):** first extract the Codex agent boundary behind shared
   LAN services/bootstrap as described in the platform plan; then authenticated
   HTTP, selected-conversation SSE, protocol
   adapter, cancellation and reconnect. No task writes until read/stream ordering
   and recovery match existing semantics. Add bounded summary/detail loading and
   controller-driven cache release. Keep the production client available.
3. **Commands and controls:** send/guide/queue, stop, goals, async questions,
   approvals, attachments and Android bridge. Add each capability with its own
   failure/retry/focus cases; preserve drafts and controls across unmounts.
4. **Presentation and large content:** plans, timing, diffs, full-turn export,
   math/diagrams, large answers and output details. Reuse shared design tokens
   and replace affected legacy components without a permanent parallel design.
5. **Cutover:** production build/static integration, real desktop/mobile key
   flows, then retire legacy rendering after equivalent behavior is accepted.

Acceptance must demonstrate that typing commits no history components, a single
content patch leaves unrelated row identities and ordering intact, and thousands
of stored rows yield only a viewport-sized set of mounted nodes. Check prepend
and dynamic heights at the reading position, and draft/focus during streaming.
Record actual timings when judging latency; a DOM-count assertion or passing
unit tests alone cannot establish phone responsiveness or explain Windows audio
stalls. Use isolated fixtures, not production tasks, for new automated checks.

Pending: realtime integration/recovery, submissions/controls, cache limits across
many loaded history pages, efficient provider-side single-run pagination, large
single-answer treatment, Android acceptance and production cutover. Bounded
summary and chunked output reads are implemented; the native provider can still
return a full turn internally. This is not a claimed fix for the production stutter.

### Foundation evidence (2026-11-07)

Type checking, six focused frontend tests and the static preview build passed on
Node 24. An isolated Chromium preview with 2,000 executions in one run mounted 21
rows on desktop and 17 at 390x844, rather than the full history. At the latest
reply the bottom gap was zero; the narrow viewport had no horizontal overflow.
A local reply update preserved the focused draft. Prepending older history at a
reading position preserved the anchor with zero measured vertical shift. These
are fixture checks, not real-phone timings, production acceptance or evidence of
a fix for operating-system audio stalls.

### Authenticated read-only slice (2026-11-07)

`server/agents/codex/history-reader.mjs` now owns native history reads and the
existing live/read bridge, shared with the legacy client. The Codex read adapter
projects bounded summaries; `server/core/read-routes.mjs` owns authenticated
neutral HTTP routes. Runtime product metadata comes from bootstrap rather than
a frontend import of the CodexLAN manifest.

- `GET /api/lan/bootstrap`: edition, read adapters and accessible project summaries.
- `GET /api/lan/projects/:projectId/conversations`: authorized catalog, optional
  `agentId` and `cursor`.
- `GET /api/lan/conversations/:id/history`: `projectId`, optional `agentId`, `before`
  and `limit` (default 100, maximum 200 display rows). Message previews are at most
  12,000 characters. Tool result bodies are not part of these rows.
- `GET /api/lan/conversations/:id/details`: authorized opaque `ref` and `offset`;
  returns at most 16,000 characters plus `nextOffset`, without accumulating all
  chunks in frontend state. Opaque references locate records, not authorization.

The frontend controller owns abort/generation checks and releases the previous
conversation's entities on selection changes. Drafts have independent app
lifetime, including transitions through an empty/loading project catalog.

The first adapter still delegates catalog/bindings to the existing conversation
service and uses its native reconciliation projection. This is an intentional
extraction seam, not a completed provider lifecycle/command migration. Full
output lookup currently rereads the native history page on demand; no unbounded
server result cache has been added. Moving native page windows can produce a 409
requiring explicit refresh. Native row-level pagination and SSE checkpoint/order
semantics need design before read-only streaming is enabled.

Evidence: the original 115 backend cases passed after history extraction; two
new backend cases cover real authenticated fixture-server routes, grant/revoke,
bounded rows/chunks and absence of task writes. Frontend coverage now includes
ten cases for controller races, local input, project transitions and lazy output.
An isolated 390px browser with mocked LAN responses verified runtime PILAN/Pi
labels, history prepend, output paging, refresh and draft retention. This does
not claim a working Pi adapter or real-device acceptance.
