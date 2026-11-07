$ErrorActionPreference = 'Stop'
$installation = Join-Path $env:LOCALAPPDATA 'Programs\CodexLAN'
$targetScript = Join-Path $installation 'Restart-CodexLAN.ps1'
if (-not (Test-Path -LiteralPath (Join-Path $installation 'CodexLAN.ps1') -PathType Leaf)) { throw 'The deployed launcher is missing.' }
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'windows\Restart-CodexLAN.ps1') -Destination $targetScript
$desktop = [Environment]::GetFolderPath('Desktop')
$shortcutName = ([string][char]0x91CD) + [char]0x542F + ' CodexLAN.lnk'
$shortcutPath = Join-Path $desktop $shortcutName
$powerShellPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $powerShellPath
$shortcut.Arguments = '-NoLogo -NoProfile -ExecutionPolicy Bypass -File "' + $targetScript + '"'
$shortcut.WorkingDirectory = $installation
$shortcut.Description = 'Restart the deployed CodexLAN service and check backend readiness.'
$shortcut.IconLocation = $powerShellPath + ',0'
$shortcut.WindowStyle = 1
$shortcut.Save()
$saved = $shell.CreateShortcut($shortcutPath)
if ($saved.TargetPath -ne $powerShellPath -or -not $saved.Arguments.Contains($targetScript)) { throw 'Shortcut verification failed.' }
$tokens = $null
$parseErrors = $null
$null = [System.Management.Automation.Language.Parser]::ParseFile($targetScript, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count) { throw ($parseErrors | Out-String) }
Write-Output ('Created desktop shortcut: ' + $shortcutPath)
Write-Output ('Deployed restart entry: ' + $targetScript)
