[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$Release)
$ErrorActionPreference = 'Stop'
$script = Join-Path $PSScriptRoot 'Promote-Installation.ps1'
$shell = (Get-Command pwsh.exe).Source
$taskName = 'CodexLAN Maintenance'
if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) { throw 'A CodexLAN maintenance task already exists.' }
$action = New-ScheduledTaskAction -Execute $shell -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -File "' + $script + '" -Release "' + (Resolve-Path -LiteralPath $Release).Path + '"') -WorkingDirectory $PSScriptRoot
$principal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$null = Register-ScheduledTask -TaskName $taskName -Action $action -Principal $principal -Settings $settings
Start-ScheduledTask -TaskName $taskName
Write-Output "Started maintenance task: $taskName"
