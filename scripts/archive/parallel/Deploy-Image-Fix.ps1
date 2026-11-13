[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$installation = 'C:\Users\Shiwei\AppData\Local\Programs\CodexLAN-React'
$repository = 'D:\Code\CodexLAN'
$deployment = Get-Content -LiteralPath (Join-Path $installation 'parallel.json') -Raw | ConvertFrom-Json
$releaseScope = [System.IO.Path]::GetFullPath((Join-Path $installation 'releases')) + '\'
$previous = (Resolve-Path -LiteralPath $deployment.Release).Path
if (-not $previous.StartsWith($releaseScope, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected source release scope.' }
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$candidate = Join-Path $releaseScope ('0.8.0-react-images-' + $stamp)
if (Test-Path -LiteralPath $candidate) { throw 'Candidate already exists.' }
Copy-Item -LiteralPath $previous -Destination $candidate -Recurse
foreach ($relativeFile in @('server\agents\codex\protocol-values.mjs', 'server\agents\codex\content-references.mjs')) {
    Copy-Item -LiteralPath (Join-Path $repository $relativeFile) -Destination (Join-Path $candidate $relativeFile)
}
Copy-Item -LiteralPath (Join-Path $repository 'dist\web') -Destination (Join-Path $candidate 'dist') -Recurse -Force
$updater = Join-Path $installation 'Update-React.ps1'
& $updater -Release $candidate -Check
if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw 'Update preflight failed.' }
$taskName = 'CodexLAN React Images Update ' + $stamp
$shellPath = (Get-Command pwsh.exe).Source
$taskAction = New-ScheduledTaskAction -Execute $shellPath -Argument ('-NoProfile -NonInteractive -File "' + $updater + '" -Release "' + $candidate + '"') -WorkingDirectory $installation
$principal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
$null = Register-ScheduledTask -TaskName $taskName -Action $taskAction -Principal $principal -Settings $settings
Start-ScheduledTask -TaskName $taskName
Write-Output "Update task: $taskName"
Write-Output "Candidate: $candidate"
