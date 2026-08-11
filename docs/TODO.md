# Open Work

This file lists unfinished project-level work.

## Product

- Finish splitting `public/app.js` into the existing workspace, layout, composer, plan, desktop, and mobile modules. Conversation rendering, live execution, dispatch, and account settings still need clear owners.
- Add a shared slash-command picker for Plan, Goal, and context compaction.
- Improve keyboard navigation, screen-reader labels, and mobile-browser regression coverage.

## Reliability

- Expand HTTP integration tests for session invalidation, uploads, downloads, malformed requests, and concurrent queue operations.
- Test SSE reconnection with running turns and non-empty queues in a browser.
- Add compatibility tests against a pinned Codex CLI release.
- Add structured log rotation and backup/restore tests for application state.
- Publish one tested HTTPS reverse-proxy example.

## Clients and releases

- Establish the Android release key and automate signed APK verification and publication.
- Add Android tests for navigation, server switching, attachments, and downloads.
