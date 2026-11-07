# Windows deployment prepared on 2026-11-06

## Post-cutover cleanup

Connection repair: the deployment launcher now loads proxy variables from `environment.json` beside the launcher. This machine uses the local proxy at `127.0.0.1:7890`. Launching from an external terminal without the proxy caused Codex workspace-routing discovery to time out even while the web health endpoint reported `alive`. The supervisor was stopped and started with the persisted proxy configuration, and the Codex backend returned to `ready`; a direct backend thread-list request also succeeded. Future starts and login-task launches use the same explicit network environment. If the local proxy changes, update this file.

Cutover completed successfully at 21:20 on 2026-11-06. The live generation is initially `.codexlan/data/cutover-20261106-212054`; it is production data, not disposable temporary data. Old F-drive `data`, `logs` and `node_modules`, and the unused `.codexlan/data/prepared` snapshot, have since been recycled. A verified pre-cutover database is retained at `.codexlan/backups/pre-cutover-database`; historical archives remain under `backups/legacy-data`. The automatic legacy Rollback command now refuses before stopping the active service because the old live data directory has been removed. The original cutover/rollback instructions below describe the preparation window, not the current cleanup state.

To normalize the live directory to `%USERPROFILE%\.codexlan\data`, finish active work and run the following from an external PowerShell terminal:

```powershell
& "$env:LOCALAPPDATA\Programs\CodexLAN\Normalize-Data.ps1"
```

This stops the current service, moves its SQLite database and service-control files to the stable parent data directory, updates the configuration and receipt, and restarts the service. It recycles the now-empty old directory after success. Failure attempts to restore the previous path and configuration before restarting. A fresh login may be required because session cookies are scoped to the data path. The production normalization has not been run by the agent; only an isolated Windows PowerShell 5.1 rehearsal was performed.

The F-drive source tree and historical project attachments remain. No other F-drive projects or quant datasets are included in this cleanup.

The existing F-drive service is still authoritative. Preparation does not replace its startup task or start a second production instance.

## Locations

| Purpose | Location |
| --- | --- |
| Development checkout, including uncommitted changes | `D:\Code\CodexLAN` |
| Stable launcher | `%LOCALAPPDATA%\Programs\CodexLAN\CodexLAN.ps1` |
| Pinned Node runtime | `%LOCALAPPDATA%\Programs\CodexLAN\runtime\node.exe` |
| Release | `deployment.json` beside the launcher records the exact release directory |
| Configuration | `%USERPROFILE%\.codexlan\config.json` |
| Preview snapshot | `%USERPROFILE%\.codexlan\data\prepared` |
| Final database | A fresh `data\cutover-<timestamp>` generation created during cutover |
| New attachments | `%USERPROFILE%\.codexlan\attachments\<project-id>\attachments` |
| Logs | `%USERPROFILE%\.codexlan\logs` |
| Old startup definition/configuration and data archives | `%USERPROFILE%\.codexlan\backups` |

The old home directory contained one obsolete TOML configuration and empty directories. It was recycled before creating this new home. The historical `CodexLAN-recovery` directory was also recycled.

## Scope and compatibility

This cutover maps only the CodexLAN project path from `F:\GPTData\hu\CodexLAN` to `D:\Code\CodexLAN`. It retains project IDs, ownership, bindings, queue order and contents, settings, sessions, access order, async answer receipts and execution supplements. The snapshot verifier compares reconstructed business fields and relationships, allowing only that explicit path change.

Other projects retain their existing paths. In particular, the configured workspace boundary remains `F:\GPTData` in this stage: member projects currently live in `F:\GPTData\li`, and changing the boundary before migrating their files would prevent startup. Moving the other repositories and member directories to D is a separate migration. The machine-wide goal of reserving F for quant data is therefore not yet complete.

Existing attachments remain in each old project's `.codexlan\attachments` so historical absolute paths and Codex transcript references continue to work. New uploads use the centralized home attachment directory with per-project authorization. Do not delete the old F-drive repository or its attachments after cutover; migrate historical references before final removal. Codex's own history and authentication under `%USERPROFILE%\.codex` are not moved or rewritten.

The source checkout and deployed release are separate copies. This historical preparation captured the then-current working tree; later source changes are not automatically deployed. Current React releases are prepared with `scripts/build-release.ps1` and include server/shared/products, `dist/web`, configuration schema, package metadata and production dependencies. Production configuration, databases, backups and development tools remain separate.

## User cutover

Finish active turns and leave the queues in the desired state. Open a separate PowerShell terminal under the same Windows account, outside a CodexLAN conversation. Then run:

```powershell
& "$env:LOCALAPPDATA\Programs\CodexLAN\CodexLAN.ps1" -Action Cutover
```

The command disables the old login task, stops the old supervisor, creates a new consistent SQLite snapshot including committed WAL contents, verifies business fields, maps the CodexLAN project path, points the new configuration at that generation, starts the independent release, and replaces the existing `CodexLAN Startup` login task with the stable launcher. The prepared snapshot is never used as the final live data. No global environment variables, PATH changes, extra Windows services or duplicate startup mechanisms are installed.

If the old configuration changed after preparation, cutover refuses before stopping the service. Review and refresh the preparation rather than bypassing this guard. A failed cutover leaves a phase receipt in `.codexlan\cutover.json`; inspect the error and run Rollback. Do not manually start both deployments.

## Acceptance

Open the usual port 8688. A fresh login is expected because the session cookie name is scoped to the data directory. Confirm the existing accounts, project permissions, history, queued messages and their order, thread settings, and old/new attachment access. Resume an existing CodexLAN conversation and confirm commands now use `D:\Code\CodexLAN`. Verify that ordinary members still see their own projects. Use Status to confirm log paths are under the new home:

```powershell
& "$env:LOCALAPPDATA\Programs\CodexLAN\CodexLAN.ps1" -Action Status
```

Use the same entry point with Start, Stop, Restart or Log for subsequent operations. Production starts independently of the development checkout. The login task runs as the current user with a hidden PowerShell window and no elevation, matching the existing deployment's account model.

## Rollback

From the external terminal:

```powershell
& "$env:LOCALAPPDATA\Programs\CodexLAN\CodexLAN.ps1" -Action Rollback
```

Rollback stops the new deployment, restores the saved old login task, and starts the old deployment using its original data directory and frozen absolute-path configuration. It retains the new database generation and attachments. Data created after cutover is not merged into the old database; perform immediate acceptance before conducting new work. After rollback, Cutover can be retried to create another fresh generation from the old database.

No old source, live database, history backup or packet capture is deleted by cutover. Final F-drive cleanup follows accepted migration and a separate inventory of remaining references.

## Development

Work in `D:\Code\CodexLAN`. Its ignored local `config/codexlan.json` is prepared for loopback port 8689, workspace `D:\Code`, and separate data/log/attachment directories below `.codexlan/development`. Run `node server/index.mjs` from that checkout with no inherited `CODEX_CONFIG` override. Do not point development at production configuration or data. The checkout's `npm test` uses `scripts/run-tests.mjs`, which disables inherited deployment configuration and runs only the Node test entry points; focused checks can also use `node --test` with explicit test files.

## Preparation verification

Relevant checks cover configuration paths, a WAL-backed online backup with explicit project path mapping and preserved queue/settings/ownership fields, HTTP upload/download/deletion including cross-project rejection, and an isolated release launcher start/status/restart/stop cycle with HTTP health and external logs. Real production cutover, login-task replacement and operational rollback remain for the user-controlled switching window.
