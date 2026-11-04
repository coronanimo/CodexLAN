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

## Conversation acceptance

`node --test test/conversation-state.test.mjs test/conversation-order.test.mjs test/workspace-sync.test.mjs test/thread-selection.test.mjs test/async-user-input.test.mjs test/http-security.test.mjs` checks model order, read/completion overlap, stream scoping, selection, requests and the affected HTTP paths.

`node scripts/check-conversation-ui.mjs` starts an isolated service with the fake App Server and exercises the actual application in headless Edge at 1440×1000 and 390×844. It checks delayed text, refresh, guidance acknowledgement/metadata, two-device order, offline completion/reconnect, draft retention, async deferral, blocking-question submission, approval, tool expansion and history cursor loading. It prints screenshot paths below a fresh OS temporary directory and stops only its own service. It uses the existing development Playwright installation in `dsh-codex/node_modules`; `PLAYWRIGHT_MODULE` can point to another installed Playwright module and `PLAYWRIGHT_CHANNEL` selects another installed browser. No production data or signed-in Codex process is used. Inspect the resulting screenshots as part of acceptance.

For the turn footer, run `node scripts/check-conversation-ui.mjs --task-state`. It checks visible plans before/after completion and reload, a shared name/progress heading, and the 小结 running strip with right-aligned time and no copy button. Label/title typography and left offsets must match execution rows. Finished status, elapsed time, diff and command/Codex timing stay in one row with process copy, without an ellipsis control. Execution rows and footer strips share an outer height of 32px on desktop / 44px on mobile, including borders; only visible plans and genuine recovery records add content height. Screenshots cover desktop/mobile and 320px/700px layouts, including horizontal access to full timing on narrow screens with the copy control fixed.

For sending during SSE failure, run `node scripts/check-conversation-ui.mjs --send-recovery`. It blocks only SSE while HTTP remains available, checks accepted input and delayed content recovery, restores SSE and completes a blocking question without resubmission, then checks a 503 submission preserves the prompt for an explicit retry.

For account quota synchronization, run `node --test test/account-rate-limits.test.mjs test/conversation-stream.test.mjs` and `node scripts/check-conversation-ui.mjs --account-limits`. The browser holds the quota HTTP response while refreshing an existing conversation: history must appear before that response completes. Ten token notifications and two quota-bucket notifications must cause no extra reads, display Codex 37%/68% rather than the unrelated bucket, and survive a late stale response. Offline recovery performs one read. Unit checks cover shared bucket semantics, cache expiry, concurrent reads and late success/failure races. The screenshot shows the existing account menu, not a new UI. Browser timings use the isolated fake App Server and do not represent production page-load measurements.

For message headers and typography, run `node scripts/check-conversation-ui.mjs --message-layout`. CODEX and guidance must share insets, role/body sizes, body color/line height and header height; both left edges must align with execution labels. It also checks answer-copy placement in the CODEX/timestamp row, no trailing action row, 12px role labels / 11px timestamps / 13px body text, mobile PDF/share controls, and 390px/320px layouts. Keyboard copy must preserve the original Markdown, and a canonical-history reload must retain the header placement. It saves answer and guidance screenshots at each size.

For question controls, run `node scripts/check-conversation-ui.mjs --controls`. It checks computed typography, keyboard radio selection, conditional “other” input, in-place deferral with draft retention, focus/order through streamed updates and network interruption, explicit retry after a 503 without automatic resubmission, keyboard submission and read-only answers. Reloads must retain deferred/answered state. It also checks 320px/700px overflow, 16px radios, 44px controls, and no-data/failed/stopped footer variants including unknown timing. Screenshots include desktop/mobile pending, deferred and answered views. `node --test test/conversation-presentation.test.mjs test/async-user-input.test.mjs` checks the related pure presentation and delivery contracts.

For new-conversation sidebar state, run `node scripts/check-conversation-ui.mjs --sidebar-state`. It holds the creation HTTP acknowledgement until the real service's SSE discovery reaches the browser, then checks the first message's running indicator, renaming, and completion across the project list, recent list and conversation switcher. Screenshots are saved in the printed temporary directory.

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
