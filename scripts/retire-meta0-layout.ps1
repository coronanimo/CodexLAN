$ErrorActionPreference = 'Stop'
$sourceRoot = 'D:\Code\Meta0'
$expectedRoot = (Resolve-Path -LiteralPath $sourceRoot).ProviderPath
if ($expectedRoot -ne $sourceRoot -or (Get-Item -LiteralPath $sourceRoot).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Unexpected Meta0 source root.' }
$archiveRoot = 'F:\QuantData\archives\Meta0\project-artifacts-20261106'
$null = New-Item -ItemType Directory -Path $archiveRoot -Force
$quantExtensions = @('.parquet', '.arrow', '.feather', '.npy', '.npz', '.pkl', '.pickle', '.joblib', '.pt', '.pth', '.onnx', '.h5', '.hdf5', '.csv', '.sgl', '.dmp', '.bin', '.db', '.sqlite', '.sqlite3', '.duckdb', '.zip', '.7z', '.tar', '.gz', '.tgz', '.rar')
$stack = New-Object 'System.Collections.Generic.Stack[string]'
$stack.Push($sourceRoot)
$movedCount = 0
$movedBytes = 0L
$removedLinks = @()
while ($stack.Count) {
    foreach ($item in (Get-ChildItem -LiteralPath $stack.Pop() -Force)) {
        $resolvedSource = [IO.Path]::GetFullPath($item.FullName)
        if (-not $resolvedSource.StartsWith($sourceRoot + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Source escaped Meta0.' }
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
            if (-not $item.PSIsContainer -or $item.LinkType -notin @('Junction', 'SymbolicLink')) { throw 'Unexpected reparse point; inspect it first.' }
            # RemoveDirectory removes this directory link itself; it never traverses its data target.
            [IO.Directory]::Delete($resolvedSource)
            $removedLinks += $resolvedSource
            continue
        }
        if ($item.PSIsContainer) { $stack.Push($item.FullName); continue }
        if ($quantExtensions -notcontains $item.Extension.ToLowerInvariant() -and -not ($item.Extension -eq '.json' -and $item.Length -ge 5MB)) { continue }
        $relative = $resolvedSource.Substring($sourceRoot.Length + 1)
        $destination = [IO.Path]::GetFullPath((Join-Path $archiveRoot $relative))
        if (-not $destination.StartsWith($archiveRoot + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Archive destination escaped the named quant-data directory.' }
        if (Test-Path -LiteralPath $destination) { throw ('Archive destination already exists: ' + $destination) }
        $null = New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force
        $movedBytes += $item.Length
        Move-Item -LiteralPath $resolvedSource -Destination $destination
        $movedCount++
    }
}
$planPath = Join-Path $env:LOCALAPPDATA 'Programs\CodexLAN\project-layout.json'
$plan = Get-Content -LiteralPath $planPath -Raw -Encoding UTF8 | ConvertFrom-Json
foreach ($entry in $plan.Entries) {
    if ($entry.Target -eq $sourceRoot) { $entry | Add-Member -NotePropertyName Retired -NotePropertyValue $true -Force }
}
$utf8 = New-Object System.Text.UTF8Encoding($false)
$previousReportPath = Join-Path $plan.MigrationRoot 'meta0-retirement.json'
if (Test-Path -LiteralPath $previousReportPath) {
    $previous = Get-Content -LiteralPath $previousReportPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $movedCount += $previous.MovedFiles
    $movedBytes += [long]$previous.MovedMiB * 1MB
    $removedLinks = @($previous.RemovedLinks) + $removedLinks
}
$report = @{ Source = $sourceRoot; QuantArchive = $archiveRoot; MovedFiles = $movedCount; MovedMiB = [math]::Round($movedBytes / 1MB); RemovedLinks = $removedLinks; Mode = 'Retired knowledge and source archive; no compatibility links or runtime guarantees.' }
[IO.File]::WriteAllText((Join-Path $plan.MigrationRoot 'meta0-retirement.json'), ($report | ConvertTo-Json -Depth 10), $utf8)
[IO.File]::WriteAllText($planPath, ($plan | ConvertTo-Json -Depth 25), $utf8)
[IO.File]::WriteAllText((Join-Path $plan.MigrationRoot 'plan.json'), ($plan | ConvertTo-Json -Depth 25), $utf8)
Write-Output ($report | ConvertTo-Json -Depth 10)
