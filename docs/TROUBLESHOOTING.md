# Troubleshooting

## Codex is unavailable

Open a new PowerShell window after installation and run:

```powershell
node --version
codex --version
codex login status
```

The service requires Node 20 or newer. Complete `codex login` before using Codex features. The web workbench remains available while Codex is missing or signed out. Run `codex doctor --summary` for a broader diagnostic, then restart the Node service if Codex does not reconnect.

## No private IPv4 address was found

The local workbench remains available. LAN access stays unavailable until the machine has an RFC1918 private IPv4 address (`10.x`, `172.16-31.x`, or `192.168.x`). Connect to the intended trusted LAN, then restart the Node service. VPN route priority can change which adapter is selected.

## The page opens on the server computer but not another device

- Confirm both devices use the same trusted network and the exact LAN address shown by CodexLAN.
- Confirm Windows labels that network as Private.
- Check guest Wi-Fi or client isolation settings.
- Run `Get-NetTCPConnection -LocalPort 8687 -State Listen` on the server computer.
- If necessary, add an inbound TCP rule for port `8687` to the Windows Private profile; do not create a Public-profile rule.

## The server exits during startup

Inspect the terminal output from `npm start`. Remove secrets and personal paths before sharing excerpts. Check the first reported startup error, the configured project root, and the selected LAN port.

Run:

```powershell
npm run check
codex login status
codex doctor
```

## First-run administrator page refuses setup

Create the first administrator from the loopback workbench address on the server machine, not from a phone or another LAN computer. If an administrator already exists, sign in with that account. Deleting runtime data is not a password-reset procedure; it also deletes application users, ownership, queues, and settings.

## Login works but writes fail

Check that the browser uses the exact service origin and is not switching between IP addresses, hostnames, HTTP, and HTTPS. Reverse proxies must preserve host and scheme consistently. Stale sessions after a password or account change require signing in again.

## Projects or files are missing

Projects created through the UI live under the configured workspace root. Confirm `CODEX_WORKDIR` points to the expected root, the service user can access it, and the directory was not moved. Deleting a project record does not delete its files, but moving a directory can invalidate its stored path.

## A Codex CLI update changed behavior

`app-server` is experimental. Stop the service, run `npm run check`, review the current official app-server documentation, and complete the compatibility checklist in [DEVELOPMENT.md](DEVELOPMENT.md). Do not replace production data while diagnosing protocol compatibility.

## Mobile timers or execution rows look stale

Return to the thread, refresh once, and verify the SSE connection is not blocked by a proxy or mobile network transition. Capture the browser error and sanitized server logs if the state remains wrong.
