$ErrorActionPreference = 'Stop'
$oldRepository = 'F:\GPTData\hu\CodexLAN'
$homeRoot = Join-Path $env:USERPROFILE '.codexlan'
$installationRoot = Join-Path $env:LOCALAPPDATA 'Programs\CodexLAN'
$deployment = Get-Content -LiteralPath (Join-Path $installationRoot 'deployment.json') -Raw | ConvertFrom-Json
$config = Get-Content -LiteralPath (Join-Path $homeRoot 'config.json') -Raw | ConvertFrom-Json
$receipt = Get-Content -LiteralPath (Join-Path $homeRoot 'cutover.json') -Raw | ConvertFrom-Json
if ($receipt.Phase -ne 'ready') { throw 'New deployment is not ready.' }
$statePath = Join-Path $config.dataRoot 'service\state.json'
$state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
if ($state.status -ne 'ready') { throw 'New service is not ready.' }
$server = Get-CimInstance -ClassName Win32_Process -Filter ('ProcessId = ' + [int]$state.serverPid)
if (-not $server -or -not $server.CommandLine.Contains($deployment.Release)) { throw 'New release process was not confirmed.' }
$oldStatePath = Join-Path $oldRepository 'data\service\state.json'
if (Test-Path -LiteralPath $oldStatePath) {
    $oldState = Get-Content -LiteralPath $oldStatePath -Raw | ConvertFrom-Json
    if ($oldState.status -ne 'stopped') { throw 'Old service is not stopped.' }
    foreach ($pidValue in @($oldState.supervisorPid, $oldState.serverPid)) {
        if ($pidValue -and (Get-Process -Id $pidValue -ErrorAction SilentlyContinue)) { throw 'An old service PID is still present; inspect before cleanup.' }
    }
} elseif (Test-Path -LiteralPath (Join-Path $oldRepository 'data')) { throw 'Old data exists without a stopped service record.' }
$nodeProcesses = Get-CimInstance -ClassName Win32_Process -Filter "Name = 'node.exe'" -Property ProcessId,CommandLine
foreach ($process in $nodeProcesses) {
    if ($process.CommandLine -and $process.CommandLine.Contains($oldRepository)) { throw 'A Node process still references the old repository.' }
}
$backupRoot = Join-Path $homeRoot 'backups\pre-cutover-database'
if (-not (Test-Path -LiteralPath $backupRoot)) {
    & (Join-Path $installationRoot 'runtime\node.exe') (Join-Path $deployment.Release 'scripts\deployment-snapshot.mjs') (Join-Path $oldRepository 'data\workspace-state.sqlite') $backupRoot $oldRepository $oldRepository
    if ($LASTEXITCODE -ne 0) { throw 'Old database backup failed.' }
}
# All historical archives were copied during preparation; preserve any newer entries as well.
$legacyBackup = Join-Path $homeRoot 'backups\legacy-data'
if (Test-Path -LiteralPath (Join-Path $oldRepository 'data')) {
    & robocopy (Join-Path $oldRepository 'data') $legacyBackup /E /COPY:DAT /DCOPY:DAT /R:1 /W:1 /XJ /NFL /NDL /NJH /NJS /XD service /XF workspace-state.sqlite workspace-state.sqlite-wal workspace-state.sqlite-shm
    if ($LASTEXITCODE -ge 8) { throw 'Historical archive backup failed.' }
}
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'windows\CodexLAN.ps1') -Destination (Join-Path $installationRoot 'CodexLAN.ps1')
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'windows\Normalize-Data.ps1') -Destination (Join-Path $installationRoot 'Normalize-Data.ps1')
Add-Type -AssemblyName Microsoft.VisualBasic
$targets = @((Join-Path $oldRepository 'data'), (Join-Path $oldRepository 'logs'), (Join-Path $oldRepository 'node_modules'), (Join-Path $homeRoot 'data\prepared'))
foreach ($target in $targets) {
    if (-not (Test-Path -LiteralPath $target)) { continue }
    $resolved = (Resolve-Path -LiteralPath $target).ProviderPath
    if (-not [string]::Equals($resolved, $target, [StringComparison]::OrdinalIgnoreCase)) { throw 'Cleanup path did not resolve to the expected named target.' }
    if ((Get-Item -LiteralPath $resolved -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Refusing cleanup of a reparse point.' }
    if ([string]::Equals($resolved, $config.dataRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Refusing cleanup of active data.' }
    [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($resolved, [Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs, [Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin)
    if (Test-Path -LiteralPath $resolved) { throw ('Cleanup did not finish: ' + $resolved) }
    Write-Output ('Moved to Recycle Bin: ' + $resolved)
}
