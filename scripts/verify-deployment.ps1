[CmdletBinding()]
param([string]$InstallationRoot = (Join-Path $env:LOCALAPPDATA 'Programs\CodexLAN'))
$ErrorActionPreference = 'Stop'
$deployment = Get-Content -LiteralPath (Join-Path $InstallationRoot 'deployment.json') -Raw | ConvertFrom-Json
foreach ($file in @((Join-Path $InstallationRoot 'CodexLAN.ps1'), (Join-Path $deployment.SourceCheckout 'scripts\prepare-deployment.ps1'))) {
    $tokens = $null
    $parseErrors = $null
    $null = [System.Management.Automation.Language.Parser]::ParseFile($file, [ref]$tokens, [ref]$parseErrors)
    if ($parseErrors.Count) { throw ($parseErrors | Out-String) }
}
$testRoot = Join-Path $env:TEMP ('codexlan-deployment-smoke-' + [guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory -Path $testRoot, (Join-Path $testRoot 'workspace')
Copy-Item -LiteralPath (Join-Path $InstallationRoot 'CodexLAN.ps1') -Destination $testRoot
$testDeployment = @{ Home = $testRoot; Release = $deployment.Release; LegacyDeploymentRetired = $true }
function Write-Json([string]$Path, $Value) {
    [System.IO.File]::WriteAllText($Path, ($Value | ConvertTo-Json -Depth 20), (New-Object System.Text.UTF8Encoding($false)))
}
Write-Json (Join-Path $testRoot 'deployment.json') $testDeployment
# Controller resolves its own pinned runtime; copy just node.exe for this isolated test.
$null = New-Item -ItemType Directory -Path (Join-Path $testRoot 'runtime')
Copy-Item -LiteralPath (Join-Path $InstallationRoot 'runtime\node.exe') -Destination (Join-Path $testRoot 'runtime')
$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, 0)
$listener.Start()
$port = $listener.LocalEndpoint.Port
$listener.Stop()
Write-Json (Join-Path $testRoot 'config.json') @{
    host = '127.0.0.1'; port = $port; workspaceRoot = (Join-Path $testRoot 'workspace')
    dataRoot = (Join-Path $testRoot 'data'); logRoot = (Join-Path $testRoot 'logs'); attachmentRoot = (Join-Path $testRoot 'attachments')
}
$launcher = Join-Path $testRoot 'CodexLAN.ps1'
$oldTestServer = $env:CODEX_TEST_APP_SERVER
$oldNodeEnv = $env:NODE_ENV
$oldManaged = $env:CODEXLAN_MANAGED_PROCESS
try {
    $env:NODE_ENV = 'test'
    $env:CODEX_TEST_APP_SERVER = Join-Path $deployment.SourceCheckout 'test\fixtures\fake-app-server.mjs'
    $env:CODEXLAN_MANAGED_PROCESS = $null
    & $launcher -Action Start
    & $launcher -Action Status
    $health = Invoke-RestMethod -Uri ('http://127.0.0.1:' + $port + '/api/health')
    if (-not $health) { throw 'No health response.' }
    & $launcher -Action Restart
    & $launcher -Action Stop
    if (-not (Test-Path -LiteralPath (Join-Path $testRoot 'logs\codexlan.log'))) { throw 'External log file missing.' }
    if (Test-Path -LiteralPath (Join-Path $deployment.Release 'logs')) { throw 'Release contains runtime logs.' }
    Write-Output ('Isolated launcher start/status/restart/stop and health passed: ' + $testRoot)
} finally {
    try { & $launcher -Action Stop } finally {
        $env:CODEX_TEST_APP_SERVER = $oldTestServer
        $env:NODE_ENV = $oldNodeEnv
        $env:CODEXLAN_MANAGED_PROCESS = $oldManaged
    }
}
