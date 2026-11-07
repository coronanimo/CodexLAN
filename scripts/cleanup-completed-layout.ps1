$ErrorActionPreference = 'Stop'
$installation = Join-Path $env:LOCALAPPDATA 'Programs\CodexLAN'
$manifestPath = Join-Path $installation 'deployment.json'
$deployment = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$plan = Get-Content -LiteralPath (Join-Path $installation 'project-layout.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$receipt = Get-Content -LiteralPath (Join-Path $plan.MigrationRoot 'switch.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if ($receipt.Phase -ne 'complete') { throw 'Old-source cleanup has not completed.' }
$previous = Get-Content -LiteralPath (Join-Path $plan.MigrationRoot 'before-deployment.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$processes = Get-CimInstance -ClassName Win32_Process -Property CommandLine
$targets = @(
    (Join-Path $plan.MigrationRoot 'preview-data'),
    (Join-Path $plan.MigrationRoot 'qa-1793977956209'),
    (Join-Path $deployment.Home 'migrations\project-layout-20261106-230439'),
    (Join-Path $installation 'releases\0.8.0-project-access-20261106-230553')
)
Add-Type -AssemblyName Microsoft.VisualBasic
foreach ($target in $targets) {
    if (-not (Test-Path -LiteralPath $target)) { continue }
    $resolved = (Resolve-Path -LiteralPath $target).ProviderPath
    if ($resolved -ne $target -or (Get-Item -LiteralPath $resolved -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Unexpected cleanup target.' }
    if ($resolved -eq $deployment.Release -or $resolved -eq $previous.Release) { throw 'Do not remove an active or recovery release.' }
    foreach ($process in $processes) {
        if ($process.CommandLine -and $process.CommandLine.Contains($resolved)) { throw ('A process still references cleanup target: ' + $resolved) }
    }
    if ($resolved -notlike '*preview-data' -and $resolved -notlike '*qa-1793977956209' -and $resolved -notlike '*230553' -and (Get-ChildItem -LiteralPath $resolved -Force).Count) { throw 'Failed-preparation directory is not empty.' }
    [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($resolved, [Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs, [Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin)
    Write-Output ('Recycled migration residue: ' + $resolved)
}
foreach ($target in @('F:\GPTData\.layout-backups\project-layout-20261106-230632', 'F:\GPTData\.layout-backups')) {
    if (-not (Test-Path -LiteralPath $target)) { continue }
    $resolved = (Resolve-Path -LiteralPath $target).ProviderPath
    if ($resolved -ne $target -or (Get-Item -LiteralPath $resolved -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Unexpected empty backup-container target.' }
    if ((Get-ChildItem -LiteralPath $resolved -Force).Count) { continue }
    [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($resolved, [Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs, [Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin)
    Write-Output ('Recycled empty backup container: ' + $resolved)
}
# Keep the previous DB and working release for explicit recovery. Retire obsolete launcher references only.
foreach ($key in @('OldConfig', 'SourceDatabase', 'OldService', 'SourceRepository')) { $deployment.PSObject.Properties.Remove($key) }
$deployment | Add-Member -NotePropertyName LegacyDeploymentRetired -NotePropertyValue $true -Force
[IO.File]::WriteAllText($manifestPath, ($deployment | ConvertTo-Json -Depth 20), (New-Object System.Text.UTF8Encoding($false)))
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'windows\CodexLAN.ps1') -Destination (Join-Path $installation 'CodexLAN.ps1')
