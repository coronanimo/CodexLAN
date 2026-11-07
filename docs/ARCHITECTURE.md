# Architecture

CodexLAN has three runtime parts:

**Browser or Android WebView → HTTP and SSE → Node/Express service → JSONL over stdio → `codex app-server`**

The Node service owns the App Server process, serves the web interface, applies access control, and translates browser actions into Codex protocol requests. Browsers never connect to App Server directly.

## Components

### Node service

`server/index.mjs` assembles the Express application and starts one HTTP listener shared by loopback and the selected private-LAN interface. `server/service.mjs` owns the background supervisor and its control commands. Requests arriving through any other local interface are rejected.

- `server/accounts.mjs`: administrator setup, accounts, sessions, passwords, CSRF, and login throttling.
- `server/projects.mjs`: projects, directory access, attachments, uploads, and downloads.
- `server/conversations.mjs`: threads, turns, queues, steering, interruption, history, runtime state, and SSE.
- `server/workspace-store.mjs`: durable application state and state-format migration.
- `server/codex-client.mjs`: App Server process lifecycle and protocol transport.
- `server/http.mjs`: shared HTTP helpers.

### Web client

The browser application is plain HTML, CSS, and JavaScript with no build step. `public/app.js` coordinates the application while smaller modules own reusable behavior. Shared styles are split by responsibility into workspace, content, execution, composer, dialog, and sidebar files; `desktop.css` and `mobile.css` contain only platform-specific layout rules.

The client receives live thread updates through SSE, retains the connection while hidden, detects silent streams with a watchdog, and reconciles history and live projections after interruptions. Sending uses the HTTP acknowledgement, not SSE readiness. While SSE is unavailable, the visible selected conversation refreshes through HTTP every two seconds without resubmitting accepted tasks; failed submissions restore the prompt.

Account quota percentages are independent of thread token usage. `thread/tokenUsage/updated` only updates the context-window display. `account/rateLimits/updated` carries a complete quota bucket; server and client share `mergeAccountRateLimits` to replace that bucket by `limitId`, preserving other buckets and updating the legacy Codex view. The server refreshes its 15-second cache from the notification and forwards the snapshot directly. The retained `rateLimitsChanged` flag supports already-open older clients, whose reads hit that cache; current clients only refetch for a legacy notification without data.

Initial/manual quota reads run independently of conversation restoration; reconnect performs a recovery read. Both sides coalesce concurrent reads and overlay notifications received during a read so late responses cannot roll back newer percentages. The server also replays fresh cached buckets when SSE opens. An unrelated bucket alone does not suppress the initial Codex quota read. These are usage percentages, not HTTP throttling errors.

### Conversation model and rendering

`public/conversation-state.js` owns transcript updates and history reconciliation; `public/conversation-order.js` owns identity order. The server observes upstream notifications synchronously through the same reducer before network coalescing. A started item owns a slot even before any text arrives. Subsequent text, completion and request resolution update that identity rather than append a new record. Canonical history owns the order of known turn/item IDs; observed-only IDs retain their anchors until history supplies their positions. Timestamps and item types never assign chronological priority.

Local turn/start and turn/steer acceptance is observed synchronously at the JSONL response boundary, before following notifications in the same chunk. Accepted inputs occupy one optimistic identity and reconcile with native input IDs through `clientUserMessageId`/`clientId`, in either acknowledgement order. Explicit guidance intent is small supplement metadata, not a guess based on user-message index. Historical inputs without that metadata (including entries outside supplement retention) display as user input.

SSE body events carry a `conversation` patch containing turn fields, explicit `itemOrder`, and versioned replacement items. Task updates do not resend all transcript bodies. Full selected-thread snapshots include the unconfirmed live projection. The client applies both paths to its thread model and uses one renderer. An unknown ID in an order patch triggers history recovery; duplicate updates do not append text twice. Server epochs reset cached projection versions. Stream revisions and projection versions are different: neither is an atomic upstream-history cursor.

History reads register their starting projection version. Live completion data cannot be released while an older read still needs that bridge. A canonical read reconciles overlapping observed changes; completed projections are released only when history covers their content. Existing post-completion title reads also perform that reconciliation, without introducing another history scan. The projection is volatile and is not a second durable transcript database.

