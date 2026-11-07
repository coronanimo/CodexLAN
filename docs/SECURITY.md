# Security Policy

## Supported versions

Until the first tagged release, security fixes target the current default branch only. A release support table will be added when stable versions exist.

## Reporting a vulnerability

Do not open a public issue for an unpatched vulnerability. Report it to `sjtukav@gmail.com` with the subject `CodexLAN security`. Do not include credentials, chat history, workspaces, or unredacted logs.

Include the affected version or commit, impact, minimal reproduction steps, and whether the issue requires an authenticated member or administrator. Remove all real secrets and personal paths.

## Trust boundary

CodexLAN can remotely drive Codex, execute commands, and read or modify files. It is intended only for one person or a small group of mutually trusted users.

- Web accounts share the Windows user, Codex sign-in, operating-system permissions, usage limits, and service workspace.
- Project owners and explicitly granted collaborators can access that project's files, conversations and queues. Unshared projects remain owner-only. These grants do not provide operating-system, process, quota, or credential isolation.
- An administrator has a broader local-file download endpoint than ordinary members. Treat every administrator as trusted with the server computer.
- The configured workspace root is a default creation location, not a permission boundary. Registering an existing absolute directory requires an administrator; project access is governed by explicit grants, independently of its parent folders.
- A compromised account can consume Codex quota and may cause commands to run with the service user's effective permissions.

Use separate Windows users, service instances, Codex sessions, and workspace roots when users do not fully trust one another.

## Network security

The built-in listener uses plain HTTP and binds to a private IPv4 address selected from the default route. Plain HTTP is suitable only for a trusted LAN. It does not provide encryption against other devices on that network.

For any access outside that LAN, terminate TLS with a trusted reverse proxy, restrict inbound access, preserve the original `Host` and scheme correctly, and test the same-origin and secure-cookie behavior. Never forward the configured CodexLAN port directly to the public internet.

The child `codex app-server` is spawned over local stdio; the project does not expose app-server's experimental WebSocket listener.

Local browser access uses a process-scoped Windows named pipe and an ephemeral signing key. A response is signed only for the current core's executor and a loaded conversation's active turn, after checking Codex browser policy. By default, the conversation's authenticated owner must approve access; manual grants are not shared across conversations and are cleared when the core disconnects. The file-only `autoApproveBrowser: true` setting instead automatically authorizes browser access for all CodexLAN users' conversations, including after core restarts. It defaults to `false` and is independent of command/file auto-approval. Neither path overrides managed browser prohibitions or isolates the shared Windows browser profile, including its signed-in websites.

## Sensitive files

Never commit or distribute:

- `data/`, `logs/`, `.codex-remote-attachments/`, `.codexlan/`
- Codex credentials, sessions, configuration, chat history, or account data
- Real user workspaces, local SDKs, `android/.tools/`, `android/local.properties`
- APK/AAB files, signing keys, Gradle outputs, release archives, or downloaded attachments
- Passwords, tokens, private addresses, local absolute paths, or diagnostic logs

Review staged files before every commit.

## Security controls

The service uses HttpOnly/SameSite session cookies, CSRF and same-origin validation, salted password hashes, login throttling, canonical path validation, and per-account ownership records. Remaining security and integration work is listed in [TODO.md](TODO.md).
