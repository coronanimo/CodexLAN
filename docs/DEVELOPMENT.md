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

React preparation uses `web/`; see [React migration](REACT-MIGRATION.md). Run
`npm run web:dev` for the read-only client (`/fixtures.html` remains isolated), `npm run web:watch` for automatic
static builds, and `npm run web:typecheck`, `npm run web:test`, `npm run web:build`
for the affected frontend checks. The root preview connects through `/api` to
the development service at port 8689 (override with `LAN_API_ORIGIN`); it can log
in/read but does not send tasks. Use isolated fixtures for automated checks. It
is not the production web entry point.

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

## Conversation acceptance

`node --test test/conversation-state.test.mjs test/conversation-order.test.mjs test/workspace-sync.test.mjs test/thread-selection.test.mjs test/async-user-input.test.mjs test/http-security.test.mjs` checks model order, read/completion overlap, stream scoping, selection, requests and the affected HTTP paths.

The former `check-conversation-ui.mjs` browser harness has been retired. Its earlier acceptance results are recorded in `docs/TODO.md`; those results are historical evidence, not a command available in this checkout. Select focused browser checks for the interactions changed by new work, including draft/focus retention, ordered streaming, history prepends and desktop/mobile layout. Do not run deployment or migration helpers as a substitute for UI acceptance.

### Known CLI lifecycle gap

On 2026-11-04, isolated live checks with `codex-cli 0.166.0` reproduced a missing reasoning completion when steering interrupts generation: `item/started` identifies the reasoning item, `turn/steer` is accepted, and the native guidance input arrives without a matching `item/completed` for that reasoning ID. A full `thread/turns/list` read at that point omits the interrupted reasoning item. The same sequence occurs after resuming the test thread in a new App Server process.

CodexLAN therefore cannot assign that item's actual stop time from the normal item stream. Guidance acceptance and successor activity are not completion evidence; they must not stop unrelated items or background work. Regression coverage in `test/reasoning-timing.test.mjs` preserves this distinction and checks that a matching completion does stop its timer. The original stuck-timer case remains unresolved pending a usable upstream terminal fact; no inferred completion rule is applied.

## Browser profiling

When the workbench appears stuck or rendering becomes disordered, append `?profiling=1` to the page URL and reproduce the problem. The browser records recent SSE events, event-handler and conversation-render timings, API requests, long tasks, and uncaught errors. In DevTools, run:

```js
codexlanProfiler.report()
codexlanProfiler.download()
```

The first command returns an in-memory report; the second downloads a JSON snapshot that can be attached to a bug report. Profiling is disabled by default and is not persisted unless `localStorage.setItem("codexlan-profiling", "1")` is used.

## Storage and deployment preparation

Use the documented deployment and project-layout procedures in `docs/DEPLOYMENT.md`, `docs/WINDOWS-CUTOVER.md` and `docs/PROJECT-LAYOUT-MIGRATION.md`. The former `preview-workspace-migration.mjs` helper has been retired. Keep production state and recovery backups separate from development fixtures, and verify only the business data and paths affected by a migration.

## Android

Install JDK 17 and Android SDK Platform 35, then run from the repository root:

```powershell
android\gradlew.bat -p android clean assembleDebug lintDebug
```

Build details and release-signing variables are in [android/README.md](../android/README.md).

## Project conventions

- Server and browser JavaScript use ECMAScript modules.
- HTTP routes use Express 5.
- The current `public/` browser application has no build step; the separate React preview in `web/` uses Vite.
- Changes to stored state include an explicit migration or a clear rejection of unsupported versions.
- Changes to App Server requests and events include focused tests and a manual compatibility check.
- Runtime data, build output, SDKs, signing material, downloaded tools, and release archives stay outside source control.
