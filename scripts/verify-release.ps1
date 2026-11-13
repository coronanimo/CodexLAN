[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$Release)
$ErrorActionPreference = 'Stop'
$repository = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$previousRoot = $env:LAN_TEST_APP_ROOT
$previousConfig = $env:CODEX_CONFIG
$previousMode = $env:NODE_ENV
try {
    $env:LAN_TEST_APP_ROOT = (Resolve-Path -LiteralPath $Release).Path
    $env:CODEX_CONFIG = '0'
    $env:NODE_ENV = 'test'
    $runtime = Join-Path $env:LOCALAPPDATA 'Programs\CodexLAN\runtime\node.exe'
    & $runtime --test (Join-Path $repository 'test\http-security.test.mjs') (Join-Path $repository 'test\lan-read.test.mjs') (Join-Path $repository 'test\parallel-instance.test.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'Release HTTP checks failed.' }
} finally {
    $env:LAN_TEST_APP_ROOT = $previousRoot
    $env:CODEX_CONFIG = $previousConfig
    $env:NODE_ENV = $previousMode
}
