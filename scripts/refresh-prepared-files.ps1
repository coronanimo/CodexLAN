$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$installationRoot = Join-Path $env:LOCALAPPDATA 'Programs\CodexLAN'
$deployment = Get-Content -LiteralPath (Join-Path $installationRoot 'deployment.json') -Raw | ConvertFrom-Json
if (Test-Path -LiteralPath (Join-Path $deployment.Home 'cutover.json')) { throw 'Do not refresh an attempted/active cutover.' }
foreach ($file in @('scripts\windows\CodexLAN.ps1', 'scripts\prepare-deployment.ps1', 'scripts\verify-deployment.ps1', 'scripts\refresh-prepared-files.ps1', 'docs\WINDOWS-CUTOVER.md', 'server\projects.mjs', 'test\http-security.test.mjs')) {
    Copy-Item -LiteralPath (Join-Path $repositoryRoot $file) -Destination (Join-Path $deployment.SourceCheckout $file)
}
Copy-Item -LiteralPath (Join-Path $repositoryRoot 'server\projects.mjs') -Destination (Join-Path $deployment.Release 'server\projects.mjs')
Copy-Item -LiteralPath (Join-Path $repositoryRoot 'scripts\windows\CodexLAN.ps1') -Destination (Join-Path $installationRoot 'CodexLAN.ps1')
Copy-Item -LiteralPath (Join-Path $repositoryRoot 'docs\WINDOWS-CUTOVER.md') -Destination (Join-Path $installationRoot 'CUTOVER.md')
$backupTarget = Join-Path $deployment.Home 'backups\legacy-data'
& robocopy (Split-Path -Parent $deployment.SourceDatabase) $backupTarget /E /COPY:DAT /DCOPY:DAT /R:1 /W:1 /XJ /NFL /NDL /NJH /NJS /XD service /XF workspace-state.sqlite workspace-state.sqlite-wal workspace-state.sqlite-shm
if ($LASTEXITCODE -ge 8) { throw 'Legacy archive copy failed.' }
exit 0
