$ErrorActionPreference = 'Stop'
$scope = 'F:\GPTData'
$planPath = Join-Path $env:LOCALAPPDATA 'Programs\CodexLAN\project-layout.json'
$plan = Get-Content -LiteralPath $planPath -Raw -Encoding UTF8 | ConvertFrom-Json
$receipt = Get-Content -LiteralPath (Join-Path $plan.MigrationRoot 'switch.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if ($receipt.Phase -ne 'complete') { throw 'Migration cleanup has not completed.' }
$verified = @()
foreach ($entry in $plan.Entries) {
    if (-not $entry.Source.StartsWith($scope + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected old-path scope.' }
    if (-not (Test-Path -LiteralPath $entry.Source)) { continue }
    $item = Get-Item -LiteralPath $entry.Source -Force
    $absolute = [IO.Path]::GetFullPath($item.FullName)
    if ($absolute -ne $entry.Source -or $item.LinkType -ne 'Junction' -or -not [string]::Equals([string]$item.Target, $entry.Target, [StringComparison]::OrdinalIgnoreCase)) { throw ('Refusing an unexpected real directory or link: ' + $entry.Source) }
    if (-not (Test-Path -LiteralPath $entry.Target -PathType Container)) { throw 'Destination code directory is missing.' }
    $verified += $entry
}
# Delete only the verified junction objects, never recurse into their D-drive targets.
foreach ($entry in $verified) {
    [IO.Directory]::Delete($entry.Source)
    if (-not (Test-Path -LiteralPath $entry.Target -PathType Container)) { throw 'Destination disappeared unexpectedly.' }
    Write-Output ('Removed old junction: ' + $entry.Source + ' -> ' + $entry.Target)
}
Add-Type -AssemblyName Microsoft.VisualBasic
foreach ($target in @('F:\GPTData\hu', 'F:\GPTData\li', 'F:\GPTData')) {
    if (-not (Test-Path -LiteralPath $target)) { continue }
    $resolved = (Resolve-Path -LiteralPath $target).ProviderPath
    if ($resolved -ne $target -or (Get-Item -LiteralPath $resolved -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Unexpected empty-directory target.' }
    if ((Get-ChildItem -LiteralPath $resolved -Force).Count) { throw ('Directory still contains unreviewed entries: ' + $resolved) }
    [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($resolved, [Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs, [Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin)
    Write-Output ('Recycled empty old directory: ' + $resolved)
}
$receipt | Add-Member -NotePropertyName OldPathLinksRemoved -NotePropertyValue $true -Force
[IO.File]::WriteAllText((Join-Path $plan.MigrationRoot 'switch.json'), ($receipt | ConvertTo-Json -Depth 25), (New-Object System.Text.UTF8Encoding($false)))
