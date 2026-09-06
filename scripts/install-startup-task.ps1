[CmdletBinding()]
param(
    [string]$TaskName = 'CodexLAN Startup'
)

$ErrorActionPreference = 'Stop'

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$startupScript = Join-Path $PSScriptRoot 'start-service.ps1'
$powerShellPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

if (-not (Test-Path -LiteralPath $startupScript -PathType Leaf)) {
    throw "CodexLAN startup script was not found: $startupScript"
}

$action = New-ScheduledTaskAction `
    -Execute $powerShellPath `
    -Argument ('-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "{0}"' -f $startupScript) `
    -WorkingDirectory $repositoryRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $currentUser
$principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -MultipleInstances IgnoreNew

$task = New-ScheduledTask `
    -Action $action `
    -Trigger $trigger `
    -Principal $principal `
    -Settings $settings `
    -Description 'Starts the CodexLAN background supervisor when the current Windows user signs in.'

Register-ScheduledTask -TaskName $TaskName -InputObject $task -Force | Out-Null

$registered = Get-ScheduledTask -TaskName $TaskName
[PSCustomObject]@{
    TaskName         = $registered.TaskName
    State            = [string]$registered.State
    User             = $currentUser
    Trigger           = 'At logon'
    Command           = $startupScript
    WorkingDirectory = $repositoryRoot
}
