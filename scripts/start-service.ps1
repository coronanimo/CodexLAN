$ErrorActionPreference = 'Stop'

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$serviceScript = Join-Path $repositoryRoot 'server\service.mjs'
$nodePath = (Get-Command node -CommandType Application).Source

& $nodePath $serviceScript 'start'
exit $LASTEXITCODE
