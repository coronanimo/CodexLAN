# CodexLAN

[English](README.md) | [简体中文](README.zh-CN.md)

CodexLAN is a self-hosted Windows workspace for using a local Codex CLI from desktop and mobile browsers on the same network. It supports projects, Codex conversations, live execution, queues, attachments, Markdown, and formula rendering.

This is an independent community project built on the experimental `codex app-server` interface.

## Features

- Continue Codex conversations from PC, iPhone, and Android.
- View streamed reasoning, commands, output, file changes, usage, and elapsed time.
- Send guidance during a turn or queue work for later.
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
npm start
```

The terminal prints a loopback workbench address and, when available, a private-LAN address. Open the loopback address on the server machine to create the first administrator.

The default LAN port is `8687`. Source runs store application state in `data/` and create projects below `workspace/`. Set a different project root before startup when needed:

```powershell
$env:CODEX_WORKDIR = 'D:\Code'
$env:CODEX_WEB_PORT = '8687'
npm start
```

If Windows Firewall blocks other devices on a Private network, add an inbound rule from an elevated PowerShell window:

```powershell
New-NetFirewallRule -DisplayName 'CodexLAN 8687' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8687 -Profile Private
```

## Clients and packages

- PC and iPhone use the web interface directly. Safari users can add the workbench to the Home Screen from the Share menu; the mobile top bar keeps a page-refresh button available in standalone mode.
- The optional Android WebView client is under [`android/`](android/).
- Current artifact status and release procedures are in [docs/RELEASES.md](docs/RELEASES.md).

## Security

CodexLAN can execute commands and access files with the permissions of the Windows account running it. Web accounts share that Windows identity, Codex login, and usage limits. Use the service only on a trusted private network with trusted users, and choose the smallest practical project root.

The built-in listener is plain HTTP. Do not expose it directly to the public internet. See [SECURITY.md](SECURITY.md) before configuring remote access or additional users.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Deployment, backup, and upgrades](docs/DEPLOYMENT.md)
- [Development](docs/DEVELOPMENT.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Android](android/README.md)
- [Releases](docs/RELEASES.md)
- [Contributing](CONTRIBUTING.md)

## Development

Run the complete JavaScript check and test suite with:

```powershell
npm run check
```

Known work is tracked in [TODO.md](TODO.md). User-facing changes are recorded in [CHANGELOG.md](CHANGELOG.md).

CodexLAN is available under the [MIT License](LICENSE).
