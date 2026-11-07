$ErrorActionPreference = 'Stop'
$launcher = Join-Path $PSScriptRoot 'CodexLAN.ps1'
$resultCode = 0
try {
    Write-Host 'Restarting the deployed CodexLAN service...'
    & $launcher -Action Restart
    $deployment = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'deployment.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $config = Get-Content -LiteralPath (Join-Path $deployment.Home 'config.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $ready = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        try {
            $status = Invoke-RestMethod -Uri ('http://127.0.0.1:' + $config.port + '/api/ready') -TimeoutSec 2
            $ready = $status.status -eq 'ready'
        } catch { $ready = $false }
        if ($ready) { break }
        Start-Sleep -Milliseconds 1000
    }
    if (-not $ready) { throw 'The web service started, but the Codex backend is not ready. Check the status and log below.' }
    Write-Host ''
    Write-Host 'CodexLAN restarted successfully. Codex backend is ready.' -ForegroundColor Green
    & $launcher -Action Status
} catch {
    $resultCode = 1
    Write-Host ''
    Write-Host ('Restart failed: ' + $_.Exception.Message) -ForegroundColor Red
    Write-Host ('Service log: ' + (Join-Path $env:USERPROFILE '.codexlan\logs\codexlan.log'))
}
Write-Host ''
$null = Read-Host 'Press Enter to close this window'
exit $resultCode
