[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [int]$ExpectedServerPid,

    [ValidateRange(1, 60)]
    [int]$DelaySeconds = 8
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$supervisorLog = Join-Path $projectRoot 'logs\supervisor.log'

Start-Sleep -Seconds $DelaySeconds

$server = Get-CimInstance Win32_Process -Filter "ProcessId=$ExpectedServerPid" -ErrorAction SilentlyContinue
if (-not $server -or $server.Name -ne 'node.exe' -or $server.CommandLine -notmatch 'server\.mjs') {
    exit 0
}

Add-Content -LiteralPath $supervisorLog -Value "$(Get-Date -Format o) Requested supervised Codex LAN server reload." -Encoding UTF8
$children = Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $ExpectedServerPid }
foreach ($child in $children) {
    Stop-Process -Id $child.ProcessId -Force -ErrorAction SilentlyContinue
}
Stop-Process -Id $ExpectedServerPid -Force
