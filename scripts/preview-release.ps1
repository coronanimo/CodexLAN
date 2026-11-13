[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$Release)
$ErrorActionPreference = 'Stop'
$previous = $env:LAN_TEST_APP_ROOT
try {
    $env:LAN_TEST_APP_ROOT = (Resolve-Path -LiteralPath $Release).Path
    & node (Join-Path $PSScriptRoot '..\test\fixtures\preview-workbench.mjs')
} finally { $env:LAN_TEST_APP_ROOT = $previous }
