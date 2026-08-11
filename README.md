# CodexLAN

[English](README.md) | [简体中文](README.zh-CN.md)

CodexLAN runs Codex on a Windows computer and exposes the conversation workspace to browsers on the same trusted network. The browser is only the interface: commands, file access, Codex authentication, and conversation history remain on the server computer.

This is an independent community project built against the experimental `codex app-server` protocol. It is not an OpenAI product.

## What it provides

- One conversation workspace for desktop and mobile browsers, with an optional Android WebView client.
- Live reasoning, commands, output, file changes, elapsed time, context usage, and account limits.
- Guidance for the active turn, a persistent queue for later work, Plan mode, and long-running Goals with pause, resume, clear, and optional token budgets.
- Multiple web accounts, project ownership, attachments, file preview and download, Markdown, tables, and local formula rendering.

## Requirements

- Windows 10 or 11 on the server computer.
- Node.js 20 or newer.
- Codex CLI installed and signed in.
- A current browser on each client device.
- Android 8.0 or newer only when using the optional Android client.

## Start the service

From the repository root:

```powershell
codex login
codex login status
npm ci
Copy-Item config\codexlan.example.json config\codexlan.json
npm run service:start
```

Open the local address printed by the service and create the first administrator account. Other devices use the printed LAN address.

The checked-in example is deliberately machine-neutral:

```json
{
  "$schema": "./codexlan.schema.json",
  "port": 8688,
  "host": "auto",
  "dataRoot": "../data",
  "codexBin": null
}
```

Edit the copied `config/codexlan.json`, not the example file. Supported settings are:

| Setting | Meaning |
| --- | --- |
| `port` | HTTP port shared by loopback and LAN access. Default: `8688`. |
| `host` | `auto` selects a private IPv4 interface; `127.0.0.1` disables LAN access. |
| `dataRoot` | Accounts, sessions, queues, thread settings, and supervisor state. Relative paths resolve from `config/`. |
| `workspaceRoot` | Optional boundary for automatically managed user projects. When omitted, CodexLAN uses `<dataRoot>/projects`. Existing projects may still point to their own absolute directories. |
| `codexBin` | Optional path to a specific Codex executable. `null` uses `codex` from `PATH`. |

Unknown settings and invalid values stop startup with an error instead of being ignored.

## Service commands

| Command | Action |
| --- | --- |
| `npm run service:start` | Start the background supervisor and wait for readiness. |
| `npm run service:status` | Show supervisor PID, server PID, state, and addresses. |
| `npm run service:log` | Print the latest service log entries. |
| `npm run service:restart` | Restart the server through the existing supervisor. Run this from an external terminal. |
| `npm run service:stop` | Stop the server and supervisor. Run this from an external terminal. |
| `npm start` | Run the server in the foreground for development. |

The supervisor restarts a server that crashes after reaching readiness. Its control state is stored below `dataRoot`; logs are written to `logs/codexlan.log`.

## Network access

With `host: "auto"`, CodexLAN listens on the configured port and accepts requests through loopback and one selected private IPv4 interface. If another device cannot connect, confirm that Windows marks the network as Private. For the default port, an elevated PowerShell can add this firewall rule:

```powershell
New-NetFirewallRule -DisplayName 'CodexLAN 8688' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8688 -Profile Private
```

The built-in listener is plain HTTP. Do not expose it directly to the public internet.

## Data and trust boundary

CodexLAN executes with the Windows identity that started the service. Web accounts isolate CodexLAN projects and sessions from each other, but they still share that Windows identity, the same Codex login, and the same Codex usage limits. Only give accounts to people who are trusted to use that computer's Codex environment.

Runtime data is not committed:

- `config/codexlan.json`: local server configuration.
- `data/`: application and supervisor state when the example configuration is used.
- `logs/`: service logs.
- Project directories: source files and project-local attachments.

See [Security](docs/SECURITY.md) before adding users or changing network exposure.

## Repository layout

- `server/`: HTTP service, App Server client, persistence, configuration, and supervisor.
- `public/`: shared browser interface and desktop/mobile styles.
- `android/`: optional Android WebView client.
- `test/`: automated tests and the fake App Server fixture.
- `docs/`: architecture, deployment, development, troubleshooting, release, and project documents.

## Development

Run syntax checks and the complete test suite with:

```powershell
npm run check
```

More detail is available in [Architecture](docs/ARCHITECTURE.md), [Deployment](docs/DEPLOYMENT.md), [Development](docs/DEVELOPMENT.md), and [Troubleshooting](docs/TROUBLESHOOTING.md). User-visible changes are recorded in the [changelog](docs/CHANGELOG.md), and known work is tracked in [TODO](docs/TODO.md).

CodexLAN is available under the [MIT License](LICENSE).
