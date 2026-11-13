[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$Release, [switch]$Check)
$ErrorActionPreference = 'Stop'
$installation = Join-Path $env:LOCALAPPDATA 'Programs\CodexLAN'
$source = (Resolve-Path -LiteralPath $Release).Path
$name = [System.IO.Path]::GetFileName($source)
if ($name -notmatch '^\d+\.\d+\.\d+-\d{8}-\d{6}$') { throw 'Expected a versioned CodexLAN release directory.' }
$target = [System.IO.Path]::GetFullPath((Join-Path $installation ('releases\' + $name)))
$scope = [System.IO.Path]::GetFullPath((Join-Path $installation 'releases')) + '\'
if (-not $target.StartsWith($scope, [System.StringComparison]::OrdinalIgnoreCase)) { throw "Release target outside installation: $target" }
foreach ($file in @('server\index.mjs', 'dist\web\index.html', 'node_modules\express\package.json')) {
    if (-not (Test-Path -LiteralPath (Join-Path $source $file) -PathType Leaf)) { throw "Missing release file: $file" }
}
if ($Check) {
    Write-Output "Prepared update target: $target"
    return
}
$taskName = 'CodexLAN Update'
if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) { throw 'A CodexLAN update task already exists.' }
if (Test-Path -LiteralPath $target) { throw "Release already staged: $target" }
Copy-Item -LiteralPath $source -Destination $target -Recurse
& (Join-Path $installation 'Update-CodexLAN.ps1') -Release $target -Check
$runner = Join-Path $PSScriptRoot 'windows\Run-CodexLANUpdate.ps1'
$shell = (Get-Command pwsh.exe).Source
$action = New-ScheduledTaskAction -Execute $shell -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -File "' + $runner + '" -Release "' + $target + '"') -WorkingDirectory $installation
$principal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 5) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$null = Register-ScheduledTask -TaskName $taskName -Action $action -Principal $principal -Settings $settings
Start-ScheduledTask -TaskName $taskName
Write-Output "Update started: $target"
