# Contributing

Thanks for helping improve Codex LAN Workspace. This project values small, reviewable changes that preserve behavior and make security boundaries easier to understand.

## Before opening a change

1. Read [SECURITY.md](SECURITY.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
2. Discuss protocol changes, persistence-format changes, broad rewrites, and new host-platform claims before implementation.
3. Never use production account data, logs, chats, or real workspaces as fixtures.

## Development setup

Requirements are Windows 10/11, Node.js 20+, and a signed-in Codex CLI for manual integration testing. The automated checks do not require npm package installation:

```powershell
npm run check
```

For an isolated manual run:

```powershell
.\Start-Codex-Web.ps1 -Workspace '.\workspace'
```

## Change rules

- Keep file access within the configured workspace and preserve project ownership checks.
- State-changing routes must keep authentication, authorization, same-origin, and CSRF protections.
- Preserve reconnect and persistence behavior for active turns, queues, timing, and SSE events.
- Add focused tests for bug fixes and behavior changes.
- Update both READMEs when user-facing setup or risk guidance changes.
- Update `CHANGELOG.md` under `Unreleased` for user-visible changes.
- Do not claim Linux, macOS, browser, Android, HTTPS, or release support that was not actually verified.

## Commits and pull requests

Use concise imperative commit subjects. A pull request should explain the user-visible outcome, security impact, checks run, manual verification, and any compatibility risk with Codex app-server. Screenshots are useful for visual changes but must not contain private chats or paths.

By participating, you agree to follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
