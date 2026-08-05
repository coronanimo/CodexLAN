[CmdletBinding()]
param(
    [ValidateRange(1, 65535)]
    [int]$Port = 8687,

    [string]$Workspace = '',

    [switch]$OpenFirewall
)

$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$Workspace = if ([string]::IsNullOrWhiteSpace($Workspace)) { Join-Path $projectRoot 'workspace' } else { $Workspace }
New-Item -ItemType Directory -Path $Workspace -Force | Out-Null
$workspacePath = (Resolve-Path -LiteralPath $Workspace).Path

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.js was not found. Install Node.js 20 or newer and try again.'
}

if (-not (Get-Command codex -ErrorAction SilentlyContinue)) {
    throw 'Codex CLI was not found. Install and sign in to Codex first.'
}

if ($OpenFirewall) {
    $ruleName = "Codex LAN Workspace ($Port)"
    $existingRule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
    if (-not $existingRule) {
        New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -Profile Private | Out-Null
        Write-Host "Allowed TCP $Port through the Windows Private network firewall."
    }
}

$env:CODEX_WEB_PORT = "$Port"
$defaultRoute = Get-NetRoute -DestinationPrefix '0.0.0.0/0' |
    Where-Object { $_.NextHop -and $_.NextHop -ne '0.0.0.0' } |
    Sort-Object RouteMetric |
    Select-Object -First 1
if (-not $defaultRoute) {
    throw 'No default IPv4 route was found. Connect to a private LAN and try again.'
}

$lanAddress = Get-NetIPAddress -InterfaceIndex $defaultRoute.InterfaceIndex -AddressFamily IPv4 |
    Where-Object {
        $_.IPAddress -match '^10\.' -or
        $_.IPAddress -match '^192\.168\.' -or
        $_.IPAddress -match '^172\.(1[6-9]|2[0-9]|3[0-1])\.'
    } |
    Select-Object -First 1
if (-not $lanAddress) {
    throw 'The default route has no private IPv4 address. Refusing to bind outside the LAN.'
}

$env:CODEX_WEB_HOST = $lanAddress.IPAddress
$env:CODEX_WORKDIR = $workspacePath
Set-Location -LiteralPath $projectRoot

$logRoot = Join-Path $projectRoot 'logs'
$stdoutFile = Join-Path $logRoot 'service-supervised.out.log'
$stderrFile = Join-Path $logRoot 'service-supervised.err.log'
$supervisorLog = Join-Path $logRoot 'supervisor.log'
$nodePath = (Get-Command node -ErrorAction Stop).Source
$healthUrl = "http://$($lanAddress.IPAddress):$Port/api/health"
$fallbackUrl = "http://$($lanAddress.IPAddress):$Port/"
$healthFailures = 0

New-Item -ItemType Directory -Path $logRoot -Force | Out-Null

function Write-SupervisorLog([string]$Message) {
    Add-Content -LiteralPath $supervisorLog -Value "$(Get-Date -Format o) $Message" -Encoding UTF8
}

function Test-WorkspaceHealth {
    try {
        $response = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 3
        return $response.StatusCode -eq 200
    } catch {
        $statusCode = [int]$_.Exception.Response.StatusCode
        if ($statusCode -notin @(401, 404)) { return $false }
        try {
            $fallback = Invoke-WebRequest -Uri $fallbackUrl -UseBasicParsing -TimeoutSec 3
            return $fallback.StatusCode -eq 200
        } catch {
            return $false
        }
    }
}

function Stop-WorkspaceProcessTree([int]$ServerPid) {
    $server = Get-CimInstance Win32_Process -Filter "ProcessId=$ServerPid" -ErrorAction SilentlyContinue
    if (-not $server -or $server.Name -ne 'node.exe' -or $server.CommandLine -notmatch 'server\.mjs') {
        Write-SupervisorLog "Refused to stop unexpected listener PID $ServerPid."
        return
    }
    $children = Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $ServerPid }
    foreach ($child in $children) {
        Stop-Process -Id $child.ProcessId -Force -ErrorAction SilentlyContinue
    }
    Stop-Process -Id $ServerPid -Force -ErrorAction SilentlyContinue
    Write-SupervisorLog "Stopped unhealthy server PID $ServerPid."
}

Write-SupervisorLog "Supervisor started for $($lanAddress.IPAddress):$Port."
Write-Host "Codex LAN Workspace"
Write-Host "Open http://$($lanAddress.IPAddress):$Port from a device on the same trusted network."
Write-Host "Workspace: $workspacePath"
$startupInfoShown = $false
while ($true) {
    try {
        $listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
            Where-Object { $_.LocalAddress -eq $lanAddress.IPAddress } |
            Select-Object -First 1

        if (-not $listener) {
            $server = Start-Process -FilePath $nodePath -ArgumentList '.\server.mjs' -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $stdoutFile -RedirectStandardError $stderrFile -PassThru
            Write-SupervisorLog "Started server PID $($server.Id)."
            $healthFailures = 0
            Start-Sleep -Seconds 3
            if (-not $startupInfoShown -and (Test-Path -LiteralPath $stdoutFile)) {
                Get-Content -LiteralPath $stdoutFile -Tail 12 | ForEach-Object { Write-Host $_ }
                $startupInfoShown = $true
            }
            Start-Sleep -Seconds 9
            continue
        }

        if (Test-WorkspaceHealth) {
            $healthFailures = 0
        } else {
            $healthFailures += 1
            Write-SupervisorLog "Health check failed ($healthFailures/3) for PID $($listener.OwningProcess)."
            if ($healthFailures -ge 3) {
                Stop-WorkspaceProcessTree -ServerPid $listener.OwningProcess
                $healthFailures = 0
            }
        }
    } catch {
        Write-SupervisorLog "Supervisor loop error: $($_.Exception.Message)"
    }
    Start-Sleep -Seconds 2
}
