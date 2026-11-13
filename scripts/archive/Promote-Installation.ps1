[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$Release, [switch]$Check)
$ErrorActionPreference = 'Stop'
$repository = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$programs = Join-Path $env:LOCALAPPDATA 'Programs'
$installation = Join-Path $programs 'CodexLAN'
$preview = Join-Path $programs 'CodexLAN-React'
$formalHome = Join-Path $env:USERPROFILE '.codexlan'
$previewHome = Join-Path $env:USERPROFILE '.codexlan-react'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$archive = Join-Path $programs ('CodexLAN-Archive\' + $stamp)
$dataArchive = Join-Path $env:USERPROFILE ('.codexlan-archive\' + $stamp)
$stage = Join-Path $programs ('CodexLAN-Staging-' + $stamp)
$candidate = (Resolve-Path -LiteralPath $Release).Path
$manifest = Get-Content -LiteralPath (Join-Path $preview 'parallel.json') -Raw | ConvertFrom-Json
$config = Get-Content -LiteralPath (Join-Path $previewHome 'config.json') -Raw | ConvertFrom-Json
$legacyState = Get-Content -LiteralPath (Join-Path $formalHome 'data\service\state.json') -Raw | ConvertFrom-Json

function Assert-InScope([string]$Path, [string]$Scope) {
    $absolute = [System.IO.Path]::GetFullPath($Path)
    $root = [System.IO.Path]::GetFullPath($Scope).TrimEnd('\')
    if (-not [System.StringComparer]::OrdinalIgnoreCase.Equals($absolute, $root) -and -not $absolute.StartsWith($root + '\', [System.StringComparison]::OrdinalIgnoreCase)) { throw "Path outside intended scope: $absolute" }
    return $absolute
}
function Move-Checked([string]$Source, [string]$Destination, [string]$SourceScope, [string]$TargetScope) {
    $verifiedSource = Assert-InScope $Source $SourceScope
    $verifiedDestination = Assert-InScope $Destination $TargetScope
    if (Test-Path -LiteralPath $verifiedDestination) { throw "Move destination exists: $verifiedDestination" }
    Move-Item -LiteralPath $verifiedSource -Destination $verifiedDestination
    Write-Output "Moved: $verifiedSource -> $verifiedDestination"
}
function Write-Json([string]$Path, $Value) {
    [System.IO.File]::WriteAllText($Path, ($Value | ConvertTo-Json -Depth 30), [System.Text.UTF8Encoding]::new($false))
}
function Same-FileContent([string]$First, [string]$Second) {
    $left = [System.IO.File]::OpenRead($First)
    $right = [System.IO.File]::OpenRead($Second)
    try {
        if ($left.Length -ne $right.Length) { return $false }
        $a = New-Object byte[] 65536
        $b = New-Object byte[] 65536
        while (($count = $left.Read($a, 0, $a.Length)) -gt 0) {
            $offset = 0
            while ($offset -lt $count) {
                $read = $right.Read($b, $offset, $count - $offset)
                if (-not $read) { return $false }
                $offset += $read
            }
            for ($i = 0; $i -lt $count; $i++) { if ($a[$i] -ne $b[$i]) { return $false } }
        }
        return $true
    } finally { $left.Dispose(); $right.Dispose() }
}
function Merge-Attachments([string]$Source, [string]$Destination) {
    if (-not (Test-Path -LiteralPath $Source)) { return }
    foreach ($file in Get-ChildItem -LiteralPath $Source -File -Recurse -Force) {
        $relative = $file.FullName.Substring($Source.TrimEnd('\').Length + 1)
        $target = Assert-InScope (Join-Path $Destination $relative) $Destination
        if (Test-Path -LiteralPath $target) {
            if (-not (Same-FileContent $file.FullName $target)) { throw "Attachment collision: $relative" }
        } else {
            $null = New-Item -ItemType Directory -Path ([System.IO.Path]::GetDirectoryName($target)) -Force
            Copy-Item -LiteralPath $file.FullName -Destination $target
        }
    }
}

$null = Assert-InScope $candidate (Join-Path $repository 'dist\releases')
if ([System.IO.Path]::GetFileName($candidate) -match '(?i)react|parallel') { throw 'Candidate release has a trial name.' }
if ($legacyState.status -ne 'stopped') { throw 'The legacy service must already be stopped.' }
if ($manifest.Home -ne $previewHome -or $config.dataRoot -ne (Join-Path $previewHome 'data') -or $config.port -ne 8688) { throw 'Unexpected current instance configuration.' }
foreach ($root in @($installation, $preview, $formalHome, $previewHome)) {
    if ((Get-Item -LiteralPath $root -Force).Attributes -band [System.IO.FileAttributes]::ReparsePoint) { throw "Installation root must not be a link: $root" }
}
foreach ($path in @($stage, $archive, $dataArchive)) { if (Test-Path -LiteralPath $path) { throw "Fresh target required: $path" } }
foreach ($file in @('server\index.mjs', 'server\agents\codex\output-recovery.mjs', 'dist\web\index.html', 'node_modules\express\package.json', 'management\CodexLAN.ps1', 'management\Update-CodexLAN.ps1')) {
    if (-not (Test-Path -LiteralPath (Join-Path $candidate $file) -PathType Leaf)) { throw "Candidate file missing: $file" }
}
if ($Check) {
    Write-Output "Formal installation: $installation"
    Write-Output "Formal application data: $formalHome"
    Write-Output "Archive: $archive"
    Write-Output "Data archive: $dataArchive"
    return
}
if ($env:CODEXLAN_MANAGED_PROCESS -eq '1') { throw 'Run promotion from an external maintenance task or terminal.' }

$null = New-Item -ItemType Directory -Path $stage, $archive, $dataArchive
$null = Start-Transcript -LiteralPath (Join-Path $archive 'promotion.log')
$stopped = $false
$oldMoved = $false
$homeMoved = $false
$newSelected = $false
try {
    $releaseName = [System.IO.Path]::GetFileName($candidate)
    $null = New-Item -ItemType Directory -Path (Join-Path $stage 'releases'), (Join-Path $stage 'runtime'), (Join-Path $archive 'tasks')
    Copy-Item -LiteralPath $candidate -Destination (Join-Path $stage ('releases\' + $releaseName)) -Recurse
    Copy-Item -LiteralPath (Join-Path $installation 'runtime\node.exe') -Destination (Join-Path $stage 'runtime\node.exe')
    foreach ($file in @('CodexLAN.ps1', 'Update-CodexLAN.ps1', 'Restart-CodexLAN.ps1')) {
        Copy-Item -LiteralPath (Join-Path $candidate ('management\' + $file)) -Destination $stage
    }
    if (Test-Path -LiteralPath (Join-Path $preview 'environment.json')) { Copy-Item -LiteralPath (Join-Path $preview 'environment.json') -Destination $stage }
    foreach ($task in Get-ScheduledTask -TaskName '*CodexLAN*') {
        [System.IO.File]::WriteAllText((Join-Path $archive ('tasks\' + $task.TaskName + '.xml')), (Export-ScheduledTask -TaskName $task.TaskName), [System.Text.UTF8Encoding]::new($false))
    }
    & (Join-Path $preview 'CodexLAN-React.ps1') -Action Stop
    $stopped = $true
    Copy-Item -LiteralPath (Join-Path $previewHome 'data') -Destination (Join-Path $dataArchive 'before-data') -Recurse
    Copy-Item -LiteralPath (Join-Path $previewHome 'config.json') -Destination (Join-Path $dataArchive 'before-config.json')
    Move-Checked $installation (Join-Path $archive 'legacy-installation') $installation $archive
    $oldMoved = $true
    Move-Checked $formalHome (Join-Path $dataArchive 'legacy-home') $formalHome $dataArchive
    $homeMoved = $true
    Move-Checked $previewHome $formalHome $previewHome $formalHome
    Merge-Attachments (Join-Path $dataArchive 'legacy-home\attachments') (Join-Path $formalHome 'attachments')
    $development = Join-Path $dataArchive 'legacy-home\development'
    if ((Test-Path -LiteralPath $development) -and -not (Test-Path -LiteralPath (Join-Path $formalHome 'development'))) {
        Move-Checked $development (Join-Path $formalHome 'development') $dataArchive $formalHome
    }
    foreach ($file in @('data\parallel-owned-conversations.json', 'data\parallel-snapshot.json', 'network.json')) {
        $path = Join-Path $formalHome $file
        if (Test-Path -LiteralPath $path) { Move-Checked $path (Join-Path $dataArchive ([System.IO.Path]::GetFileName($file))) $formalHome $dataArchive }
    }
    if (Test-Path -LiteralPath (Join-Path $formalHome 'logs')) { Move-Checked (Join-Path $formalHome 'logs') (Join-Path $dataArchive 'previous-logs') $formalHome $dataArchive }
    $null = New-Item -ItemType Directory -Path (Join-Path $formalHome 'logs')
    $formalConfig = [ordered]@{
        port = 8688; host = $config.host; codexBin = $config.codexBin
        workspaceRoot = (Join-Path $formalHome 'projects'); dataRoot = (Join-Path $formalHome 'data')
        logRoot = (Join-Path $formalHome 'logs'); attachmentRoot = (Join-Path $formalHome 'attachments')
        autoApprove = [bool]$config.autoApprove; autoApproveBrowser = [bool]$config.autoApproveBrowser
    }
    Write-Json (Join-Path $formalHome 'config.json') $formalConfig
    & (Join-Path $stage 'runtime\node.exe') (Join-Path $repository 'scripts\formalize-state.mjs') (Join-Path $formalHome 'data\workspace-state.sqlite') $previewHome $formalHome
    if ($LASTEXITCODE -ne 0) { throw 'Application data relocation failed.' }
    $deployment = [ordered]@{
        Home = $formalHome; Release = (Join-Path $installation ('releases\' + $releaseName))
        NodePath = (Join-Path $installation 'runtime\node.exe'); Port = 8688
        TaskName = 'CodexLAN Startup'; SourceCheckout = $repository
    }
    Write-Json (Join-Path $stage 'deployment.json') $deployment
    Move-Checked $stage $installation $stage $installation
    $newSelected = $true
    & (Join-Path $installation 'CodexLAN.ps1') -Action Start
    $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8688/api/health' -TimeoutSec 10
    $served = (Invoke-WebRequest -Uri 'http://127.0.0.1:8688/' -UseBasicParsing -TimeoutSec 10).Content
    $built = Get-Content -LiteralPath (Join-Path $deployment.Release 'dist\web\index.html') -Raw
    foreach ($entry in [regex]::Matches($built, '(?:src|href)="(/assets/[^"\s]+)"')) {
        if (-not $served.Contains($entry.Groups[1].Value)) { throw 'Running web entry differs from prepared release.' }
    }
    if ($health.parallel -or $health.assetVersion -notlike 'web-*') { throw 'Unexpected running application.' }
    Move-Checked $preview (Join-Path $archive 'previous-installation') $preview $archive
    foreach ($task in Get-ScheduledTask -TaskName '*CodexLAN*React*') {
        if ($task.State -eq 'Running') { throw "Old maintenance task is still running: $($task.TaskName)" }
        Unregister-ScheduledTask -TaskName $task.TaskName -Confirm:$false
    }
    $powerShell = (Get-Command pwsh.exe).Source
    $action = New-ScheduledTaskAction -Execute $powerShell -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -File "' + (Join-Path $installation 'CodexLAN.ps1') + '" -Action Start') -WorkingDirectory $installation
    $user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
    $principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
    $null = Register-ScheduledTask -TaskName 'CodexLAN Startup' -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force
    & (Join-Path $repository 'scripts\install-desktop-restart.ps1')
    $result = [ordered]@{ Status = 'ready'; Release = $deployment.Release; Home = $formalHome; Installation = $installation; Archive = $archive; DataArchive = $dataArchive; ServerPid = $health.pid; CompletedAt = (Get-Date).ToString('o') }
    Write-Json (Join-Path $archive 'result.json') $result
    Write-Output "CodexLAN is ready: $($health.listeners.lan.url)"
} catch {
    $failure = $_
    if ($newSelected) {
        try { & (Join-Path $installation 'CodexLAN.ps1') -Action Stop } catch { Write-Warning $_.Exception.Message }
        Move-Checked $installation (Join-Path $archive 'failed-installation') $installation $archive
    }
    if ($homeMoved -and (Test-Path -LiteralPath $formalHome)) {
        Move-Checked $formalHome $previewHome $formalHome $previewHome
        Move-Checked (Join-Path $previewHome 'data') (Join-Path $dataArchive 'failed-data') $previewHome $dataArchive
        Copy-Item -LiteralPath (Join-Path $dataArchive 'before-data') -Destination (Join-Path $previewHome 'data') -Recurse
        Copy-Item -LiteralPath (Join-Path $dataArchive 'before-config.json') -Destination (Join-Path $previewHome 'config.json') -Force
    }
    if ($homeMoved) { Move-Checked (Join-Path $dataArchive 'legacy-home') $formalHome $dataArchive $formalHome }
    if ($oldMoved) { Move-Checked (Join-Path $archive 'legacy-installation') $installation $archive $installation }
    if (-not (Test-Path -LiteralPath $preview) -and (Test-Path -LiteralPath (Join-Path $archive 'previous-installation'))) { Move-Checked (Join-Path $archive 'previous-installation') $preview $archive $preview }
    if ($stopped) { & (Join-Path $preview 'CodexLAN-React.ps1') -Action Start }
    Write-Json (Join-Path $archive 'result.json') @{ Status = 'failed'; Error = $failure.Exception.Message }
    throw $failure
} finally { $null = Stop-Transcript }
