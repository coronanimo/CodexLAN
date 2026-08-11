# Development

## Setup

Development is currently supported on Windows 10 and 11 with Node.js 20 or newer and an installed Codex CLI.

```powershell
codex login status
npm ci
npm run check
npm start
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

```powershell
npm run check
```

This checks the JavaScript entry points and runs the Node test suite. The HTTP tests start a real CodexLAN service on loopback with temporary data, a temporary workspace, and the fake App Server.

Use a real Codex CLI when changing protocol handling. Check initialization, authentication, model listing, thread creation and history, turn execution, steering, queues, interruption, reconnection, command output, file changes, token usage, and account limits.

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
