[CmdletBinding()]
param([ValidateSet('Start', 'Stop', 'Restart', 'Status', 'Log', 'Cutover', 'Rollback')][string]$Action = 'Status')
$ErrorActionPreference = 'Stop'
$installationRoot = $PSScriptRoot
$environmentPath = Join-Path $installationRoot 'environment.json'
if (Test-Path -LiteralPath $environmentPath) {
    $launchEnvironment = Get-Content -LiteralPath $environmentPath -Raw | ConvertFrom-Json
    foreach ($property in $launchEnvironment.PSObject.Properties) {
        if ($property.Name -notin @('HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY')) { throw 'Unsupported deployment environment setting.' }
        [Environment]::SetEnvironmentVariable($property.Name, [string]$property.Value, 'Process')
    }
}
$manifestPath = Join-Path $installationRoot 'deployment.json'
$deployment = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($deployment.LegacyDeploymentRetired -and $Action -in @('Cutover', 'Rollback')) {
    throw 'The original F-drive deployment has been retired. Use Start, Stop, Restart, Status or Log. Recovery requires an explicit saved database/release backup.'
}
$configPath = Join-Path $deployment.Home 'config.json'
$receiptPath = Join-Path $deployment.Home 'cutover.json'
$nodePath = Join-Path $installationRoot 'runtime\node.exe'
$servicePath = Join-Path $deployment.Release 'server\service.mjs'

function Write-Json([string]$Path, $Value) {
    [System.IO.File]::WriteAllText($Path, ($Value | ConvertTo-Json -Depth 20), (New-Object System.Text.UTF8Encoding($false)))
}

function Invoke-Service([string]$Script, [string]$Config, [string]$Command) {
    $previousConfig = $env:CODEX_CONFIG
    try {
        $env:CODEX_CONFIG = $Config
        & $nodePath $Script $Command
        if ($LASTEXITCODE -ne 0) { throw ('Service command failed: ' + $Command) }
    } finally { $env:CODEX_CONFIG = $previousConfig }
}

function Install-Startup {
    $powerShellPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $launcher = Join-Path $installationRoot 'CodexLAN.ps1'
    $user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    $taskAction = New-ScheduledTaskAction -Execute $powerShellPath -Argument ('-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}" -Action Start' -f $launcher) -WorkingDirectory $installationRoot
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
    $principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
    $task = New-ScheduledTask -Action $taskAction -Trigger $trigger -Principal $principal -Settings $settings -Description 'Starts the independently deployed CodexLAN release.'
    $null = Register-ScheduledTask -TaskName $deployment.TaskName -InputObject $task -Force
}

if ($Action -eq 'Cutover') {
    if ($env:CODEXLAN_MANAGED_PROCESS -eq '1') { throw 'Run Cutover from an external PowerShell terminal.' }
    if (Test-Path -LiteralPath $receiptPath) {
        $previousReceipt = Get-Content -LiteralPath $receiptPath -Raw | ConvertFrom-Json
        if ($previousReceipt.Phase -ne 'rolled-back') { throw 'Cutover already attempted. Inspect cutover.json; use Rollback before retrying.' }
    }
    $originalConfig = Get-Content -LiteralPath (Join-Path $deployment.Home 'backups\old-config.original.json') -Raw
    $currentConfig = Get-Content -LiteralPath (Join-Path $deployment.SourceRepository 'config\codexlan.json') -Raw
    if ($originalConfig -cne $currentConfig) { throw 'Old configuration changed after preparation. Review and refresh the deployment before switching.' }
    $receipt = @{ StartedAt = (Get-Date).ToString('o'); Phase = 'stopping-old'; Generation = $null }
    Write-Json $receiptPath $receipt
    try {
        Disable-ScheduledTask -TaskName $deployment.TaskName -ErrorAction SilentlyContinue | Out-Null
        Invoke-Service $deployment.OldService $deployment.OldConfig 'stop'
        $generation = Join-Path $deployment.Home ('data\cutover-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
        $snapshotScript = Join-Path $deployment.Release 'scripts\deployment-snapshot.mjs'
        & $nodePath $snapshotScript $deployment.SourceDatabase $generation $deployment.SourceRepository $deployment.SourceCheckout
        if ($LASTEXITCODE -ne 0) { throw 'Final database snapshot failed.' }
        $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
        $config.dataRoot = $generation
        Write-Json $configPath $config
        $receipt.Generation = $generation
        $receipt.Phase = 'starting-new'
        Write-Json $receiptPath $receipt
        Invoke-Service $servicePath $configPath 'start'
        Install-Startup
        $receipt.Phase = 'ready'
        Write-Json $receiptPath $receipt
        Write-Output 'Cutover complete. Check login, history, attachments and queues before accepting the migration.'
    } catch {
        Write-Warning 'Cutover did not complete. Old database remains intact. Run -Action Rollback after inspecting the error.'
        throw
    }
    exit
}

if ($Action -eq 'Rollback') {
    if ($env:CODEXLAN_MANAGED_PROCESS -eq '1') { throw 'Run Rollback from an external PowerShell terminal.' }
    if (-not (Test-Path -LiteralPath $receiptPath)) { throw 'No cutover to roll back.' }
    $receipt = Get-Content -LiteralPath $receiptPath -Raw | ConvertFrom-Json
    if ($receipt.Phase -eq 'rolled-back') { throw 'Already rolled back.' }
    $rollbackConfig = Get-Content -LiteralPath $deployment.OldConfig -Raw | ConvertFrom-Json
    if (-not (Test-Path -LiteralPath (Join-Path $rollbackConfig.dataRoot 'workspace-state.sqlite') -PathType Leaf)) {
        throw 'The old live data directory has been cleaned. Automatic legacy rollback is unavailable. Restore a saved backup explicitly; the current service has not been stopped.'
    }
    if ($receipt.Generation) { Invoke-Service $servicePath $configPath 'stop' }
    Disable-ScheduledTask -TaskName $deployment.TaskName -ErrorAction SilentlyContinue | Out-Null
    $oldTask = Get-Content -LiteralPath (Join-Path $deployment.Home 'backups\startup-task.xml') -Raw
    $null = Register-ScheduledTask -TaskName $deployment.TaskName -Xml $oldTask -Force
    Invoke-Service $deployment.OldService $deployment.OldConfig 'start'
    $receipt.Phase = 'rolled-back'
    Write-Json $receiptPath $receipt
    Write-Output 'Old deployment restarted. New-generation data retained separately; post-cutover changes are not merged back.'
    exit
}

if (-not $deployment.LegacyDeploymentRetired) {
    if (-not (Test-Path -LiteralPath $receiptPath)) { throw 'Deployment is staged. Run -Action Cutover before starting it.' }
    $receipt = Get-Content -LiteralPath $receiptPath -Raw | ConvertFrom-Json
    if ($receipt.Phase -ne 'ready') { throw 'Deployment is not active; inspect cutover.json.' }
}
Invoke-Service $servicePath $configPath $Action.ToLowerInvariant()
