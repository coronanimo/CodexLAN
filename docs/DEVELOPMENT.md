# Development

## Setup

Use Windows 10/11, Node.js 20+, and an installed Codex CLI. No `npm install` is required because there are no npm runtime or development dependencies.

```powershell
codex login status
npm run check
.\Start-Codex-Web.ps1 -Workspace '.\workspace'
```

Use disposable application data and workspaces for testing. Never copy real users, sessions, chats, logs, attachments, Codex credentials, or production workspaces into fixtures.

## Architecture and protocol

See [ARCHITECTURE.md](ARCHITECTURE.md). The service spawns `codex app-server --listen stdio://`, performs the required initialize handshake, and exchanges newline-delimited JSON. This interface is experimental. The implementation is intentionally a thin adapter around the current protocol rather than a promise of stable third-party API compatibility.

Binary distribution work is tracked separately in [RELEASES.md](RELEASES.md). A locally successful build is not sufficient evidence for a publishable artifact.

## Checks

```powershell
npm run check
```

The command performs `node --check` on server and browser modules, then runs `node --test`. Add focused pure-function tests under `test/` where possible. The HTTP security suite starts the real Node service on loopback with disposable data/workspace directories and `test-support/fake-app-server.mjs`; it must never use production state. Broader HTTP/API cases, real app-server compatibility, SSE, and Android automation remain explicit gaps.

For a Codex CLI upgrade, manually check:

1. app-server initialization and model list;
2. project selection and thread create/list/resume;
3. turn start, streamed reasoning, commands, output, and diffs;
4. steering, queued prompts, interruption, and reconnect;
5. history pagination, elapsed-time restoration, usage, and rate limits;
6. file upload, preview, project download, and administrator download boundaries.

## Editing rules

- Keep path resolution, ownership, authentication, authorization, same-origin, and CSRF checks at every protected boundary.
- Do not change the stored data format or app-server mapping merely to reorganize files.
- Active state must survive SSE reconnect and page navigation through persisted data, not DOM-only state.
- Steering, interruption, and queue advancement must remain idempotent under retries.
- When entry assets change, update the query version in `public/index.html` until automated asset versioning exists.
- Keep the browser application build-free unless a separately reviewed design changes that constraint.

## Runtime directories

`data/`, `logs/`, `workspace/`, `.codex-remote-attachments/`, `generated-schema/`, Android SDKs, Gradle caches, builds, APKs, signing keys, and release archives are not source. Review `git status` before every commit even when `.gitignore` is present.

## Android

The Android module is a WebView client only. Use Android Studio with JDK 17 and SDK Platform 35. Do not commit `local.properties`, Gradle caches, build output, or signing material. See [android/README.md](../android/README.md).
