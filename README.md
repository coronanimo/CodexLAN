# CodexLAN

[English](README.md) | [简体中文](README.zh-CN.md)

**Keep Codex on one Windows workstation. Take control from any PC or phone on your trusted network.**

CodexLAN turns the computer that already holds your repositories, tools, credentials, and Codex login into a private, always-available agent workspace. Start a task at your desk, inspect it from your phone, steer the active run, queue the next job, or leave a Goal running without moving the project to another machine.

It is a browser-native control surface for local Codex, not a remote-desktop stream and not a hosted coding environment. Commands and file access still happen on the Windows server computer; the browser carries the conversation, controls, and live results.

This is an independent community project built against the experimental `codex app-server` protocol. It is not an OpenAI product.

## The problem it solves

Local Codex works where the real development environment lives, but that usually ties control to one screen. Long runs keep going after you leave the desk; follow-up work arrives while another task is still active; a phone can reach the computer but a terminal or remote desktop is a poor conversation interface. Moving the whole workflow to a hosted environment may also be undesirable when repositories, data, toolchains, or credentials must stay local.

CodexLAN fills that operational gap. One Windows machine owns execution, while every authorized browser gets a purpose-built view of the same projects and conversations.

## Who it is for

- Individual developers, researchers, and data or quantitative practitioners who keep a capable Windows workstation running.
- People who move between a desk, laptop, iPhone, or Android device and want the same Codex conversations on each screen.
- Users who run multi-step or long-duration work and need to observe, steer, queue, pause, and resume instead of sending one prompt at a time.
- Small groups of mutually trusted people who share one Windows environment and Codex account but need separate CodexLAN logins, projects, and conversation lists.

CodexLAN is not designed as a public SaaS or as isolation for untrusted tenants. Web accounts separate application data; they do not create separate Windows identities or separate Codex subscriptions.

## Product highlights

### Leave the desk without abandoning the run

Open the same workspace from a desktop browser, an iPhone Home Screen shortcut, or the optional Android client. Conversation history, current execution, queue state, and Goal state come from the server rather than one browser's local storage.

### Keep work moving beyond one prompt

Send guidance into the active turn without starting over. Queue follow-up tasks in order. Use Plan mode before implementation. Create a durable Goal that Codex can continue when the thread becomes idle, with pause, resume, clear, elapsed usage, and an optional token budget.

### See what the agent is actually doing

Follow reasoning summaries, commands, incremental output, elapsed time, context consumption, account limits, structured plans, and live file diffs. CodexLAN is built for supervising real work, not showing a spinner until a final answer appears.

### Keep the working environment on your machine

Repositories, local data, shells, development tools, credentials, and Codex history stay on the Windows computer. Attach files or pasted images, preview supported documents, and download generated outputs without turning the server into a general public file host.

### Share access without mixing the interface

Administrators can create member accounts and assign projects. Each user gets separate web sessions, project ownership, conversation access, queues, and recent-history ordering while the trusted group continues to share the underlying Windows and Codex environment.

### Run it as a service, not a fragile terminal window

The background supervisor records server state, exposes explicit status and log commands, restarts a process that crashes after reaching readiness, and refuses an in-process restart that would kill its own control path.

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
