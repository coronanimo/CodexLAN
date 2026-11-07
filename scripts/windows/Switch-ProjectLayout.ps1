[CmdletBinding()]
param([ValidateSet('Cutover', 'Rollback', 'Complete')][string]$Action = 'Cutover')
$ErrorActionPreference = 'Stop'
if ($env:CODEXLAN_MANAGED_PROCESS -eq '1' -and $Action -ne 'Complete') { throw 'Run service cutover or rollback from an external PowerShell terminal.' }
$installation = $PSScriptRoot
$plan = Get-Content -LiteralPath (Join-Path $installation 'project-layout.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$homeRoot = (Resolve-Path -LiteralPath $plan.Home).ProviderPath
$dataRoot = Join-Path $homeRoot 'data'
$manifestPath = Join-Path $installation 'deployment.json'
$configPath = Join-Path $homeRoot 'config.json'
$receiptPath = Join-Path $plan.MigrationRoot 'switch.json'
$launcher = Join-Path $installation 'CodexLAN.ps1'
$backupRoot = Join-Path 'F:\GPTData\.layout-backups' (Split-Path -Leaf $plan.MigrationRoot)
$utf8 = New-Object System.Text.UTF8Encoding($false)
function Write-Json([string]$Path, $Value) { [IO.File]::WriteAllText($Path, ($Value | ConvertTo-Json -Depth 25), $utf8) }
function Verify-Move([string]$Source, [string]$Destination, [string]$SourceScope, [string]$DestinationScope) {
    $resolved = (Resolve-Path -LiteralPath $Source).ProviderPath
    $destinationFull = [IO.Path]::GetFullPath($Destination)
    if (-not $resolved.StartsWith($SourceScope + '\', [StringComparison]::OrdinalIgnoreCase) -or -not $destinationFull.StartsWith($DestinationScope + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Move escaped its explicitly planned scope.' }
    if (Test-Path -LiteralPath $destinationFull) { throw ('Move destination already exists: ' + $destinationFull) }
    Move-Item -LiteralPath $resolved -Destination $destinationFull
}
function Assert-Frozen([string]$Root) {
    $since = [DateTimeOffset]::Parse($plan.PreparedAt).UtcDateTime
    $stack = New-Object 'System.Collections.Generic.Stack[string]'
    $stack.Push($Root)
    while ($stack.Count) {
        foreach ($item in (Get-ChildItem -LiteralPath $stack.Pop() -Force)) {
            if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { continue }
            if ($item.PSIsContainer) {
                if ($item.Name -notin @('__pycache__', '.pytest_cache', 'pytest_run_temp')) { $stack.Push($item.FullName) }
            } elseif ($item.LastWriteTimeUtc -gt $since) { throw ('Project changed after preparation; preserve and refresh it before switching: ' + $item.FullName) }
        }
    }
}
function Restore-Layout($Receipt) {
    & $launcher -Action Stop
    foreach ($entry in @($Receipt.MovedSources)) {
        if (Test-Path -LiteralPath $entry.Source) {
            $link = Get-Item -LiteralPath $entry.Source -Force
            if ($link.LinkType -ne 'Junction' -or -not [string]::Equals([string]$link.Target, $entry.Target, [StringComparison]::OrdinalIgnoreCase)) { throw 'Do not replace an unexpected path during rollback.' }
            if (-not $entry.Source.StartsWith('F:\GPTData\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected alias scope.' }
            [IO.Directory]::Delete($entry.Source)
        }
        Verify-Move $entry.Backup $entry.Source $backupRoot 'F:\GPTData'
    }
    if ($Receipt.OldDataMoved -or (Test-Path -LiteralPath (Join-Path $plan.MigrationRoot 'before-data'))) {
        if (Test-Path -LiteralPath $dataRoot) {
            Verify-Move $dataRoot (Join-Path $plan.MigrationRoot ('post-rollback-data-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))) $homeRoot $plan.MigrationRoot
        }
        Verify-Move (Join-Path $plan.MigrationRoot 'before-data') $dataRoot $plan.MigrationRoot $homeRoot
    }
    [IO.File]::WriteAllText($configPath, (Get-Content -LiteralPath (Join-Path $plan.MigrationRoot 'before-config.json') -Raw -Encoding UTF8), $utf8)
    [IO.File]::WriteAllText($manifestPath, (Get-Content -LiteralPath (Join-Path $plan.MigrationRoot 'before-deployment.json') -Raw -Encoding UTF8), $utf8)
    $Receipt.Phase = 'rolled-back'
    Write-Json $receiptPath $Receipt
    & $launcher -Action Start
}

if ($Action -eq 'Rollback') {
    $receipt = Get-Content -LiteralPath $receiptPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($receipt.Phase -in @('rolled-back', 'complete')) { throw 'This migration cannot be automatically rolled back in its current phase.' }
    Restore-Layout $receipt
    Write-Output 'Previous project paths, database and release restored. New-generation data retained separately.'
    exit
}
if ($Action -eq 'Complete') {
    $receipt = Get-Content -LiteralPath $receiptPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($receipt.Phase -ne 'ready') { throw 'Only an accepted ready migration can be completed.' }
    $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($manifest.Release -ne $plan.Release) { throw 'The active release differs from the migration candidate.' }
    Add-Type -AssemblyName Microsoft.VisualBasic
    foreach ($entry in $receipt.MovedSources) {
        $resolved = (Resolve-Path -LiteralPath $entry.Backup).ProviderPath
        if (-not $resolved.StartsWith($backupRoot + '\', [StringComparison]::OrdinalIgnoreCase) -or $resolved -ne $entry.Backup) { throw 'Unexpected old-source cleanup target.' }
        if ((Get-Item -LiteralPath $resolved -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Old-source backup must be a real directory.' }
        # Detach only link objects in the retired backup; never let shell cleanup traverse protected data targets.
        $directories = New-Object 'System.Collections.Generic.Stack[string]'
        $directories.Push($resolved)
        while ($directories.Count) {
            foreach ($item in (Get-ChildItem -LiteralPath $directories.Pop() -Force)) {
                $itemPath = [IO.Path]::GetFullPath($item.FullName)
                if (-not $itemPath.StartsWith($resolved + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Backup link cleanup escaped the verified target.' }
                if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
                    if ($item.PSIsContainer) { [IO.Directory]::Delete($itemPath) }
                    else { [IO.File]::Delete($itemPath) }
                } elseif ($item.PSIsContainer) { $directories.Push($itemPath) }
            }
        }
        [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($resolved, [Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs, [Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin)
        Write-Output ('Moved old source to Recycle Bin: ' + $resolved)
    }
    $receipt.Phase = 'complete'
    Write-Json $receiptPath $receipt
    exit
}
if (Test-Path -LiteralPath $receiptPath) { throw 'A switch receipt already exists. Inspect it before performing another cutover.' }
$config = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not [string]::Equals($config.dataRoot, $dataRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Normalize the live data directory before this migration.' }
foreach ($entry in $plan.Entries) {
    if (-not $entry.Source.StartsWith('F:\GPTData\', [StringComparison]::OrdinalIgnoreCase) -or -not $entry.Target.StartsWith('D:\Code\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected project migration scope.' }
    foreach ($path in @($entry.Source, $entry.Target)) {
        $item = Get-Item -LiteralPath $path -Force
        if (-not $item.PSIsContainer -or $item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Project roots must be real directories before cutover.' }
    }
    if ((Split-Path -Leaf $entry.Target) -ne 'CodexLAN') {
        Assert-Frozen $entry.Source
        if (-not $entry.Retired) { Assert-Frozen $entry.Target }
    }
}
Copy-Item -LiteralPath $configPath -Destination (Join-Path $plan.MigrationRoot 'before-config.json')
Copy-Item -LiteralPath $manifestPath -Destination (Join-Path $plan.MigrationRoot 'before-deployment.json')
$receipt = @{ Phase = 'stopping'; OldDataMoved = $false; MovedSources = @() }
Write-Json $receiptPath $receipt
& $launcher -Action Stop
try {
    $newData = Join-Path $plan.MigrationRoot 'final-data'
    & (Join-Path $installation 'runtime\node.exe') (Join-Path $plan.Release 'scripts\migrate-project-layout.mjs') $configPath (Join-Path $installation 'project-layout.json') $newData (Join-Path $installation 'environment.json')
    if ($LASTEXITCODE -ne 0) { throw 'Fresh business-state migration or native-history indexing failed.' }
    # Preserve originals until explicit acceptance. Meta0 is retired: no compatibility alias.
    $null = New-Item -ItemType Directory -Path $backupRoot -Force
    foreach ($entry in $plan.Entries) {
        $ownerFolder = Split-Path -Leaf (Split-Path -Parent $entry.Source)
        $backup = Join-Path $backupRoot ($ownerFolder + '--' + (Split-Path -Leaf $entry.Source))
        Verify-Move $entry.Source $backup 'F:\GPTData' $backupRoot
        $receipt.MovedSources += @{ Source = $entry.Source; Target = $entry.Target; Backup = $backup }
        Write-Json $receiptPath $receipt
        if (-not $entry.Retired) { $null = New-Item -ItemType Junction -Path $entry.Source -Target $entry.Target }
    }
    Verify-Move $dataRoot (Join-Path $plan.MigrationRoot 'before-data') $homeRoot $plan.MigrationRoot
    $receipt.OldDataMoved = $true
    Write-Json $receiptPath $receipt
    Verify-Move $newData $dataRoot $plan.MigrationRoot $homeRoot
    $config.workspaceRoot = 'D:\Code'
    Write-Json $configPath $config
    $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $manifest.Release = $plan.Release
    Write-Json $manifestPath $manifest
    & $launcher -Action Start
    $backendReady = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        try {
            $ready = Invoke-RestMethod -Uri ('http://127.0.0.1:' + $config.port + '/api/ready')
            $backendReady = $ready.status -eq 'ready'
        } catch { $backendReady = $false }
        if ($backendReady) { break }
        Start-Sleep -Milliseconds 1000
    }
    if (-not $backendReady) { throw 'The Codex backend is not ready; restoring the previous deployment.' }
    $receipt.Phase = 'ready'
    Write-Json $receiptPath $receipt
    Write-Output 'Project access and D-drive paths are active. Check history, queues, sharing and files before -Action Complete.'
} catch {
    $failure = $_
    Restore-Layout $receipt
    throw $failure
}
