# CodexLAN

[English](README.md) | [简体中文](README.zh-CN.md)

CodexLAN is a self-hosted Windows workspace for using a local Codex CLI from desktop and mobile browsers on the same network. It supports projects, Codex conversations, live execution, queues, attachments, Markdown, and formula rendering.

This is an independent community project built on the experimental `codex app-server` interface.

## Features

- Continue Codex conversations from PC, iPhone, and Android.
- View streamed reasoning, commands, output, file changes, usage, and elapsed time.
- Send guidance during a turn or queue work for later.
- Run durable Goal work with live status, optional token budgets, and `/goal`, `/goal pause`, `/goal resume`, and `/goal clear` controls.
- Paste images, upload files, preview supported files, and download project content.
- Separate administrator and member accounts with per-account projects and sessions.
- Use the Android WebView client to switch between saved servers even when a server is offline.

## Requirements

| Component | Requirement |
| --- | --- |
| Server computer | Windows 10 or 11 |
| Node.js | 20 or newer for source runs |
| Codex | Codex CLI installed and signed in |
| Browser | A current desktop or mobile browser |
| Android client | Android 8.0 / API 26 or newer |

## Start from source

Install and sign in to Codex CLI, then run:

```powershell
codex login
codex login status
npm ci
Copy-Item config\codexlan.example.json config\codexlan.json
npm run service:start
```

Edit `config/codexlan.json` before startup. The supervisor runs in the background, restarts a server that crashes after reaching ready state, stores its control state below `dataRoot`, and writes service output to `logs/codexlan.log`. Use `npm run service:status`, `npm run service:restart`, and `npm run service:stop` to manage it. `npm start` remains available for foreground development.

The configured port is shared by loopback and the selected private-LAN address. `config/` contains configuration, `data/` contains application and supervisor state, and `logs/` contains logs. `workspaceRoot` defines the shared multi-user workspace boundary. Each project retains its own absolute path, while managed user projects are created below `<workspaceRoot>/<username>/`.

If Windows Firewall blocks other devices on a Private network, add an inbound rule from an elevated PowerShell window:

```powershell
New-NetFirewallRule -DisplayName 'CodexLAN 8688' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8688 -Profile Private
```

## Clients and packages

- PC and iPhone use the web interface directly. Safari users can add the workbench to the Home Screen from the Share menu; the mobile top bar keeps a page-refresh button available in standalone mode.
- The optional Android WebView client is under [`android/`](android/).
- Current artifact status and release procedures are in [docs/RELEASES.md](docs/RELEASES.md).

## Security

CodexLAN can execute commands and access files with the permissions of the Windows account running it. Web accounts share that Windows identity, Codex login, and usage limits. Use the service only on a trusted private network with trusted users, and choose the smallest practical project root.

The built-in listener is plain HTTP. Do not expose it directly to the public internet. See [Security](docs/SECURITY.md) before configuring remote access or additional users.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Deployment, backup, and upgrades](docs/DEPLOYMENT.md)
- [Development](docs/DEVELOPMENT.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Android](android/README.md)
- [Releases](docs/RELEASES.md)
- [Contributing](docs/CONTRIBUTING.md)

## Development

Run the complete JavaScript check and test suite with:

```powershell
npm run check
```

Known work is tracked in [TODO](docs/TODO.md). User-facing changes are recorded in the [changelog](docs/CHANGELOG.md).

CodexLAN is available under the [MIT License](LICENSE).