`public/conversation-view.js` reconciles model-ordered DOM nodes, leaving unchanged nodes attached. Replies, user input, reasoning, tools and async questions use that same ordered list. Execution details collapse individually; final answers are not enclosed by a turn-wide execution disclosure. `public/turn-footer.js` owns the per-turn closing area. Plans remain visible, with name and progress sharing the heading above the steps. Running turns use a strip labelled 小结: current status and cumulative diff in the middle, elapsed time at the right, no copy action. Its grid, label/title typography and horizontal padding are shared with execution rows. Finished status, total elapsed time, file diff, command/Codex timing and full-turn copy occupy a single summary row, without an ellipsis control or separate timing line. On narrow screens, metadata scrolls horizontally while copy stays fixed. File differences show the file count and added/removed lines rather than a bold blue label. Running recovery/diagnostic records can use the optional details control; completed recovery records remain directly visible when present. Missing plans, diffs and details hide those sections; unknown durations remain unknown.

Footer copy is always visible after a turn ends, including answer-only, failed and stopped turns. On click, `turnMarkdown` serializes the turn's user input/guidance, progress, reasoning, tool records and outputs, final replies, plan and cumulative diff as Markdown. It preserves model item order and deduplicates item IDs. Recovery commands without a known original position remain in a labelled recovery section and still contribute to command timing. Export adds no 16 KiB display cap; source-level truncation notices remain. The CODEX header action still copies only that message's original Markdown.

Blocking questions and approvals occupy a collapsible pending-action dock, with a link from their associated tool. Forms are keyed by request identity and retain drafts/focus through streamed updates and view reconciliation. Background request summaries cannot create actionable forms until full details arrive. `public/conversation-controls.js` owns the inline async-question views: pending shows a light form, deferred shows a one-line summary that reopens the same form, and answered shows a one-line read-only disclosure. Answers come from existing history/queue messages and receipts, not a second answer store. Successful keyboard submission moves focus to the answered summary unless the user has moved elsewhere.

Desktop and mobile share these components. `styles.css` defines the conversation typography, spacing, radii, width and control-height scales; `conversation-controls.css` alone styles question/approval internals; `execution.css` owns execution records, the pending dock and turn footer. Platform styles adjust layout and the same control-height variables at the existing 760px boundary, rather than replacing form styles or stretching radio inputs. Mobile controls have at least 44px hit areas while radios remain 16px.

### Android client

The Android project is a WebView shell. Native code owns server selection, refresh, system file picking, downloads, clipboard fallback, document sharing, PDF generation, and the offline control menu. Conversation and project features remain in the shared web client.

## Data ownership

Codex conversation history belongs to Codex. CodexLAN associates a thread with a project by matching the thread's canonical working directory to the project directory.

CodexLAN stores web accounts, sessions, projects, thread bindings, queues, thread settings, per-user access order, and async-answer receipts in SQLite at `workspace-state.sqlite`. Production does not write a JSON mirror. The `WorkspaceStore` constructor retains its JSON-mirror option for existing direct callers and tests. Project files remain in their project directories. Sent attachments are stored below each project's `.codexlan/attachments/` directory.

### SQLite schema 14

`server/workspace-database.mjs` stores users and projects per entity; bindings and settings per thread; queues per message with explicit positions and a queue revision; and sessions per hashed token. Bounded access-order maps and answer-receipt sets remain small grouped JSON values. Small entity payloads preserve optional-field semantics, including an explicitly empty settings object overriding defaults.

`execution_supplements` is one sparse supplement table keyed by `(thread_id, turn_id, item_id)`, not a durable Turn/Item/Command or Subagent model. An empty item ID addresses turn timing/plan supplements. Other rows hold item timing and, where needed, bounded command recovery snapshots. Messages, reasoning, tool-result bodies, and Subagent histories are not copied into SQLite. Live turn contents needed for reconnect are held in memory until canonical history covers them and no older read needs the completion bridge.

Updates write only affected records in a short transaction on one long-lived connection. Command-output recovery writes are coalesced; queue and account mutations await persistence before acknowledgement. WAL and `synchronous=FULL` remain enabled. A command recovery body is removed only after canonical history actually supplies its contents; canonical terminal status/duration supersede an earlier live snapshot. Existing retention remains 24 supplemented turns per thread and 600 total; migration itself does not prune data.

On first startup with the old SQLite layout, SQLite creates a consistent `workspace-state.sqlite.pre-v14-<timestamp>` backup including committed WAL contents. One transaction writes the new tables, reconstructs and compares business fields/relationships, drops the old collection/blob tables, and commits schema version 14 last. Failure rolls back the transaction and stops startup rather than replacing the authoritative DB from a stale JSON mirror. The compatibility JSON document version remains 13; it is distinct from SQLite's schema version.

