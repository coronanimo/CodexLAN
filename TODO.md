# Roadmap and Audited Technical Debt

This list records known gaps; it is not a promise of release dates.

## Security and tests

- Expand HTTP integration coverage to password/session invalidation, administrator download success cases, malformed requests, and concurrency; the initial setup, login throttling, session, authorization, CSRF, same-origin, role, and path-containment suite is in place.
- Add upload boundary, size-limit, partial-file cleanup, and filename tests.
- Add SSE reconnect and queue recovery integration tests.
- Add contract tests against a pinned real Codex CLI/app-server version.
- Add Android automated navigation, file chooser, download, and connection-setting tests.
- Review and narrow the administrator local-file download capability.

## Reliability and operations

- Add structured logs, rotation, startup diagnostics, and a documented service-manager installation path.
- Replace manual static asset query versions with a repeatable release mechanism.
- Add a tested HTTPS reverse-proxy reference configuration.
- Define data-format migrations, rollback expectations, and release upgrade tests.

## Maintainability

- Split `server.mjs`, `public/app.js`, and `public/styles.css` incrementally without changing the wire protocol or stored data format.
- Document or generate the app-server compatibility snapshot used for each release.
- Add accessibility and mobile-browser regression checks.

## Release engineering

- Add a pinned Gradle wrapper and clean-checkout Android CI build.
- Establish Android release signing, certificate fingerprint checks, SHA-256 checksums, provenance, and GitHub Release automation.
- Add a CI gate that inventories APK native libraries and records whether the artifact is ABI-independent or ABI-specific.
- Build and test Node-bundled Windows portable ZIPs separately for x64 and ARM64.
- Add Windows architecture detection, Codex CLI/app-server preflight, login diagnostics, and a version manifest.
- Decide whether a later Windows package may bundle a pinned official Codex CLI artifact; implement license notices, checksum verification, and update policy first.
- Prove portable upgrades and mutable-data preservation before choosing and building an installer.
- Verify host support before adding Linux or macOS launchers or compatibility claims.

See [docs/RELEASES.md](docs/RELEASES.md) for artifact definitions and release gates.
