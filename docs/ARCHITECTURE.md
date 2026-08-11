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

The browser application is plain HTML, CSS, and JavaScript with no build step. `public/app.js` coordinates the application while smaller modules own reusable behavior. Desktop and mobile use the same state and product components; `desktop.css` and `mobile.css` provide different layouts.

The client receives live thread updates through SSE. It reconnects after navigation or network interruption and rebuilds the visible execution state from server snapshots and subsequent events.

### Android client

The Android project is a WebView shell. Native code owns server selection, refresh, system file picking, downloads, and the offline control menu. Conversation and project features remain in the shared web client.

## Data ownership

Codex conversation history belongs to Codex. CodexLAN associates a thread with a project by matching the thread's canonical working directory to the project directory.

CodexLAN stores web accounts, sessions, projects, queues, thread settings, access order, and runtime metadata in `workspace-state.json`. Project files remain in their project directories. Sent attachments are stored below each project's `.codexlan/attachments/` directory.

The Node service stores its state below the configured repository-local `data/` directory. `workspaceRoot` defines the shared multi-user workspace boundary. Automatically managed user projects live below `<workspaceRoot>/<username>/`; every project record retains its individual absolute path.

## Access boundary

All CodexLAN accounts share the Windows identity, Codex login, machine permissions, and usage limits of the service process. Accounts separate access inside CodexLAN; they are not operating-system sandboxes.

Member projects are limited to that member's directory below the configured workspace root. Administrators may select other absolute directories. Project, thread, queue, attachment, and file routes check ownership before performing work.

Authenticated writes require a session cookie, a same-origin request, and the session CSRF token. Passwords use salted scrypt hashes. File routes resolve canonical paths before access.

## Process and network lifecycle

The local workbench remains available when Codex is missing, signed out, or reconnecting. `/api/health` reports the Node service; `/api/ready` reports App Server readiness.

The loopback and LAN listeners have separate state. A missing private address or occupied LAN port disables LAN access without taking down the local workbench.

One Node service owns one App Server child process. Restarting the Node service also replaces that child process; reconnecting Codex can restart only the child while leaving the web service running.

## Codex compatibility

`codex app-server` is experimental. After a Codex CLI update, verify initialization, authentication, model listing, thread history, turn execution, steering, interruption, command and file events, token usage, and account limits.
