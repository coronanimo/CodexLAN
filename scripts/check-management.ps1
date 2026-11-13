$ErrorActionPreference = 'Stop'
foreach ($path in @('windows\CodexLAN.ps1', 'windows\Update-CodexLAN.ps1', 'windows\Run-CodexLANUpdate.ps1', 'update-installed.ps1', 'archive\Promote-Installation.ps1', 'build-release.ps1')) {
    $file = Join-Path $PSScriptRoot $path
    $tokens = $null
    $parseErrors = $null
    $null = [System.Management.Automation.Language.Parser]::ParseFile($file, [ref]$tokens, [ref]$parseErrors)
    if ($parseErrors.Count) { throw ($parseErrors | Out-String) }
    Write-Output "Parsed: $file"
}
