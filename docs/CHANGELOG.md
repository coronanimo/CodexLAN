# Changelog

Notable changes to CodexLAN are recorded here. Versions follow [Semantic Versioning](https://semver.org/).

## Unreleased

### Added

- Android WebView client with a draggable local control orb, multi-server switching, system file picking, downloads, and Android share-target support.
- Plan mode, manual context compaction, and interactive Codex questions in the conversation.
- Goal mode management with persistent status, optional token budgets, automatic continuation, and slash-command controls.
- Clipboard image paste, attachment previews, project-local attachment storage, and image-only messages.
- Final answers can be copied as original Markdown, separately from the Plan and execution process.
- Markdown, fenced code, tables, links, and local KaTeX formula rendering in assistant messages.
- Loopback-only first-administrator setup, member accounts, sessions, password management, CSRF checks, and login throttling.
- Node and Android CI builds plus isolated HTTP security tests.
- A page-refresh control in the mobile top bar for iPhone Home Screen use.
- Strict JSON server configuration and a detached supervisor with explicit start, stop, restart, and status commands.
- Self-service display-name editing without changing the login identifier.
- Secure previews for Codex-generated interactive HTML visualizations.
- Android sharing for Markdown and generated PDF documents, with a read-only cache-backed file provider.
- Per-browser background completion reminders and configurable desktop send shortcuts.

### Changed

- Desktop and mobile now use separate responsive layouts over one shared web application and state model.
- The light interface now uses responsibility-based CSS files, a clear-blue semantic palette, and a denser sidebar with quieter typography.
- The sidebar can organize navigation by project or recent conversation, with independent original-order and recent-use sorting. Workspace refresh and configuration actions live in the account menu.
- Command output is streamed incrementally, retains ANSI styling across chunks, and trims old visible output to keep the composer responsive.
- Consecutive commands appear as one expandable group with aligned timing.
- Recent conversations are ordered by each user's latest access and shown in a scrollable switcher.
- Codex threads are associated with projects by their canonical working directory, including conversations created in the official Codex App.
- Member projects are confined to their managed workspace subtree; administrators may select other absolute directories.
- Queued tasks remain visible until App Server accepts delivery. Guidance and messages sent to idle chats appear immediately and reconcile with Codex history.
- The local workbench remains available while Codex is missing, signed out, or reconnecting, and while LAN publishing is unavailable.
- Runtime state, queue revisions, timing, and thread access metadata now live in the server state instead of browser storage.
- The Android application ID is now `com.hushiwei.codexlan`; installations using the previous private ID require a fresh install.
- User-facing copy refers to the Windows machine as the server computer rather than the retired Host product name.
- Loopback and LAN access now share one listener and one port instead of running two HTTP servers.
- File previews expose reliable copy and share actions; Android routes these through native clipboard, document, browser, and print capabilities when appropriate.
- Connection details and durable preferences now share one compact settings surface; redundant refresh and execution controls were removed.

### Fixed

- Dialogs can be cancelled with their cancel button, Escape, or a backdrop click without triggering form validation.
- Display-name saving uses an explicit form flow with visible progress and inline errors.
- Assistant file references keep their filename while also offering preview and download actions.
- Command output remains available after reopening a chat, and PowerShell launcher paths no longer obscure command titles.
- Queue-to-guidance conversion no longer hides the message while the request is in progress.
- Dynamic terminal colors, composer sizing, usage meters, and KaTeX layout now comply with the application's Content Security Policy.
- Foreground resumes, background throttling, and silent SSE connections recover without leaving long-running conversations visually frozen.
- Stop requests return promptly while Goal pausing and queue recovery finish independently, with stale-turn protection and bounded App Server timeouts.
- Hiding the browser no longer deliberately closes its event stream, so background turns can continue updating and report completion.

## 0.6.11 - Imported production baseline

- Imported the source baseline used to begin CodexLAN development.