Migration initially retains existing recovery data and removes whole-history compression. It is not a database-shrinking operation: the file can grow, and deleting covered supplement records makes pages reusable without automatically shrinking the file.

### Workspace synchronization

The service advertises `workspaceSyncVersion: 3` for versioned conversation projections. Scoped workspace streams remain available from version 2. Updated browsers adapt older raw events through the same conversation reducer and renderer; they do not retain a second legacy rendering path. Full ordering/reconnect guarantees require the updated backend, so static-file deployment alone does not complete the cutover.

- Project lists use App Server cursor pagination, fetching at most 50 entries per request. The sidebar has one quiet “显示更多对话” action at the end of the list, appending results instead of showing page controls. Opening a conversation or refreshing the head retains loaded entries and the continuation cursor; changing sort order resets the list. Original order, local access-first recent order, relocated bound threads, and selection of a most-recent conversation outside the first batch remain supported.
- `/api/workspace/threads` returns a page of cross-project summaries, the 30 most recent summaries, and all discovered running/Goal/queued summaries. A metadata-only discovery pass preserves Goal and relocated-thread visibility across projects; it does not block the selected project's page. Its catalog is cached for 30 seconds and updated from local events. Discovery can still scan all thread metadata and query Goals on a cold cache because the backend has no Goal index used by this integration; concurrency is limited to 50 metadata operations per batch. It never loads transcript bodies for this inventory.
- A browser uses one scoped SSE connection. Full transcript/output events go to its selected thread; other threads receive coalesced activity/queue/Goal summaries. Completion, approval, input, and async-question controls remain visible globally. Legacy unscoped streams retain their original contract.
- SSE includes a server epoch and per-thread transport revisions. History responses identify the revision at read start; selected-thread snapshots also carry unconfirmed conversation projections, including completions needed to bridge overlapping reads. Scoped connections check canonical thread status, snapshots are captured synchronously, and client list merges preserve concurrent events and newer queue revisions. Reconnection reconciles selected history rather than replaying writes.
- Text deltas coalesce for up to 50 ms and command output retains its existing 100 ms batching and tail limits. Terminal/control events flush pending text. Quota changes notify clients globally instead of depending on a selected thread.

The Node service stores state below the configured `dataRoot`. In the Windows deployment it is `%USERPROFILE%/.codexlan/data`, outside both source and release directories. `workspaceRoot` supplies the default location for new projects; it is not an authorization boundary. New project directories are named by project without a username parent. Every project retains its independent absolute path.

## Access boundary

All CodexLAN accounts share the Windows identity, Codex login, machine permissions, and usage limits of the service process. Accounts separate access inside CodexLAN; they are not operating-system sandboxes.

Project access is explicit: `ownerId` retains management authority and optional `memberIds` grant collaborators access to project files, conversations and queues. These small metadata fields are persisted atomically in the existing SQLite project record; old records without `memberIds` remain owner-only, so no schema change or implicit sharing occurs. Project management and granting require the owner or an authorized administrator. Administrators may register any absolute directory; members may create a fresh project below the default root, but cannot claim arbitrary existing directories. HTTP routes, search, initial SSE state and ongoing events all use the same project-access predicate. Revocation closes live streams. Path changes retain thread bindings and access history. File paths remain independently constrained to the authorized project and its attachment roots; web-account permissions are not OS sandboxes.

Authenticated writes require a session cookie, a same-origin request, and the session CSRF token. Passwords use salted scrypt hashes. File routes resolve canonical paths before access.

## Process and network lifecycle

The local workbench remains available when Codex is missing, signed out, or reconnecting. `/api/health` reports the Node service; `/api/ready` reports App Server readiness.

Loopback and the selected private-LAN address share one listener and one configured port. Requests received through an address outside that allowlist are rejected.

One Node service owns one App Server child process. Restarting the Node service also replaces that child process; reconnecting Codex can restart only the child while leaving the web service running.

## Codex compatibility

`codex app-server` is experimental. After a Codex CLI update, use its actual protocol changes and observed failures to select compatibility checks, including affected initialization, request, event, and recovery paths. Follow the verification rules in the repository-root [AGENTS.md](../AGENTS.md); do not automatically repeat an unrelated full feature matrix.
