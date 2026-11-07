$ErrorActionPreference = 'Stop'
$installationRoot = Join-Path $env:LOCALAPPDATA 'Programs\CodexLAN'
$production = Get-Content -LiteralPath (Join-Path $installationRoot 'deployment.json') -Raw | ConvertFrom-Json
$testRoot = Join-Path $env:TEMP ('codexlan-normalize-test-' + [guid]::NewGuid().ToString('N'))
$oldData = Join-Path $testRoot 'data\cutover-20000101-000000'
$null = New-Item -ItemType Directory -Path $testRoot, $oldData, (Join-Path $testRoot 'backups'), (Join-Path $testRoot 'workspace'), (Join-Path $testRoot 'runtime')
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'windows\CodexLAN.ps1') -Destination $testRoot
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'windows\Normalize-Data.ps1') -Destination $testRoot
Copy-Item -LiteralPath (Join-Path $installationRoot 'runtime\node.exe') -Destination (Join-Path $testRoot 'runtime')
function Write-Json([string]$Path, $Value) {
    [IO.File]::WriteAllText($Path, ($Value | ConvertTo-Json -Depth 20), (New-Object System.Text.UTF8Encoding($false)))
}
$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, 0)
$listener.Start()
$port = $listener.LocalEndpoint.Port
$listener.Stop()
Write-Json (Join-Path $testRoot 'deployment.json') @{ Home = $testRoot; Release = $production.Release }
Write-Json (Join-Path $testRoot 'cutover.json') @{ Phase = 'ready'; Generation = $oldData }
Write-Json (Join-Path $testRoot 'config.json') @{ host = '127.0.0.1'; port = $port; workspaceRoot = (Join-Path $testRoot 'workspace'); dataRoot = $oldData; logRoot = (Join-Path $testRoot 'logs'); attachmentRoot = (Join-Path $testRoot 'attachments') }
$oldManaged = $env:CODEXLAN_MANAGED_PROCESS
$oldNodeEnv = $env:NODE_ENV
$oldTestServer = $env:CODEX_TEST_APP_SERVER
$launcher = Join-Path $testRoot 'CodexLAN.ps1'
try {
    $env:CODEXLAN_MANAGED_PROCESS = $null
    $env:NODE_ENV = 'test'
    $env:CODEX_TEST_APP_SERVER = Join-Path $production.SourceCheckout 'test\fixtures\fake-app-server.mjs'
    & $launcher -Action Start
    & (Join-Path $testRoot 'Normalize-Data.ps1')
    $config = Get-Content -LiteralPath (Join-Path $testRoot 'config.json') -Raw | ConvertFrom-Json
    if ($config.dataRoot -ne (Join-Path $testRoot 'data')) { throw 'Data root was not normalized.' }
    if (-not (Test-Path -LiteralPath (Join-Path $testRoot 'data\workspace-state.sqlite'))) { throw 'Database was not moved.' }
    if (Test-Path -LiteralPath $oldData) { throw 'Old directory was not recycled.' }
    $health = Invoke-RestMethod -Uri ('http://127.0.0.1:' + $port + '/api/health')
    if ($health.status -ne 'alive') { throw 'Normalized service is not healthy.' }
    Write-Output ('Normalization and health check passed in isolated directory: ' + $testRoot)
} finally {
    try { & $launcher -Action Stop } finally {
        $env:CODEXLAN_MANAGED_PROCESS = $oldManaged
        $env:NODE_ENV = $oldNodeEnv
        $env:CODEX_TEST_APP_SERVER = $oldTestServer
    }
}
