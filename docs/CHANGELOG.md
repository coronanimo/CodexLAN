# Changelog

Notable changes to CodexLAN are recorded here. Versions follow [Semantic Versioning](https://semver.org/).

## Unreleased

### Added

- Independent `autoApproveBrowser` configuration to allow local browser control without per-conversation approval cards. It defaults to `false` and still enforces Codex browser policy and active-conversation checks.
- Android WebView client with a draggable local control orb, multi-server switching, system file picking, downloads, and Android share-target support.
- Plan mode, manual context compaction, and interactive Codex questions in the conversation.
- Goal mode management with persistent status, optional token budgets, automatic continuation, and slash-command controls.
- Clipboard image paste, attachment previews, project-local attachment storage, and image-only messages.
- Final answers can be copied as original Markdown independently of full-turn copy.
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

- Individual-answer copy now shares the CODEX/timestamp header instead of occupying a trailing row. Message labels use 12px, timestamps 11px and body text 13px, with aligned left edges, quieter emphasis and tighter paragraph spacing; mobile PDF/share actions stay in the same header. Question forms retain their own readable scale.
- Plans stay visible, with name and progress sharing their heading. Running turns use a 小结 strip with current status and total diff in the middle, right-aligned elapsed time, and no copy button. It shares label/title typography, columns and padding with image, command and reasoning rows. Finished summaries keep status, elapsed time, diff, command/Codex timing and copy on one line, without an ellipsis button; narrow screens can scroll the metadata horizontally while copy stays fixed. Copy now includes the entire turn: prompts/guidance, progress, reasoning, tools and outputs, plan/diff and final replies, without an extra export truncation. It remains visible for answer-only, failed and stopped turns. File counts and added/removed lines replace the bold blue file-change label.
- Async questions use one coherent pending/deferred/answered presentation. Deferral preserves the live form and draft; answered questions become one-line read-only disclosures. Questions, approvals and execution controls share typography, spacing and touch-target scales, without nested option cards or oversized radio inputs.
- Conversation history, streaming and reconnect now share one identity-ordered model and renderer. Approvals and blocking questions use a persistent pending-action dock on desktop and mobile. Unknown-position recovery records are labelled instead of inserted by message type.
- Desktop and mobile now use separate responsive layouts over one shared web application and state model.
- The light interface now uses responsibility-based CSS files, a clear-blue semantic palette, and a denser sidebar with quieter typography.
- The sidebar can organize navigation by project or recent conversation, with independent original-order and recent-use sorting. Workspace refresh and configuration actions live in the account menu.
- Command output is streamed incrementally, retains ANSI styling across chunks, and trims old visible output to keep the composer responsive.
- Execution entries expand individually without grouping across messages or hiding final answers.
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

- Token-usage updates no longer trigger account quota queries. Quota notifications directly update the cache and interface by bucket, with coalesced fallback reads and protection against stale responses. Initial quota loading no longer blocks conversation restoration; reconnect recovers missed quota updates.
- Temporary SSE failures no longer prevent HTTP task submission or erase the prompt. Disconnected conversations refresh through HTTP until live updates reconnect; accepted tasks are never automatically resubmitted. New/deleted-file diff counts exclude patch headers.
- A missing plan no longer crashes the new turn footer. Recovery commands remain included in full-turn copy and timing without inventing their transcript positions. Question submission failures retain answers without automatic retries, and keyboard submission retains a useful focus target after the form becomes read-only.
- New-conversation creation acknowledgements and SSE discovery now merge into one thread identity. Project and recent lists immediately share running indicators and renamed titles, and late list responses retain concurrently discovered conversations.
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
