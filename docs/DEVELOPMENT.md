# Development

## Setup

Development is currently supported on Windows 10 and 11 with Node.js 20 or newer and an installed Codex CLI.

```powershell
codex login status
npm ci
npm run check
npm run dev
```

Use separate `CODEX_WEB_DATA_DIR` and `CODEX_WORKDIR` directories for manual tests. Test data should not contain real accounts, sessions, conversations, credentials, attachments, or project files.

## Source layout

- `server/index.mjs` starts the HTTP service and assembles the server modules.
- `server/service.mjs` controls the background supervisor.
- `server/` also contains accounts, projects, conversations, persistence, HTTP helpers, and the App Server client.
- `public/` contains the shared browser application and its desktop and mobile layouts.
- `android/` contains the Android WebView client.
- `test/` contains Node tests and `test/fixtures/` contains the fake App Server used by integration tests.

See [ARCHITECTURE.md](ARCHITECTURE.md) for runtime boundaries and data ownership.

## Checks

Follow the repository-root [AGENTS.md](../AGENTS.md): select checks for the behavior and risks affected by the change, and reuse applicable results. Do not compute file hashes or add verification steps merely to demonstrate that checking occurred.

For the complete repository check, use:

```powershell
npm run check
```

This checks the JavaScript entry points and runs the Node test suite. The HTTP test starts a real CodexLAN service on loopback with temporary data, a temporary workspace, and the fake App Server.

When changing protocol handling, use the fake App Server for focused tests and a real Codex CLI for the affected compatibility paths. Select the relevant requests, events, and recovery behavior; do not automatically repeat checks of unrelated protocol features for every change.

## Browser profiling

When the workbench appears stuck or rendering becomes disordered, append `?profiling=1` to the page URL and reproduce the problem. The browser records recent SSE events, event-handler and conversation-render timings, API requests, long tasks, and uncaught errors. In DevTools, run:

```js
codexlanProfiler.report()
codexlanProfiler.download()
```

The first command returns an in-memory report; the second downloads a JSON snapshot that can be attached to a bug report. Profiling is disabled by default and is not persisted unless `localStorage.setItem("codexlan-profiling", "1")` is used.

## Preview a storage migration without cutting over

With the configured service still running, use a new destination directory:

```powershell
node scripts/preview-workspace-migration.mjs 'C:/Temp/codexlan-migration-preview'
```

The command takes a consistent SQLite backup into that directory and migrates only the copy. It rejects an existing destination, compares reconstructed business fields during migration, and reports counts and the backup location without account/session contents. It does not restart the service or replace its data. Automatic live migration occurs on the next service startup; schedule that cutover after active work has finished. An operational rollback requires the pre-v14 database backup and the matching pre-change application code, with the service stopped; do not run old code against schema 14 or substitute a stale JSON mirror.

## Android

Install JDK 17 and Android SDK Platform 35, then run from the repository root:

```powershell
android\gradlew.bat -p android clean assembleDebug lintDebug
```

Build details and release-signing variables are in [android/README.md](../android/README.md).

## Project conventions

- Server and browser JavaScript use ECMAScript modules.
- HTTP routes use Express 5.
- The browser application has no build step.
- Changes to stored state include an explicit migration or a clear rejection of unsupported versions.
- Changes to App Server requests and events include focused tests and a manual compatibility check.
- Runtime data, build output, SDKs, signing material, downloaded tools, and release archives stay outside source control.
