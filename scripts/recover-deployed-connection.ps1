$ErrorActionPreference = 'Stop'
$installationRoot = Join-Path $env:LOCALAPPDATA 'Programs\CodexLAN'
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'windows\CodexLAN.ps1') -Destination (Join-Path $installationRoot 'CodexLAN.ps1')
$launcher = Join-Path $installationRoot 'CodexLAN.ps1'
& $launcher -Action Stop
& $launcher -Action Start
