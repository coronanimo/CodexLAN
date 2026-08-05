# Security Policy

## Supported versions

Until the first tagged release, security fixes target the current default branch only. A release support table will be added when stable versions exist.

## Reporting a vulnerability

Do not open a public issue for an unpatched vulnerability or include credentials, logs, chat history, workspaces, or other private data in a report. Before a public repository has a private reporting channel, contact the maintainer directly through a pre-agreed private channel. The future repository must enable GitHub private vulnerability reporting before publication.

Include the affected version or commit, impact, minimal reproduction steps, and whether the issue requires an authenticated member or administrator. Remove all real secrets and personal paths.

## Trust boundary

Codex LAN Workspace can remotely drive Codex, execute commands, and read or modify files. It is intended only for one person or a small group of mutually trusted users.

- Web accounts share the Windows user, Codex sign-in, host permissions, usage limits, and service workspace.
- Accounts separate project and thread records in the application; they do not provide operating-system, process, quota, or credential isolation.
- An administrator has a broader local-file download endpoint than ordinary members. Treat every administrator as trusted with the service host.
- `-Workspace` must not point to a drive root, an entire user profile, or any directory containing material members must not access.
- A compromised account can consume Codex quota and may cause commands to run with the service user's effective permissions.

Use separate Windows users, service instances, Codex sessions, and workspace roots when users do not fully trust one another.

## Network security

The built-in listener uses plain HTTP and binds to a private IPv4 address selected from the default route. Plain HTTP is suitable only for a trusted LAN. It does not provide encryption against other devices on that network.

For any access outside that LAN, terminate TLS with a trusted reverse proxy, restrict inbound access, preserve the original `Host` and scheme correctly, and test the same-origin and secure-cookie behavior. Never forward port `8687` directly to the public internet.

The child `codex app-server` is spawned over local stdio; the project does not expose app-server's experimental WebSocket listener.

## Sensitive files

Never commit or distribute:

- `data/`, `logs/`, `workspace/`, `.codex-remote-attachments/`, `.codexlan/`
- Codex credentials, sessions, configuration, chat history, or account data
- Real user workspaces, local SDKs, `.tools/`, `android/local.properties`
- APK/AAB files, signing keys, Gradle outputs, release archives, or downloaded attachments
- Passwords, tokens, private addresses, local absolute paths, or diagnostic logs

The repository ignore rules are a guardrail, not a substitute for reviewing every staged file.

## Security controls and current gaps

The service uses HttpOnly/SameSite session cookies, CSRF and same-origin validation, password hashing, login throttling, path validation, and per-account ownership records. An isolated loopback HTTP suite exercises initial setup, sessions, same-origin and CSRF rejection, login throttling, role checks, and project path containment with a fake app-server transport. Password/session invalidation, administrator download success cases, upload boundaries, SSE, and real app-server compatibility remain tracked in [TODO.md](TODO.md).
