# Troubleshooting

## Launcher says Node or Codex is missing

Open a new PowerShell window after installation and run:

```powershell
node --version
codex --version
codex login status
```

Node must be version 20 or newer. Complete `codex login` before starting the workspace. `codex doctor` can provide a broader Codex installation and authentication diagnostic.

## No private IPv4 address was found

The launcher intentionally refuses to bind when the default route has no RFC1918 private IPv4 address. Connect the host to the intended trusted LAN, confirm the adapter has a `10.x`, `172.16-31.x`, or `192.168.x` address, then retry. VPN route priority can change which adapter is selected.

## The page opens on the host but not another device

- Confirm both devices use the same trusted network and the exact address printed by the launcher.
- Confirm Windows labels that network as Private.
- Check guest Wi-Fi or client isolation settings.
- Run `Get-NetTCPConnection -LocalPort 8687 -State Listen` on the host.
- If necessary, restart from elevated PowerShell with `-OpenFirewall`; do not create a Public-profile rule.

## The server repeatedly restarts

Inspect `logs/supervisor.log`, `logs/service-supervised.err.log`, and `logs/service-supervised.out.log`. Remove secrets and personal paths before sharing excerpts. Common causes include an incompatible Codex CLI/app-server version, expired authentication, an unavailable workspace, or a port conflict.

Run:

```powershell
npm run check
codex login status
codex doctor
```

## First-run setup token is missing

The token is printed only while no users exist. Check the same launcher terminal and then `logs/service-supervised.out.log`. If users already exist, use an existing administrator account; deleting runtime data to force setup also deletes application users, ownership, queues, and settings and is not a password-reset procedure.

## Login works but writes fail

Check that the browser uses the exact service origin and is not switching between IP addresses, hostnames, HTTP, and HTTPS. Reverse proxies must preserve host and scheme consistently. Stale sessions after a password or account change require signing in again.

## Projects or files are missing

Projects created through the UI live under the configured workspace root. Confirm the launcher uses the expected `-Workspace`, the service Windows user can access it, and the directory was not moved. Deleting a project record does not delete its files, but moving a directory can invalidate its stored path.

## A Codex CLI update changed behavior

`app-server` is experimental. Stop the service, run `npm run check`, review the current official app-server documentation, and complete the compatibility checklist in [DEVELOPMENT.md](DEVELOPMENT.md). Do not replace production data while diagnosing protocol compatibility.

## Mobile timers or execution rows look stale

Return to the thread, refresh once, and verify the SSE connection is not blocked by a proxy or mobile network transition. Capture the browser error and sanitized server logs if the state remains wrong. The test suite covers reconstruction helpers, but real SSE and app-server integration are not yet automated.
