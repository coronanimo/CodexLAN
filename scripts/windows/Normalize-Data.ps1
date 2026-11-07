[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
if ($env:CODEXLAN_MANAGED_PROCESS -eq '1') { throw 'Run this script from an external PowerShell terminal.' }
$installationRoot = $PSScriptRoot
$deployment = Get-Content -LiteralPath (Join-Path $installationRoot 'deployment.json') -Raw | ConvertFrom-Json
$homeRoot = (Resolve-Path -LiteralPath $deployment.Home).ProviderPath
$configPath = Join-Path $homeRoot 'config.json'
$receiptPath = Join-Path $homeRoot 'cutover.json'
$configText = Get-Content -LiteralPath $configPath -Raw
$config = $configText | ConvertFrom-Json
$dataRoot = Join-Path $homeRoot 'data'
if ([string]::Equals($config.dataRoot, $dataRoot, [StringComparison]::OrdinalIgnoreCase)) { Write-Output ('Already normalized: ' + $dataRoot); exit }
$receiptText = Get-Content -LiteralPath $receiptPath -Raw
$receipt = $receiptText | ConvertFrom-Json
$oldRoot = (Resolve-Path -LiteralPath $config.dataRoot).ProviderPath
if ($receipt.Phase -ne 'ready') { throw 'Deployment must be ready before normalizing data.' }
if (-not [string]::Equals((Split-Path -Parent $oldRoot), $dataRoot, [StringComparison]::OrdinalIgnoreCase) -or (Split-Path -Leaf $oldRoot) -notmatch '^cutover-\d{8}-\d{6}$') { throw 'Unexpected data directory; refusing to move it.' }
if ((Get-Item -LiteralPath $oldRoot -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Data directory must not be a reparse point.' }
$allowedNames = @('workspace-state.sqlite', 'workspace-state.sqlite-wal', 'workspace-state.sqlite-shm', 'workspace-state.json', 'service', 'migration-report.json')
$items = Get-ChildItem -LiteralPath $oldRoot -Force
foreach ($item in $items) {
    if ($allowedNames -notcontains $item.Name) { throw ('Unexpected data entry: ' + $item.FullName) }
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Data entries must not be reparse points.' }
    $destination = Join-Path $dataRoot $item.Name
    if (Test-Path -LiteralPath $destination) { throw ('Destination already exists: ' + $destination) }
}
$launcher = Join-Path $installationRoot 'CodexLAN.ps1'
$utf8 = New-Object System.Text.UTF8Encoding($false)
[IO.File]::WriteAllText((Join-Path $homeRoot 'backups\config-before-normalize.json'), $configText, $utf8)
[IO.File]::WriteAllText((Join-Path $homeRoot 'backups\receipt-before-normalize.json'), $receiptText, $utf8)
$moved = New-Object 'System.Collections.Generic.List[string]'
& $launcher -Action Stop
try {
    # Re-enumerate after shutdown: SQLite can remove its own WAL/SHM files.
    $items = Get-ChildItem -LiteralPath $oldRoot -Force
    foreach ($item in $items) {
        $verifiedSource = (Resolve-Path -LiteralPath $item.FullName).ProviderPath
        $destination = [IO.Path]::GetFullPath((Join-Path $dataRoot $item.Name))
        if ($allowedNames -notcontains $item.Name -or -not [string]::Equals((Split-Path -Parent $verifiedSource), $oldRoot, [StringComparison]::OrdinalIgnoreCase) -or -not [string]::Equals((Split-Path -Parent $destination), $dataRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Move target escaped the verified data directory.' }
        if (Test-Path -LiteralPath $destination) { throw 'Destination appeared during shutdown.' }
        Move-Item -LiteralPath $verifiedSource -Destination $destination
        $moved.Add($item.Name)
    }
    $config.dataRoot = $dataRoot
    $receipt.Generation = $dataRoot
    $receipt | Add-Member -NotePropertyName NormalizedAt -NotePropertyValue (Get-Date).ToString('o') -Force
    [IO.File]::WriteAllText($configPath, ($config | ConvertTo-Json -Depth 20), $utf8)
    [IO.File]::WriteAllText($receiptPath, ($receipt | ConvertTo-Json -Depth 20), $utf8)
    & $launcher -Action Start
} catch {
    $originalError = $_
    # Never move database files back while a possibly started daemon is alive.
    & $launcher -Action Stop
    foreach ($name in $moved) {
        if (-not (Test-Path -LiteralPath (Join-Path $dataRoot $name))) {
            if ($name -in @('workspace-state.sqlite-wal', 'workspace-state.sqlite-shm')) { continue }
            throw ('Expected restore entry is missing: ' + $name)
        }
        $source = (Resolve-Path -LiteralPath (Join-Path $dataRoot $name)).ProviderPath
        $destination = [IO.Path]::GetFullPath((Join-Path $oldRoot $name))
        if (-not [string]::Equals((Split-Path -Parent $source), $dataRoot, [StringComparison]::OrdinalIgnoreCase) -or -not [string]::Equals((Split-Path -Parent $destination), $oldRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Restore target escaped the verified directory.' }
        Move-Item -LiteralPath $source -Destination $destination
    }
    [IO.File]::WriteAllText($configPath, $configText, $utf8)
    [IO.File]::WriteAllText($receiptPath, $receiptText, $utf8)
    & $launcher -Action Start
    throw $originalError
}
if ((Get-ChildItem -LiteralPath $oldRoot -Force).Count -eq 0) {
    $verifiedEmptyDirectory = (Resolve-Path -LiteralPath $oldRoot).ProviderPath
    if (-not [string]::Equals($verifiedEmptyDirectory, $oldRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected empty directory target.' }
    Add-Type -AssemblyName Microsoft.VisualBasic
    [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($verifiedEmptyDirectory, [Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs, [Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin)
    Write-Output ('Recycled empty old directory: ' + $verifiedEmptyDirectory)
}
Write-Output ('Active data directory: ' + $dataRoot)
Write-Output 'A fresh login may be required because cookies are scoped to the data directory.'
