[CmdletBinding()]
param([ValidateSet('Start', 'Stop', 'Restart', 'Status', 'Log')][string]$Action = 'Status')
$ErrorActionPreference = 'Stop'
$deployment = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'parallel.json') -Raw | ConvertFrom-Json
$configuration = Join-Path $deployment.Home 'config.json'
$previousConfig = $env:CODEX_CONFIG
$previousManagedRoot = $env:CODEXLAN_MANAGED_DATA_ROOT
$previousNetwork = @{}
try {
    # Preserve the caller's instance identity before selecting the target.
    # Older supervisors only supplied CODEX_CONFIG and the managed flag.
    if ($env:CODEXLAN_MANAGED_PROCESS -eq '1' -and -not $previousManagedRoot -and $previousConfig -and $previousConfig -ne '0') {
        $callerConfig = Get-Content -LiteralPath $previousConfig -Raw | ConvertFrom-Json
        if ($callerConfig.dataRoot) {
            $callerDataRoot = [string]$callerConfig.dataRoot
            if (-not [System.IO.Path]::IsPathRooted($callerDataRoot)) {
                $callerDataRoot = Join-Path ([System.IO.Path]::GetDirectoryName([System.IO.Path]::GetFullPath($previousConfig))) $callerDataRoot
            }
            $env:CODEXLAN_MANAGED_DATA_ROOT = [System.IO.Path]::GetFullPath($callerDataRoot)
        }
    }
    $networkPath = Join-Path $PSScriptRoot 'environment.json'
    if (Test-Path -LiteralPath $networkPath) {
        $network = Get-Content -LiteralPath $networkPath -Raw | ConvertFrom-Json
        foreach ($entry in $network.PSObject.Properties) {
            if ($entry.Name -notin @('HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY')) { throw 'Unsupported network environment setting.' }
            $previousNetwork[$entry.Name] = [Environment]::GetEnvironmentVariable($entry.Name, 'Process')
            [Environment]::SetEnvironmentVariable($entry.Name, [string]$entry.Value, 'Process')
        }
    }
    $env:CODEX_CONFIG = $configuration
    & $deployment.NodePath (Join-Path $deployment.Release 'server\service.mjs') $Action.ToLowerInvariant()
    if ($LASTEXITCODE -ne 0) { throw "Parallel service command failed: $Action" }
} finally {
    $env:CODEX_CONFIG = $previousConfig
    $env:CODEXLAN_MANAGED_DATA_ROOT = $previousManagedRoot
    foreach ($name in $previousNetwork.Keys) { [Environment]::SetEnvironmentVariable($name, $previousNetwork[$name], 'Process') }
}
