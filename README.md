# Codex LAN Workspace

[English](README.md) | [简体中文](README.zh-CN.md)

A Windows-first, self-hosted web workspace for continuing work with a locally installed Codex CLI from browsers, iPhone, and Android devices on the same trusted network.

Codex LAN Workspace is an independent community project. It is not an official OpenAI product and is not supported by OpenAI. It uses the experimental `codex app-server` interface, which may change between Codex CLI releases.

## Before you run it

The service can ask Codex to execute commands and read or modify files. Every web account shares the Windows account, Codex sign-in, machine permissions, usage limits, and configured workspace of the user running the service. Web accounts are convenient access controls, not strong tenant isolation.

- Use it only with people you trust.
- Keep the default project-local `workspace/`, or select a narrowly scoped directory.
- Never expose the built-in plain HTTP listener directly to the internet.
- Read [SECURITY.md](SECURITY.md) before adding users or remote access.

## Requirements and compatibility

| Component | Status |
| --- | --- |
| Host OS | Windows 10/11; other host operating systems are not verified |
| Node.js | 20 or newer |
| Codex | Codex CLI installed and signed in; `app-server` compatibility can change |
| Browser clients | Current desktop and mobile browsers; the current UI is primarily Chinese |
| iPhone | Safari web app; no iOS package is required |
| Android | Optional WebView source requires Android 8.0 (API 26) or newer |

The Node service and browser UI have no npm runtime dependencies or frontend build step.

## Quick start

1. Install Node.js and Codex CLI, then sign in:

   ```powershell
   codex login
   codex login status
   ```

2. From this repository, start the supervised service:

   ```powershell
   .\Start-Codex-Web.ps1
   ```

3. The terminal prints the LAN address and, on first run, a one-time administrator setup token. Open that address on a device connected to the same trusted network and create the first administrator.

The default port is `8687`. The default writable workspace is the repository-local `workspace/` directory. To use another deliberately selected root:

```powershell
.\Start-Codex-Web.ps1 -Workspace 'D:\Code' -Port 8687
```

If Windows Firewall blocks access, open an elevated PowerShell window and explicitly add a Private-network rule:

```powershell
.\Start-Codex-Web.ps1 -OpenFirewall
```

## What is included

- Administrator setup, member accounts, password changes, sessions, CSRF checks, and login throttling
- Projects, Codex threads, steering, interruption, queues, uploads, downloads, and previews
- Server-Sent Events for live progress, command output, diffs, usage, and reconnect recovery
- A native Android WebView shell with a planned signed, ABI-independent APK release path
- Node built-in tests and a Windows CI workflow

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Deployment, HTTPS, backup, and upgrades](docs/DEPLOYMENT.md)
- [Development](docs/DEVELOPMENT.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [iPhone usage](docs/IPHONE.md)
- [Android source and build instructions](android/README.md)
- [Release engineering and Windows packaging plan](docs/RELEASES.md)
- [Security policy and trust boundaries](SECURITY.md)
- [Contributing](CONTRIBUTING.md)

## Development check

```powershell
npm run check
```

This checks JavaScript syntax and runs the Node test suite. The suite covers browser-side state and formatting, repository release policies, and core HTTP security boundaries through an isolated fake app-server. Broader HTTP/API cases, real app-server compatibility, SSE, and Android automation remain tracked gaps.

## Official Codex references

- [Codex CLI command reference](https://learn.chatgpt.com/docs/developer-commands.md?surface=cli)
- [Codex authentication](https://learn.chatgpt.com/docs/auth.md)
- [Codex app-server](https://learn.chatgpt.com/docs/app-server.md)

## Development status and license

This repository is the start of an ongoing development process, not a finished public-release candidate. Android signing, Windows portable packaging, installers, integration tests, and release automation remain active workstreams; see [RELEASES.md](docs/RELEASES.md), [CHANGELOG.md](CHANGELOG.md), and [TODO.md](TODO.md).

The project is licensed under the [MIT License](LICENSE). No public GitHub repository or binary release is implied by this working tree.
