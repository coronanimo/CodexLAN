[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$Release)
$ErrorActionPreference = 'Stop'
if ($env:CODEXLAN_MANAGED_PROCESS -eq '1') { throw 'Run updates from an external maintenance task or terminal.' }
$installation = Join-Path $env:LOCALAPPDATA 'Programs\CodexLAN'
$deployment = Get-Content -LiteralPath (Join-Path $installation 'deployment.json') -Raw | ConvertFrom-Json
$config = Get-Content -LiteralPath (Join-Path $deployment.Home 'config.json') -Raw | ConvertFrom-Json
$log = Join-Path $config.logRoot ('update-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.log')
$resultPath = Join-Path $config.logRoot 'last-update.json'
$null = Start-Transcript -LiteralPath $log
try {
    & (Join-Path $installation 'Update-CodexLAN.ps1') -Release $Release
    $health = Invoke-RestMethod -Uri ('http://127.0.0.1:' + $config.port + '/api/health') -TimeoutSec 10
    $result = @{ Status = 'ready'; Release = $Release; ServerPid = $health.pid; CompletedAt = (Get-Date).ToString('o') }
    [System.IO.File]::WriteAllText($resultPath, ($result | ConvertTo-Json), [System.Text.UTF8Encoding]::new($false))
} catch {
    $result = @{ Status = 'failed'; Release = $Release; Error = $_.Exception.Message; CompletedAt = (Get-Date).ToString('o') }
    [System.IO.File]::WriteAllText($resultPath, ($result | ConvertTo-Json), [System.Text.UTF8Encoding]::new($false))
    throw
} finally { $null = Stop-Transcript }
