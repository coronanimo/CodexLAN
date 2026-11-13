[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$Release, [switch]$Check)
$ErrorActionPreference = 'Stop'
$installation = [System.IO.Path]::GetFullPath($PSScriptRoot)
$manifestPath = Join-Path $installation 'deployment.json'
$deployment = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$candidate = (Resolve-Path -LiteralPath $Release).Path
$scope = Join-Path $installation 'releases\'
if (-not $candidate.StartsWith($scope, [System.StringComparison]::OrdinalIgnoreCase)) { throw "Release must be inside $scope" }
foreach ($file in @('server\service.mjs', 'dist\web\index.html', 'node_modules\express\package.json')) {
    if (-not (Test-Path -LiteralPath (Join-Path $candidate $file) -PathType Leaf)) { throw "Incomplete release: $file" }
}
if ([System.IO.Path]::GetFileName($candidate) -match '(?i)react|parallel') { throw 'Use a CodexLAN version directory without a framework or trial suffix.' }
if ($Check) { Write-Output "Prepared CodexLAN release: $candidate"; return }
$launcher = Join-Path $installation 'CodexLAN.ps1'
$config = Get-Content -LiteralPath (Join-Path $deployment.Home 'config.json') -Raw | ConvertFrom-Json
$previous = $deployment.Release
if ([System.StringComparer]::OrdinalIgnoreCase.Equals($previous, $candidate)) { & $launcher -Action Status; return }
function Select-Release([string]$Path) {
    $deployment.Release = $Path
    [System.IO.File]::WriteAllText($manifestPath, ($deployment | ConvertTo-Json -Depth 20), [System.Text.UTF8Encoding]::new($false))
}
& $launcher -Action Stop
try {
    Select-Release $candidate
    & $launcher -Action Start
    $url = 'http://127.0.0.1:' + $config.port
    $health = Invoke-RestMethod -Uri ($url + '/api/health') -TimeoutSec 10
    $index = (Invoke-WebRequest -Uri ($url + '/') -UseBasicParsing -TimeoutSec 10).Content
    $built = Get-Content -LiteralPath (Join-Path $candidate 'dist\web\index.html') -Raw
    foreach ($entry in [regex]::Matches($built, '(?:src|href)="(/assets/[^"\s]+)"')) {
        if (-not $index.Contains($entry.Groups[1].Value)) { throw 'The running page does not match the selected release.' }
    }
    Write-Output "CodexLAN updated: $candidate"
    Write-Output "LAN: $($health.listeners.lan.url)"
} catch {
    $failure = $_
    & $launcher -Action Stop
    Select-Release $previous
    & $launcher -Action Start
    throw $failure
}
