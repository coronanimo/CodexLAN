[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Release,
    [string]$OriginalInstallation = (Join-Path $env:LOCALAPPDATA 'Programs\CodexLAN'),
    [string]$InstallationRoot = (Join-Path $env:LOCALAPPDATA 'Programs\CodexLAN-React'),
    [string]$InstanceRoot = (Join-Path $env:USERPROFILE '.codexlan-react'),
    [int]$Port = 8690
)
$ErrorActionPreference = 'Stop'
$repository = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$releaseSource = (Resolve-Path -LiteralPath $Release).Path
$originalDeployment = Get-Content -LiteralPath (Join-Path $OriginalInstallation 'deployment.json') -Raw | ConvertFrom-Json
$originalConfig = Get-Content -LiteralPath (Join-Path $originalDeployment.Home 'config.json') -Raw | ConvertFrom-Json
$sourceData = [System.IO.Path]::GetFullPath($originalConfig.dataRoot)
$instance = [System.IO.Path]::GetFullPath($InstanceRoot)
$installation = [System.IO.Path]::GetFullPath($InstallationRoot)
$runtime = Join-Path $OriginalInstallation 'runtime\node.exe'
foreach ($fresh in @($instance, $installation)) {
    if (Test-Path -LiteralPath $fresh) { throw "Parallel installation requires a fresh target; existing files are preserved: $fresh" }
    if ($fresh.StartsWith([System.IO.Path]::GetFullPath($originalDeployment.Home) + '\', [System.StringComparison]::OrdinalIgnoreCase) -or
        $fresh.StartsWith([System.IO.Path]::GetFullPath($OriginalInstallation) + '\', [System.StringComparison]::OrdinalIgnoreCase)) { throw "Parallel targets must be outside the original installation: $fresh" }
}
if ($Port -lt 1 -or $Port -gt 65535 -or $Port -eq $originalConfig.port) { throw 'Parallel port must be valid and different from the original port.' }
if (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue) { throw "Parallel port is occupied: $Port" }
if (-not (Test-Path -LiteralPath (Join-Path $releaseSource 'server\core\conversation-access.mjs'))) { throw 'Release does not support parallel conversation ownership.' }
if (-not (Test-Path -LiteralPath (Join-Path $releaseSource 'dist\web\index.html'))) { throw 'React assets are missing.' }
$originalServicePath = Join-Path $sourceData 'service\state.json'
$originalState = Get-Content -LiteralPath $originalServicePath -Raw | ConvertFrom-Json

function Write-ParallelJson([string]$Path, $Value) {
    [System.IO.File]::WriteAllText($Path, ($Value | ConvertTo-Json -Depth 20), [System.Text.UTF8Encoding]::new($false))
}

$null = New-Item -ItemType Directory -Path $installation, $instance
$targetRelease = Join-Path $installation 'release'
Copy-Item -LiteralPath $releaseSource -Destination $targetRelease -Recurse
$parallelData = Join-Path $instance 'data'
& $runtime (Join-Path $repository 'scripts\parallel-snapshot.mjs') (Join-Path $sourceData 'workspace-state.sqlite') $parallelData
if ($LASTEXITCODE -ne 0) { throw 'Parallel snapshot failed; the original installation has not been changed.' }
$config = @{
    port = $Port; host = $originalConfig.host; parallel = $true
    workspaceRoot = (Join-Path $instance 'projects'); dataRoot = $parallelData
    logRoot = (Join-Path $instance 'logs'); attachmentRoot = (Join-Path $instance 'attachments')
    codexBin = $originalConfig.codexBin; autoApprove = [bool]$originalConfig.autoApprove; autoApproveBrowser = [bool]$originalConfig.autoApproveBrowser
}
if ($originalConfig.attachmentRoot) { $config.attachmentReadRoot = $originalConfig.attachmentRoot }
$null = New-Item -ItemType Directory -Path $config.workspaceRoot, $config.logRoot, $config.attachmentRoot
Write-ParallelJson (Join-Path $instance 'config.json') $config
$manifest = @{
    Home = $instance; Release = $targetRelease; NodePath = $runtime; Port = $Port
    OriginalRelease = $originalDeployment.Release; OriginalService = $originalServicePath
    OriginalServerPid = $originalState.serverPid; OriginalSupervisorPid = $originalState.supervisorPid; OriginalGeneration = $originalState.generation
    CreatedAt = (Get-Date).ToString('o')
}
Write-ParallelJson (Join-Path $installation 'parallel.json') $manifest
Copy-Item -LiteralPath (Join-Path $repository 'scripts\windows\CodexLAN-React.ps1') -Destination $installation
$networkPath = Join-Path $OriginalInstallation 'environment.json'
if (Test-Path -LiteralPath $networkPath) { Copy-Item -LiteralPath $networkPath -Destination (Join-Path $installation 'environment.json') }

# Reuse the existing read-only Node executable. Its established Private-network
# firewall rules can cover a second process without changing the old service.
$firewall = @()
foreach ($applicationFilter in @(Get-NetFirewallApplicationFilter -Program $runtime -ErrorAction SilentlyContinue)) {
    $rule = Get-NetFirewallRule -AssociatedNetFirewallApplicationFilter $applicationFilter
    $ports = Get-NetFirewallPortFilter -AssociatedNetFirewallRule $rule
    if ($rule.Enabled -eq 'True' -and $rule.Direction -eq 'Inbound' -and $rule.Action -eq 'Allow') {
        $firewall += @{ Name = $rule.DisplayName; Profile = [string]$rule.Profile; Protocol = [string]$ports.Protocol; LocalPort = @($ports.LocalPort) }
    }
}
Write-ParallelJson (Join-Path $instance 'network.json') @{ Runtime = $runtime; ExistingInboundRules = $firewall }
& (Join-Path $installation 'CodexLAN-React.ps1') -Action Start
$after = Get-Content -LiteralPath $originalServicePath -Raw | ConvertFrom-Json
if ($after.serverPid -ne $originalState.serverPid -or $after.supervisorPid -ne $originalState.supervisorPid -or $after.generation -ne $originalState.generation) {
    throw 'The original service changed while installation was running; inspect its state before attributing the change.'
}
Write-Output "Parallel installation ready: $installation"
Write-Output "Original service preserved: PID $($after.serverPid), generation $($after.generation)"
