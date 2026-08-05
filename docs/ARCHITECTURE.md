# Architecture

## System boundary

```text
Desktop/mobile browser or Android WebView
              │ HTTP API + SSE
              ▼
        Node HTTP service
        auth, state, files
              │ JSONL over stdio
              ▼
       codex app-server
              │
              ▼
    Windows files and processes
```

`server.mjs` serves the static browser application, validates web requests, persists application state, performs bounded file operations, and owns one child `codex app-server --listen stdio://` process. The browser never talks to app-server directly.

App-server uses JSON-RPC-style messages encoded as newline-delimited JSON. The service sends `initialize`, then `initialized`, and maps browser actions to thread, turn, steering, interruption, model, account-limit, and history requests. App-server is an experimental Codex interface and can change without notice; compatibility must be retested after every Codex CLI upgrade.

## Main source areas

- `server.mjs`: HTTP routing, authentication, persistence, project ownership, file access, SSE fan-out, queue recovery, and app-server adaptation.
- `public/index.html`, `public/styles.css`, `public/app.js`: the no-build browser application.
- `public/*.js`: focused parsing, rendering, timing, snapshot, preview, download, and thread helpers shared with tests.
- `test/`: Node built-in test suite for browser-side pure functions and state reconstruction.
- `Start-Codex-Web.ps1`: Windows LAN binding, workspace setup, firewall opt-in, process supervision, and health checks.
- `android/`: optional native WebView shell; it does not embed the Node service or Codex credentials.

## State and ownership

Runtime application state lives under `data/`; service logs live under `logs/`; the default writable project root is `workspace/`. None belongs in source control.

Application users have separate project records, thread ownership, queues, settings, and sessions. They still share one operating-system identity and one app-server child process. A project created in the UI is placed under `<workspace>/<normalized-user>/<project-name>`. Existing stored paths may remain as legacy paths for compatibility.

## Request security

The service uses HttpOnly, SameSite=Strict session cookies. State-changing API calls require a valid session, a same-origin request, and the session CSRF token. Administrative routes additionally require an administrator account. Login attempts are rate-limited and passwords are stored using salted scrypt hashes.

File endpoints resolve and validate paths before access. Ordinary project download and upload routes are bound to an owned project. The administrator download route can read a broader set of local files and is therefore a distinct, documented trust boundary.

Composer attachments stay in browser memory until a message is sent. The server then stores them below `.codexlan/attachments/<thread>/<date>/` inside the owned project, using generated unique names. The app-owned `.codexlan` directory ignores its own contents in Git. Removing an unsent attachment therefore creates no project file; successfully sent attachments remain available to historical chat references.

## Live execution state

The browser maintains one SSE connection for server events. Server-side maps track active thread state, queue revisions, retry timers, draft threads, timing, and cached history. Persisted timing and snapshots allow the UI to reconstruct command and file-change rows after navigation or reconnect instead of treating the DOM as the source of truth.

## Compatibility-sensitive areas

After updating Codex CLI, manually verify initialization, model listing, thread create/resume/list, turn start, steering, interruption, approvals if present, streamed command and file events, token usage, account limits, and history pagination. Generated app-server schemas are diagnostic output tied to a particular Codex version and are intentionally not committed.
