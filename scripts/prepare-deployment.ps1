[CmdletBinding()]
param(
    [string]$SourceCheckout = 'D:\Code\CodexLAN',
    [string]$InstallationRoot = (Join-Path $env:LOCALAPPDATA 'Programs\CodexLAN'),
    [string]$HomeRoot = (Join-Path $env:USERPROFILE '.codexlan')
)
$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$releaseName = '0.8.0-prepared-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
$releaseRoot = Join-Path $InstallationRoot ('releases\' + $releaseName)
foreach ($target in @($SourceCheckout, $InstallationRoot, $HomeRoot)) {
    if (Test-Path -LiteralPath $target) { throw ('Preparation requires a fresh target: ' + $target) }
}
$oldConfigPath = Join-Path $repositoryRoot 'config\codexlan.json'
$oldConfig = Get-Content -LiteralPath $oldConfigPath -Raw | ConvertFrom-Json
$sourceDatabase = [System.IO.Path]::GetFullPath((Join-Path (Split-Path -Parent $oldConfigPath) $oldConfig.dataRoot))
$sourceDatabase = Join-Path $sourceDatabase 'workspace-state.sqlite'
$startupXml = Export-ScheduledTask -TaskName 'CodexLAN Startup'
$nodeSource = (Get-Command node -CommandType Application).Source
$npmCli = Join-Path (Split-Path -Parent $nodeSource) 'node_modules\npm\bin\npm-cli.js'
if (-not (Test-Path -LiteralPath $npmCli -PathType Leaf)) { throw 'npm CLI was not found beside node.exe.' }

function Write-Json([string]$Path, $Value) {
    [System.IO.File]::WriteAllText($Path, ($Value | ConvertTo-Json -Depth 20), (New-Object System.Text.UTF8Encoding($false)))
}
function Copy-Tree([string]$Source, [string]$Destination, [string[]]$Extra = @()) {
    & robocopy $Source $Destination /E /COPY:DAT /DCOPY:DAT /R:1 /W:1 /XJ /NFL /NDL /NJH /NJS @Extra
    if ($LASTEXITCODE -ge 8) { throw ('Copy failed: ' + $Source) }
}

$null = New-Item -ItemType Directory -Path $SourceCheckout, $releaseRoot, (Join-Path $InstallationRoot 'runtime'), (Join-Path $HomeRoot 'backups'), (Join-Path $HomeRoot 'logs'), (Join-Path $HomeRoot 'attachments')
# Preserve Git metadata and all current working-tree changes, but no local state/build caches.
Copy-Tree $repositoryRoot $SourceCheckout @('/XD', 'node_modules', 'data', 'logs', '.codexlan', '.gradle', '.tools', 'build', 'release', 'dist', 'out', '/XF', 'PktMon.etl', 'codexlan.json', 'local.properties')
foreach ($folder in @('server', 'public', 'config')) {
    Copy-Tree (Join-Path $repositoryRoot $folder) (Join-Path $releaseRoot $folder) @('/XF', 'codexlan.json')
}
$null = New-Item -ItemType Directory -Path (Join-Path $releaseRoot 'scripts')
Copy-Item -LiteralPath (Join-Path $repositoryRoot 'scripts\deployment-snapshot.mjs') -Destination (Join-Path $releaseRoot 'scripts')
foreach ($file in @('package.json', 'package-lock.json', 'LICENSE')) {
    Copy-Item -LiteralPath (Join-Path $repositoryRoot $file) -Destination $releaseRoot
}
Copy-Item -LiteralPath $nodeSource -Destination (Join-Path $InstallationRoot 'runtime\node.exe')
Copy-Item -LiteralPath (Join-Path $repositoryRoot 'scripts\windows\CodexLAN.ps1') -Destination $InstallationRoot
$networkEnvironment = @{}
foreach ($name in @('HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY')) {
    $value = [Environment]::GetEnvironmentVariable($name, 'Process')
    if ($value) { $networkEnvironment[$name] = $value }
}
if ($networkEnvironment.Count) { Write-Json (Join-Path $InstallationRoot 'environment.json') $networkEnvironment }
Push-Location -LiteralPath $releaseRoot
try {
    & $nodeSource $npmCli ci --omit=dev --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'Release dependency installation failed.' }
} finally { Pop-Location }
# A separate install keeps source development independent of release dependencies.
Push-Location -LiteralPath $SourceCheckout
try {
    & $nodeSource $npmCli ci --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'Source dependency installation failed.' }
} finally { Pop-Location }

$previewRoot = Join-Path $HomeRoot 'data\prepared'
& (Join-Path $InstallationRoot 'runtime\node.exe') (Join-Path $releaseRoot 'scripts\deployment-snapshot.mjs') $sourceDatabase $previewRoot $repositoryRoot $SourceCheckout
if ($LASTEXITCODE -ne 0) { throw 'Online snapshot failed.' }
Copy-Tree (Split-Path -Parent $sourceDatabase) (Join-Path $HomeRoot 'backups\legacy-data') @('/XD', 'service', '/XF', 'workspace-state.sqlite', 'workspace-state.sqlite-wal', 'workspace-state.sqlite-shm')
$configuration = @{
    port = $oldConfig.port; host = $oldConfig.host
    workspaceRoot = $oldConfig.workspaceRoot
    dataRoot = $previewRoot; logRoot = (Join-Path $HomeRoot 'logs')
    attachmentRoot = (Join-Path $HomeRoot 'attachments')
    codexBin = $oldConfig.codexBin
    autoApprove = $oldConfig.autoApprove; autoApproveBrowser = $oldConfig.autoApproveBrowser
}
Write-Json (Join-Path $HomeRoot 'config.json') $configuration
$developmentConfig = @{
    port = 8689; host = '127.0.0.1'; workspaceRoot = 'D:\Code'
    dataRoot = (Join-Path $HomeRoot 'development\data'); logRoot = (Join-Path $HomeRoot 'development\logs')
    attachmentRoot = (Join-Path $HomeRoot 'development\attachments')
    codexBin = $oldConfig.codexBin; autoApprove = $false; autoApproveBrowser = $false
}
Write-Json (Join-Path $SourceCheckout 'config\codexlan.json') $developmentConfig
# Frozen old configuration gives rollback an explicit, stable entry point.
Copy-Item -LiteralPath $oldConfigPath -Destination (Join-Path $HomeRoot 'backups\old-config.original.json')
$rollbackConfig = @{}
foreach ($property in $oldConfig.PSObject.Properties) {
    if ($property.Name -ne '$schema') { $rollbackConfig[$property.Name] = $property.Value }
}
$rollbackConfig.dataRoot = Split-Path -Parent $sourceDatabase
Write-Json (Join-Path $HomeRoot 'backups\old-config.json') $rollbackConfig
[System.IO.File]::WriteAllText((Join-Path $HomeRoot 'backups\startup-task.xml'), $startupXml)
$deployment = @{
    PreparedAt = (Get-Date).ToString('o'); Home = $HomeRoot; Release = $releaseRoot
    SourceRepository = $repositoryRoot; SourceCheckout = $SourceCheckout
    SourceDatabase = $sourceDatabase; OldService = (Join-Path $repositoryRoot 'server\service.mjs')
    OldConfig = (Join-Path $HomeRoot 'backups\old-config.json'); TaskName = 'CodexLAN Startup'
}
Write-Json (Join-Path $InstallationRoot 'deployment.json') $deployment
Write-Output ('Prepared release: ' + $releaseRoot)
Write-Output ('Prepared data: ' + $previewRoot)
Write-Output 'The current service and startup task have not been switched.'
exit 0
