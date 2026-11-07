[CmdletBinding()]
param([switch]$Resume)
$ErrorActionPreference = 'Stop'
$repository = Split-Path -Parent $PSScriptRoot
$homeRoot = Join-Path $env:USERPROFILE '.codexlan'
$installation = Join-Path $env:LOCALAPPDATA 'Programs\CodexLAN'
$migrationRoot = Join-Path $homeRoot ('migrations\project-layout-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
$null = New-Item -ItemType Directory -Path $migrationRoot
function Write-Json([string]$Path, $Value) {
    [IO.File]::WriteAllText($Path, ($Value | ConvertTo-Json -Depth 25), (New-Object System.Text.UTF8Encoding($false)))
}
function Copy-Tree([string]$Source, [string]$Destination, [string[]]$Extra = @()) {
    $null = New-Item -ItemType Directory -Path $Destination -Force
    & robocopy $Source $Destination /E /XJ /COPY:DAT /DCOPY:DAT /R:1 /W:1 /NFL /NDL /NJH /NJS @Extra
    if ($LASTEXITCODE -ge 8) { throw ('Copy failed: ' + $Source) }
}
$entries = @()
foreach ($parent in @('F:\GPTData\hu', 'F:\GPTData\li')) {
    foreach ($project in (Get-ChildItem -LiteralPath $parent -Directory)) {
        if ($project.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'A project root is already a junction. Inspect before preparing.' }
        $target = Join-Path 'D:\Code' $project.Name
        if ((Test-Path -LiteralPath $target) -and $target -ne $repository -and -not $Resume) { throw ('Existing target must be reviewed, not overwritten: ' + $target) }
        $storage = @()
        if (Test-Path -LiteralPath (Join-Path $project.FullName '.codexlan')) {
            $storage += @{ Relative = '.codexlan'; Target = (Join-Path $homeRoot ('legacy-projects\' + $project.Name)) }
        }
        if ($project.Name -eq 'Meta0') {
            $storage += @{ Relative = 'models'; Target = 'F:\QuantData\models\Meta0' }
        }
        if ($project.Name -eq 'quantDataUpdate') {
            foreach ($name in @('db', 'dest', 'oracle', 'samples', 'source')) {
                $storage += @{ Relative = ('playground\' + $name); Target = ('F:\QuantData\ops\quantDataUpdate\playground\' + $name) }
            }
        }
        if ($project.Name -eq 'D2Rep') {
            $storage += @{ Relative = 'data'; Target = (Join-Path $homeRoot 'project-data\D2Rep\data') }
            $storage += @{ Relative = 'node_modules'; Target = (Join-Path $homeRoot 'project-data\D2Rep\node_modules') }
        }
        foreach ($item in $storage) {
            $source = Join-Path $project.FullName $item.Relative
            if (-not (Test-Path -LiteralPath $source)) { continue }
            if ((Test-Path -LiteralPath $item.Target) -and -not $Resume) { throw ('Storage destination already exists: ' + $item.Target) }
            Copy-Tree $source $item.Target
        }
        foreach ($link in (Get-ChildItem -LiteralPath $project.FullName -Directory -Force)) {
            if ($project.Name -eq 'Meta0') { continue }
            if (($link.Attributes -band [IO.FileAttributes]::ReparsePoint) -and $link.LinkType -eq 'Junction') {
                $targetLink = Join-Path $target $link.Name
                if (-not (Test-Path -LiteralPath $targetLink)) { $null = New-Item -ItemType Junction -Path $targetLink -Target $link.Target }
            }
        }
        if ($target -ne $repository) {
            $exclusions = @('/XD', '.venv', '__pycache__', '.pytest_cache', 'pytest_run_temp')
            foreach ($item in $storage) { $exclusions += (Join-Path $project.FullName $item.Relative) }
            Copy-Tree $project.FullName $target $exclusions
        }
        foreach ($item in $storage) {
            if ($project.Name -eq 'Meta0') { continue }
            if (-not (Test-Path -LiteralPath $item.Target)) { continue }
            $link = Join-Path $target $item.Relative
            if (Test-Path -LiteralPath $link) {
                $existing = Get-Item -LiteralPath $link -Force
                if ($existing.LinkType -eq 'Junction' -and [string]::Equals([string]$existing.Target, $item.Target, [StringComparison]::OrdinalIgnoreCase)) { continue }
                throw ('Do not overwrite an existing storage path: ' + $link)
            }
            $null = New-Item -ItemType Junction -Path $link -Target $item.Target
        }
        $entries += @{ Source = $project.FullName; Target = $target; Storage = $storage; Retired = ($project.Name -eq 'Meta0') }
        Write-Output ('Prepared project: ' + $target)
    }
}
$release = Join-Path $installation ('releases\0.8.0-project-access-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
foreach ($folder in @('server', 'public', 'config')) {
    Copy-Tree (Join-Path $repository $folder) (Join-Path $release $folder) @('/XF', 'codexlan.json')
}
foreach ($name in @('package.json', 'package-lock.json', 'LICENSE')) { Copy-Item -LiteralPath (Join-Path $repository $name) -Destination $release }
$node = @(Get-Command node -CommandType Application)[0].Source
$npmCli = Join-Path (Split-Path -Parent $node) 'node_modules\npm\bin\npm-cli.js'
Push-Location -LiteralPath $release
try {
    & $node $npmCli ci --omit=dev --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'Release dependency installation failed.' }
} finally { Pop-Location }
$plan = @{ PreparedAt = (Get-Date).ToString('o'); MigrationRoot = $migrationRoot; Home = $homeRoot; Release = $release; Entries = $entries }
Write-Json (Join-Path $migrationRoot 'plan.json') $plan
Write-Json (Join-Path $installation 'project-layout.json') $plan
Write-Output ('Prepared migration plan: ' + (Join-Path $migrationRoot 'plan.json'))
exit 0
