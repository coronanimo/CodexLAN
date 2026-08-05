# Deployment, Backup, and Upgrades

## Supported deployment

The verified deployment target is a Windows 10/11 host on a trusted private LAN. The built-in launcher is not a Windows service installer and the Node listener does not provide TLS.

```powershell
.\Start-Codex-Web.ps1 [-Workspace <directory>] [-Port <port>] [-OpenFirewall]
```

- `Workspace`: root that may contain user-managed project directories; defaults to repository-local `workspace/`.
- `Port`: HTTP port, default `8687`.
- `OpenFirewall`: creates an inbound rule for the Windows Private network profile and requires elevation.

The launcher checks for Node and Codex, selects a private IPv4 address on the default route, binds only to that address, starts the Node child process, and monitors `/api/health`. Keep its PowerShell process running. It prints the access URL and first-run setup information directly.

## First administrator

There is no default username or password. On an empty `data/` directory, the server creates a one-time setup token and prints it in the launcher terminal. Use it to create the first administrator. The token cannot initialize another administrator after users exist.

The same output is recorded in `logs/service-supervised.out.log`. Treat that log as sensitive while the setup token is valid.

## LAN checklist

1. Keep the Windows network profile set to Private.
2. Select the smallest practical workspace root.
3. Start without `-OpenFirewall` first; add a rule only if another LAN device cannot connect.
4. Allow accounts only for mutually trusted people.
5. Prevent host sleep while long-running work must remain reachable.

## HTTPS and remote access

Do not forward the service port directly from a router. For remote access, place a maintained reverse proxy or private-network gateway in front of the service, use a trusted HTTPS certificate, restrict who can reach it, and retain an end-to-end threat model. The proxy must preserve the requested host correctly because the service enforces same-origin checks and marks cookies Secure when it observes HTTPS-forwarding headers.

No reverse-proxy recipe is currently declared verified. Validate login, logout, CSRF-protected writes, SSE streaming, large uploads, downloads, timeouts, and secure cookies before relying on a chosen proxy. CGNAT and router NAT-loopback behavior are network constraints, not application features.

## Backup

Stop the launcher before taking a consistent backup. Back up separately and protect:

- `data/`: users, password hashes, sessions, ownership, queues, and UI state.
- The configured workspace root and project files.
- Codex CLI configuration and conversation state only if your recovery plan requires them.

Do not put backups in the repository or a public release. Test restoration with the same Windows user permissions and a compatible Codex CLI version.

## Upgrade procedure

1. Read `CHANGELOG.md` and known issues.
2. Back up `data/` and every configured workspace.
3. Stop the launcher and confirm the Node/app-server processes have exited.
4. Replace source files without replacing runtime data.
5. Run `npm run check`.
6. Start with the previous arguments and run the app-server compatibility checks in [DEVELOPMENT.md](DEVELOPMENT.md).
7. Keep the backup until login, projects, history, queues, files, and active work are verified.

There is not yet a formal data migration or rollback framework. Never downgrade over the only copy of production data.
