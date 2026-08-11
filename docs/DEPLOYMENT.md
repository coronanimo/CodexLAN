# Deployment, Backup, and Upgrades

## Supported deployment

The verified deployment target is a Windows 10/11 server computer on a trusted private LAN. The Node listener does not provide TLS.

```powershell
Copy-Item config\codexlan.example.json config\codexlan.json
npm run service:start
```

`config/codexlan.json` is the authoritative local configuration. It supports `port`, `host`, `workspaceRoot`, `dataRoot`, and `codexBin`; relative paths resolve from the config file. Environment variables remain available when a key is absent, primarily for tests and temporary launches.

The server uses one shared listener. With `host: "auto"`, it binds once to `0.0.0.0:<port>` and accepts requests only through loopback or the selected private IPv4 interface. The supervisor performs a port preflight, reports deterministic startup failures once, and only auto-restarts a process that had already reached ready state.

```powershell
npm run service:status
npm run service:restart
npm run service:stop
```

The service currently runs from source and requires Node.js. There is no Windows binary package.

## First administrator

There is no default username or password. On empty application state, open the printed loopback workbench address on the server machine and create the first administrator. The setup endpoint rejects LAN clients and creates the administrator's default project at the same time.

## LAN checklist

1. Keep the Windows network profile set to Private.
2. Set `workspaceRoot` to the smallest shared boundary containing the managed user directories.
3. Start without a firewall rule first; add a Private-profile rule only if another LAN device cannot connect.
4. Allow accounts only for mutually trusted people.
5. Prevent the server computer from sleeping while long-running work must remain reachable.

## HTTPS and remote access

Do not forward the service port directly from a router. For remote access, place a maintained reverse proxy or private-network gateway in front of the service, use a trusted HTTPS certificate, and restrict who can reach it. The proxy must preserve the requested host and scheme because the service enforces same-origin checks and marks cookies Secure for HTTPS.

The project does not yet include a tested reverse-proxy configuration. Test login, logout, writes, SSE, uploads, downloads, timeouts, and secure cookies with the selected proxy.

## Backup

Stop CodexLAN before taking a consistent backup. Back up separately and protect:

- Configured `dataRoot`, or `data/` by default: users, password hashes, sessions, ownership, queues, UI state, and supervisor state.
- `logs/`: supervisor and server logs.
- Every registered project directory and its files.
- Codex CLI configuration and conversation state when they are part of the recovery scope.

Do not put backups in the repository or a public release. Test restoration with the same Windows user permissions and a compatible Codex CLI version.

## Upgrade procedure

1. Read `CHANGELOG.md` and known issues.
2. Back up `data/` and every configured workspace.
3. Run `npm run service:stop` and confirm the Node/app-server processes have exited.
4. Replace source files without replacing runtime data.
5. Run `npm run check`.
6. Start with `npm run service:start` and run the app-server compatibility checks in [DEVELOPMENT.md](DEVELOPMENT.md).
7. Keep the backup until login, projects, history, queues, files, and active work are verified.

State upgrades are one-way. Version 9 state migrates directly to version 13; unsupported versions fail at startup. Keep a backup when testing an upgrade or downgrade.
