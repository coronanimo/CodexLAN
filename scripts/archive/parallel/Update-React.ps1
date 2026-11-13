[CmdletBinding()]
param(
    [string]$Release,
    [switch]$Check
)
$ErrorActionPreference = 'Stop'

# Service control validates the caller and target instance roots. The launcher
# preserves managed identity; this updater never clears the managed flag.

$installation = [System.IO.Path]::GetFullPath($PSScriptRoot)
$manifestPath = Join-Path $installation 'parallel.json'
$deployment = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if (-not $Release) {
    $pending = Get-Content -LiteralPath (Join-Path $installation 'pending-update.json') -Raw | ConvertFrom-Json
    $Release = $pending.Release
}
$candidate = (Resolve-Path -LiteralPath $Release).Path
$releaseScope = Join-Path $installation 'releases\'
if (-not $candidate.StartsWith($releaseScope, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "The prepared release must be inside $releaseScope"
}
$configuration = Get-Content -LiteralPath (Join-Path $deployment.Home 'config.json') -Raw | ConvertFrom-Json
if ($configuration.port -ne $deployment.Port -or -not [System.StringComparer]::OrdinalIgnoreCase.Equals([System.IO.Path]::GetFullPath($configuration.dataRoot), [System.IO.Path]::GetFullPath((Join-Path $deployment.Home 'data')))) {
    throw 'The manifest must identify the existing React instance, data root and configured port.'
}
foreach ($relativeFile in @('server\service.mjs', 'server\core\conversation-access.mjs', 'dist\web\index.html', 'node_modules\express\package.json')) {
    if (-not (Test-Path -LiteralPath (Join-Path $candidate $relativeFile) -PathType Leaf)) {
        throw "The release is incomplete: $relativeFile"
    }
}
$launcher = Join-Path $installation 'CodexLAN-React.ps1'
$previousRelease = $deployment.Release
$localUrl = 'http://127.0.0.1:' + $deployment.Port
if ($Check) {
    Write-Output "Prepared release: $candidate"
    Write-Output "Current release: $previousRelease"
    Write-Output "Update target: $localUrl"
    Write-Output 'Preflight passed. No service or application data has been changed.'
    return
}
if ([System.StringComparer]::OrdinalIgnoreCase.Equals($previousRelease, $candidate)) {
    Write-Output 'This release is already selected.'
    & $launcher -Action Status
    return
}

$originalBefore = Get-Content -LiteralPath $deployment.OriginalService -Raw | ConvertFrom-Json
$backup = Join-Path $installation ('parallel.before-update-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.json')
Copy-Item -LiteralPath $manifestPath -Destination $backup

function Set-ParallelRelease([string]$Path) {
    $deployment.Release = $Path
    [System.IO.File]::WriteAllText($manifestPath, ($deployment | ConvertTo-Json -Depth 20), [System.Text.UTF8Encoding]::new($false))
}

# A restart keeps the old supervisor's appRoot. Stop/start selects the new
# complete release while preserving the same instance data and configuration.
& $launcher -Action Stop
try {
    Set-ParallelRelease $candidate
    & $launcher -Action Start
    $health = Invoke-RestMethod -Uri ($localUrl + '/api/health') -TimeoutSec 10
    if ([bool]$health.parallel -ne [bool]$configuration.parallel) { throw 'The running service does not match the configured React instance mode.' }
    $builtIndex = Get-Content -LiteralPath (Join-Path $candidate 'dist\web\index.html') -Raw
    $servedIndex = (Invoke-WebRequest -Uri ($localUrl + '/') -UseBasicParsing -TimeoutSec 10).Content
    foreach ($entry in [regex]::Matches($builtIndex, '(?:src|href)="(/assets/[^"\s]+)"')) {
        if (-not $servedIndex.Contains($entry.Groups[1].Value)) { throw 'The running service is not serving the prepared React build.' }
    }
} catch {
    $failure = $_
    try {
        & $launcher -Action Stop
        Set-ParallelRelease $previousRelease
        & $launcher -Action Start
    } catch {
        Write-Warning "Recovery needs attention. Previous release: $previousRelease. Manifest backup: $backup"
    }
    throw $failure
}

$originalAfter = Get-Content -LiteralPath $deployment.OriginalService -Raw | ConvertFrom-Json
if ($originalAfter.serverPid -ne $originalBefore.serverPid -or $originalAfter.supervisorPid -ne $originalBefore.supervisorPid -or $originalAfter.generation -ne $originalBefore.generation) {
    Write-Warning 'The original service changed during this update; its state should be inspected separately.'
}
Write-Output "React update is running: $candidate"
Write-Output "Local: $localUrl"
Write-Output "LAN: $($health.listeners.lan.url)"
Write-Output 'Refresh the browser and sign in with your existing React-instance account.'
