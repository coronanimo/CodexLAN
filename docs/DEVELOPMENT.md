# Development

Use Windows PowerShell and Node 24 for frontend development. The deployed Node service supports Node 20+ and imports only production dependencies.

```powershell
npm ci
npm run web:build
npm run check
npm run web:typecheck
npm run web:test
```

Use isolated data, workspaces and the fake App Server for automated checks. Do not connect real accounts, send tasks, restart production or ask the user to reproduce machine-wide stutters as frontend acceptance.

## Development loop

```powershell
npm run dev
```

The Node service serves `dist/web/`. Build once first. Missing assets return a clear 503; there is no legacy page.

Choose either frontend loop:

```powershell
npm run web:dev
```

Vite HMR runs at `http://127.0.0.1:5173`. Its API proxy defaults to a separate development service at `http://127.0.0.1:8689`; set `LAN_API_ORIGIN` if needed. Use a separate development configuration and data directory.

```powershell
npm run web:watch
```

Watch rebuilds static files served by Node, preserving the save/refresh workflow without a server restart. Previous content-addressed assets remain available for open pages.

## Source ownership

- `web/src/app/`: composition and request/cache lifetimes.
- `web/src/features/`: editor, normalized timeline, controls, resource views and workspace components.
- `web/src/transport/`: neutral LAN DTOs, HTTP/CSRF and sequenced SSE.
- `shared/`: browser/server contracts.
- `server/core/`: authorization, application commands/queue and stream delivery.
- `server/agents/codex/`: provider-specific projection, pagination, options, requests and resources.
- `products/`: product manifests.
- `test/`: Node acceptance; `test/fixtures/` contains the fake upstream.
- `web/src/dev/`: fixture-only sources; never import them from product features.

See [the architecture diagram](ARCHITECTURE.md), [platform boundaries](LAN-PLATFORM.md) and [migration evidence](REACT-MIGRATION.md).

## Checks

Follow [AGENTS.md](../AGENTS.md): select verification by affected behavior, reuse valid evidence, and do not add file-hash inventories or unrelated test matrices.

`npm run check` checks server/runtime syntax and runs backend tests. `web:typecheck`, `web:test` and `web:build` validate shared types, React behavior and the production asset graph. CI builds assets on Node 24 once and supplies that artifact to the Node 20/22/24 runtime jobs.

Focused backend coverage includes projection/read overlap, stable nested pagination, queue delivery outcomes, scoped requests, HTTP permissions, uploads/downloads, and existing persistence/migration semantics. Frontend coverage includes local typing, row identity, selection cancellation, metadata isolation, window budgets, bounded rendering and resource lifetime.

For deterministic browser acceptance open `/acceptance.html` on the Vite server. It uses an in-memory client and fake data, including 2,000 tools, metadata updates and explicit output updates. `/fixtures.html` is a lower-level virtual list fixture. Neither entry is included in the production build.

Physical-phone responsiveness and Windows audio-driver/OS stalls require separate evidence; fixture frame timing does not establish either.

## Release

```powershell
./scripts/build-release.ps1
```

The script builds the web entry, creates a fresh release under `dist/releases/`, and installs only runtime dependencies there. It does not copy configuration, accounts or databases and does not activate a running installation. Keep rollback releases and backups separate from source cleanup.

For Android host changes, use JDK 17 and SDK Platform 35 and follow [android/README.md](../android/README.md). This frontend replacement preserves the existing Java bridge names; a simulated mobile browser is not native Android acceptance.
