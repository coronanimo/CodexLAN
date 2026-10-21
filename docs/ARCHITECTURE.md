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

The client receives live thread updates through SSE. It pauses the stream while hidden, reconnects when the page returns to the foreground, detects silent streams with a watchdog, and rebuilds visible execution state from server snapshots and subsequent events.

### Android client

The Android project is a WebView shell. Native code owns server selection, refresh, system file picking, downloads, clipboard fallback, document sharing, PDF generation, and the offline control menu. Conversation and project features remain in the shared web client.

## Data ownership

Codex conversation history belongs to Codex. CodexLAN associates a thread with a project by matching the thread's canonical working directory to the project directory.

CodexLAN stores web accounts, sessions, projects, thread bindings, queues, thread settings, per-user access order, and async-answer receipts in SQLite at `workspace-state.sqlite`. Production does not write a JSON mirror. The `WorkspaceStore` constructor retains its JSON-mirror option for existing direct callers and tests. Project files remain in their project directories. Sent attachments are stored below each project's `.codexlan/attachments/` directory.

### SQLite schema 14

`server/workspace-database.mjs` stores users and projects per entity; bindings and settings per thread; queues per message with explicit positions and a queue revision; and sessions per hashed token. Bounded access-order maps and answer-receipt sets remain small grouped JSON values. Small entity payloads preserve optional-field semantics, including an explicitly empty settings object overriding defaults.

`execution_supplements` is one sparse supplement table keyed by `(thread_id, turn_id, item_id)`, not a durable Turn/Item/Command or Subagent model. An empty item ID addresses turn timing/plan supplements. Other rows hold item timing and, where needed, bounded command recovery snapshots. Messages, reasoning, tool-result bodies, and Subagent histories are not copied into SQLite. Live turn contents needed for reconnect are held in memory and released when the turn completes.

Updates write only affected records in a short transaction on one long-lived connection. Command-output recovery writes are coalesced; queue and account mutations await persistence before acknowledgement. WAL and `synchronous=FULL` remain enabled. A command recovery body is removed only after canonical history actually supplies its contents; canonical terminal status/duration supersede an earlier live snapshot. Existing retention remains 24 supplemented turns per thread and 600 total; migration itself does not prune data.

On first startup with the old SQLite layout, SQLite creates a consistent `workspace-state.sqlite.pre-v14-<timestamp>` backup including committed WAL contents. One transaction writes the new tables, reconstructs and compares business fields/relationships, drops the old collection/blob tables, and commits schema version 14 last. Failure rolls back the transaction and stops startup rather than replacing the authoritative DB from a stale JSON mirror. The compatibility JSON document version remains 13; it is distinct from SQLite's schema version.

Migration initially retains existing recovery data and removes whole-history compression. It is not a database-shrinking operation: the file can grow, and deleting covered supplement records makes pages reusable without automatically shrinking the file.

### Workspace synchronization

The new service advertises `workspaceSyncVersion: 2`. The shared browser retains the old protocol until that capability is present, so serving updated static files does not require disrupting the still-running old service.

- Project lists use App Server cursor pagination, fetching at most 50 entries per request. The sidebar has one quiet “显示更多对话” action at the end of the list, appending results instead of showing page controls. Opening a conversation or refreshing the head retains loaded entries and the continuation cursor; changing sort order resets the list. Original order, local access-first recent order, relocated bound threads, and selection of a most-recent conversation outside the first batch remain supported.
- `/api/workspace/threads` returns a page of cross-project summaries, the 30 most recent summaries, and all discovered running/Goal/queued summaries. A metadata-only discovery pass preserves Goal and relocated-thread visibility across projects; it does not block the selected project's page. Its catalog is cached for 30 seconds and updated from local events. Discovery can still scan all thread metadata and query Goals on a cold cache because the backend has no Goal index used by this integration; concurrency is limited to 50 metadata operations per batch. It never loads transcript bodies for this inventory.
- A browser uses one scoped SSE connection. Full transcript/output events go to its selected thread; other threads receive coalesced activity/queue/Goal summaries. Completion, approval, input, and async-question controls remain visible globally. Legacy unscoped streams retain their original contract.
- SSE includes a server epoch and per-thread revisions. History reads identify their starting revision, so live snapshots include unfinished items and subsequent completions rather than resending every completed item in the current turn. Scoped connections check canonical thread status, snapshots are captured synchronously, and client list merges preserve concurrent events and newer queue revisions. Reconnection reconciles selected history rather than replaying writes.
- Text deltas coalesce for up to 50 ms and command output retains its existing 100 ms batching and tail limits. Terminal/control events flush pending text. Quota changes notify clients globally instead of depending on a selected thread.

The Node service stores its state below the configured repository-local `data/` directory. `workspaceRoot` defines the shared multi-user workspace boundary. Automatically managed user projects live below `<workspaceRoot>/<username>/`; every project record retains its individual absolute path.

## Access boundary

All CodexLAN accounts share the Windows identity, Codex login, machine permissions, and usage limits of the service process. Accounts separate access inside CodexLAN; they are not operating-system sandboxes.

Member projects are limited to that member's directory below the configured workspace root. Administrators may select other absolute directories. Project, thread, queue, attachment, and file routes check ownership before performing work.

Authenticated writes require a session cookie, a same-origin request, and the session CSRF token. Passwords use salted scrypt hashes. File routes resolve canonical paths before access.

## Process and network lifecycle

The local workbench remains available when Codex is missing, signed out, or reconnecting. `/api/health` reports the Node service; `/api/ready` reports App Server readiness.

Loopback and the selected private-LAN address share one listener and one configured port. Requests received through an address outside that allowlist are rejected.

One Node service owns one App Server child process. Restarting the Node service also replaces that child process; reconnecting Codex can restart only the child while leaving the web service running.

## Codex compatibility

`codex app-server` is experimental. After a Codex CLI update, use its actual protocol changes and observed failures to select compatibility checks, including affected initialization, request, event, and recovery paths. Follow the verification rules in the repository-root [AGENTS.md](../AGENTS.md); do not automatically repeat an unrelated full feature matrix.
