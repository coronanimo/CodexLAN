# CodexLAN

[English](README.md) | [简体中文](README.zh-CN.md)

**A fast, direct LAN control surface for Codex on your Windows workstation.**

## Why CodexLAN exists

Official remote access is convenient, but a relayed connection can feel slow when the route to the remote service is poor. That cost is especially noticeable for users in regions with high cross-border latency: even two devices on the same LAN may communicate through a distant relay.

CodexLAN takes the short path. A browser connects directly to the Windows computer running Codex, so prompts, streamed events, conversation switches, and control actions stay on the local network. The workstation keeps the repositories, tools, credentials, and Codex login; other screens get a responsive interface for the same work.

This is an independent community project built against the experimental `codex app-server` protocol. It is not an OpenAI product.

## Best fit

- Developers and researchers who keep a Windows workstation online and want low-latency access from another computer or phone.
- Users whose route to an official remote relay is slower than their direct home or office network.
- People running long or multi-step tasks who need to inspect, steer, queue, pause, and resume work away from the desk.
- Small groups of mutually trusted users sharing one Windows environment and Codex account while keeping CodexLAN projects and conversations separate.

CodexLAN is not designed as a public SaaS or as isolation for untrusted tenants. Web accounts separate application data; they do not create separate Windows identities or separate Codex subscriptions.

## What changes in daily use

### Direct LAN interaction

Prompts and live events travel directly between the browser and the workstation. On a stable LAN, sending, streaming, switching conversations, and stopping work stay responsive without depending on a remote relay path.

### Continue from any screen

Start at the desk and check the same run from a phone or laptop. Inspect current output, steer the active turn, stop it, or download generated files. iPhone works through the browser or a Home Screen shortcut; Android also has an optional WebView client.

### More than one prompt at a time

Queue follow-up tasks while a turn is running, send guidance without restarting, enter Plan mode before implementation, or create a long-running Goal with pause, resume, clear, elapsed usage, and an optional token budget.

### Visible execution

See reasoning summaries, commands, incremental output, elapsed time, context consumption, account limits, structured plans, and live file diffs. The interface makes it possible to tell whether work is progressing, blocked on a command, or changing the wrong files.

### One local working environment

Repositories, local data, shells, development tools, credentials, and Codex history stay on the Windows computer. The browser can send attachments, paste images, preview files, and download results without creating a second development environment.

### Supervised background operation

The supervisor records service state, exposes status and log commands, restarts a server that crashes after reaching readiness, and prevents a managed server from killing its own supervisor through an internal restart.

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

The copied configuration starts with:

```json
{
  "$schema": "./codexlan.schema.json",
  "port": 8688,
  "host": "auto",
  "dataRoot": "../data"
}
```

Edit the copied `config/codexlan.json`, not the example file. Supported settings are:

| Setting | Meaning |
| --- | --- |
| `port` | HTTP port shared by loopback and LAN access. Default: `8688`. |
| `host` | `auto` selects a private IPv4 interface; `127.0.0.1` disables LAN access. |
| `dataRoot` | Accounts, sessions, queues, thread settings, and supervisor state. Relative paths resolve from `config/`. |
| `workspaceRoot` | Optional boundary for automatically managed user projects. When omitted, CodexLAN uses `<dataRoot>/projects`. Existing projects may still point to their own absolute directories. |
| `codexBin` | Optional path to a specific Codex executable. When omitted, CodexLAN uses `codex` from `PATH`. |

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
