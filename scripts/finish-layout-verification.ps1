$ErrorActionPreference = 'Stop'
# Only processes created for this task's isolated UI preview are included.
$processes = Get-CimInstance -ClassName Win32_Process -Property Name,ProcessId,ParentProcessId,CommandLine
$rootIds = @()
foreach ($process in $processes) {
    if ($process.Name -eq 'node.exe' -and $process.CommandLine -match 'node(?:\.exe)?[" ]+scripts/preview-project-access\.mjs') { $rootIds += [int]$process.ProcessId }
    if ($process.Name -eq 'msedge.exe' -and $process.CommandLine -and $process.CommandLine.Contains('codexlan-ui-browser-')) { $rootIds += [int]$process.ProcessId }
}
$ownedIds = New-Object 'System.Collections.Generic.HashSet[int]'
foreach ($id in $rootIds) { $null = $ownedIds.Add($id) }
$changed = $true
while ($changed) {
    $changed = $false
    foreach ($process in $processes) {
        if ($ownedIds.Contains([int]$process.ParentProcessId) -and $ownedIds.Add([int]$process.ProcessId)) { $changed = $true }
    }
}
foreach ($processId in $ownedIds) { Stop-Process -Id $processId -ErrorAction SilentlyContinue }
Write-Output ('Stopped isolated UI preview processes: ' + $ownedIds.Count)

# The copied Meta0 runtime is obsolete after the explicit retirement decision.
$target = 'F:\QuantData\ops\Meta0\python-environment'
if (Test-Path -LiteralPath $target) {
    $resolved = (Resolve-Path -LiteralPath $target).ProviderPath
    if ($resolved -ne $target -or (Get-Item -LiteralPath $target -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Unexpected copied environment target.' }
    if (-not (Test-Path -LiteralPath 'F:\GPTData\hu\Meta0\.venv\pyvenv.cfg')) { throw 'The original environment was unexpectedly changed; inspect before cleanup.' }
    Add-Type -AssemblyName Microsoft.VisualBasic
    [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($resolved, [Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs, [Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin)
    Write-Output ('Recycled obsolete copied environment: ' + $resolved)
}
