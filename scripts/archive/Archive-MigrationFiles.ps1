[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$repository = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$entries = @{
    'scripts\windows\CodexLAN.ps1' = 'scripts\archive\project-layout\CodexLAN.ps1'
    'scripts\windows\CodexLAN-React.ps1' = 'scripts\archive\parallel\CodexLAN-React.ps1'
    'scripts\windows\Update-React.ps1' = 'scripts\archive\parallel\Update-React.ps1'
    'scripts\windows\Deploy-Image-Fix.ps1' = 'scripts\archive\parallel\Deploy-Image-Fix.ps1'
    'scripts\install-parallel.ps1' = 'scripts\archive\parallel\install-parallel.ps1'
    'scripts\parallel-snapshot.mjs' = 'scripts\archive\parallel\parallel-snapshot.mjs'
    'docs\PARALLEL.md' = 'docs\archive\PARALLEL.md'
    'docs\REACT-MIGRATION.md' = 'docs\archive\REACT-MIGRATION.md'
    'docs\review-20261108\probes.mjs' = 'docs\archive\review-20261108\probes.mjs'
}
foreach ($entry in $entries.GetEnumerator()) {
    $source = [System.IO.Path]::GetFullPath((Join-Path $repository $entry.Key))
    $target = [System.IO.Path]::GetFullPath((Join-Path $repository $entry.Value))
    foreach ($path in @($source, $target)) {
        if (-not $path.StartsWith($repository + '\', [System.StringComparison]::OrdinalIgnoreCase)) { throw "Archive target outside repository: $path" }
    }
    if (-not (Test-Path -LiteralPath $source)) { throw "Archive source missing: $source" }
    if (Test-Path -LiteralPath $target) { throw "Archive destination exists: $target" }
}
foreach ($entry in $entries.GetEnumerator()) {
    $source = Join-Path $repository $entry.Key
    $target = Join-Path $repository $entry.Value
    $null = New-Item -ItemType Directory -Path ([System.IO.Path]::GetDirectoryName($target)) -Force
    Move-Item -LiteralPath $source -Destination $target
    Write-Output "Archived: $target"
}
