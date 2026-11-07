param([switch]$Complete)
$ErrorActionPreference = 'Stop'
$installation = Join-Path $env:LOCALAPPDATA 'Programs\CodexLAN'
$productionPlan = Get-Content -LiteralPath (Join-Path $installation 'project-layout.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$id = [guid]::NewGuid().ToString('N')
$testRoot = Join-Path $env:TEMP ('codexlan-layout-switch-' + $id)
$sourceRoot = 'F:\GPTData\.layout-test-' + $id
$targetRoot = 'D:\Code\.layout-test-' + $id
$homeRoot = Join-Path $testRoot 'home'
$testInstall = Join-Path $testRoot 'install'
$migrationRoot = Join-Path $homeRoot ('migration-' + $id)
$sourceParent = Join-Path $sourceRoot 'hu'
$null = New-Item -ItemType Directory -Path $homeRoot, $testInstall, $migrationRoot, $sourceParent, $targetRoot, (Join-Path $testInstall 'runtime')
foreach ($file in @('CodexLAN.ps1', 'Switch-ProjectLayout.ps1')) { Copy-Item -LiteralPath (Join-Path $PSScriptRoot ('windows\' + $file)) -Destination $testInstall }
Copy-Item -LiteralPath (Join-Path $installation 'runtime\node.exe') -Destination (Join-Path $testInstall 'runtime')
$utf8 = New-Object System.Text.UTF8Encoding($false)
function Write-Json([string]$Path, $Value) { [IO.File]::WriteAllText($Path, ($Value | ConvertTo-Json -Depth 25), $utf8) }
$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, 0)
$listener.Start()
$port = $listener.LocalEndpoint.Port
$listener.Stop()
$testConfig = @{ dataRoot = (Join-Path $homeRoot 'data'); workspaceRoot = $sourceParent; host = '127.0.0.1'; port = $port; logRoot = (Join-Path $testRoot 'logs') }
Write-Json (Join-Path $homeRoot 'config.json') $testConfig
Write-Json (Join-Path $homeRoot 'cutover.json') @{ Phase = 'ready' }
Write-Json (Join-Path $testInstall 'deployment.json') @{ Home = $homeRoot; Release = $productionPlan.Release }
Write-Json (Join-Path $testInstall 'environment.json') @{}
$previousManaged = $env:CODEXLAN_MANAGED_PROCESS
$previousNodeEnv = $env:NODE_ENV
$previousFixture = $env:CODEX_TEST_APP_SERVER
$previousSeedCount = $env:CODEX_TEST_SEED_COUNT
$launcher = Join-Path $testInstall 'CodexLAN.ps1'
$switch = Join-Path $testInstall 'Switch-ProjectLayout.ps1'
$origin = 'http://127.0.0.1:' + $port
try {
    $env:CODEXLAN_MANAGED_PROCESS = $null
    $env:NODE_ENV = 'test'
    $env:CODEX_TEST_APP_SERVER = Join-Path $PSScriptRoot '..\test\fixtures\fake-app-server.mjs'
    $env:CODEX_TEST_SEED_COUNT = '0'
    & $launcher -Action Start
    $webSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    $setup = Invoke-RestMethod -Uri ($origin + '/api/auth/setup') -Method Post -WebSession $webSession -Headers @{ Origin = $origin } -ContentType 'application/json' -Body '{"username":"layoutqa","displayName":"Layout QA","password":"layout-qa-password-123"}'
    $projects = Invoke-RestMethod -Uri ($origin + '/api/projects') -WebSession $webSession
    $originalProject = $projects.projects[0]
    $targetProject = Join-Path $targetRoot 'Example'
    $retiredSource = Join-Path $sourceParent 'Retired'
    $retiredTarget = Join-Path $targetRoot 'Retired'
    $null = New-Item -ItemType Directory -Path $targetProject, $retiredSource, $retiredTarget
    [IO.File]::WriteAllText((Join-Path $originalProject.path 'example.txt'), 'source', $utf8)
    [IO.File]::WriteAllText((Join-Path $targetProject 'example.txt'), 'source', $utf8)
    $protectedData = Join-Path $sourceRoot 'protected-quant-data'
    $null = New-Item -ItemType Directory -Path $protectedData
    [IO.File]::WriteAllText((Join-Path $protectedData 'keep.txt'), 'protected', $utf8)
    $null = New-Item -ItemType Junction -Path (Join-Path $originalProject.path 'quant-link') -Target $protectedData
    $testPlan = @{ Home = $homeRoot; MigrationRoot = $migrationRoot; PreparedAt = (Get-Date).ToString('o'); Release = $productionPlan.Release; Entries = @(@{ Source = $originalProject.path; Target = $targetProject; Retired = $false }, @{ Source = $retiredSource; Target = $retiredTarget; Retired = $true }) }
    Write-Json (Join-Path $testInstall 'project-layout.json') $testPlan
    & $switch -Action Cutover
    if ((Get-Item -LiteralPath $originalProject.path -Force).LinkType -ne 'Junction') { throw 'Compatible old path was not created.' }
    if (Test-Path -LiteralPath $retiredSource) { throw 'A retired source incorrectly retained an alias.' }
    $migratedProjects = Invoke-RestMethod -Uri ($origin + '/api/projects') -WebSession $webSession
    if ($migratedProjects.projects[0].id -ne $originalProject.id -or $migratedProjects.projects[0].path -ne $targetProject) { throw 'Project ID/path or session continuity failed.' }
    if ($Complete) {
        & $switch -Action Complete
        if (-not (Test-Path -LiteralPath (Join-Path $protectedData 'keep.txt'))) { throw 'Cleanup touched protected linked data.' }
        if (-not (Test-Path -LiteralPath (Join-Path $targetProject 'example.txt'))) { throw 'Cleanup touched the active project.' }
        [IO.Directory]::Delete($originalProject.path)
        Write-Output 'Isolated cutover and completion passed; protected quant-data link target and active code were preserved.'
    } else {
        & $switch -Action Rollback
        if ((Get-Item -LiteralPath $originalProject.path -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Rollback did not restore the source directory.' }
        if (-not (Test-Path -LiteralPath $retiredSource)) { throw 'Rollback did not restore retired source.' }
        $restoredProjects = Invoke-RestMethod -Uri ($origin + '/api/projects') -WebSession $webSession
        if ($restoredProjects.projects[0].path -ne $originalProject.path) { throw 'Rollback did not restore project paths.' }
        [IO.Directory]::Delete((Join-Path $originalProject.path 'quant-link'))
        Write-Output 'Isolated Windows PowerShell 5.1 cutover and rollback passed, including stable sessions and retired-project alias removal.'
    }
} finally {
    try { & $launcher -Action Stop } finally {
        $env:CODEXLAN_MANAGED_PROCESS = $previousManaged
        $env:NODE_ENV = $previousNodeEnv
        $env:CODEX_TEST_APP_SERVER = $previousFixture
        $env:CODEX_TEST_SEED_COUNT = $previousSeedCount
    }
}
Add-Type -AssemblyName Microsoft.VisualBasic
$testBackup = Join-Path 'F:\GPTData\.layout-backups' (Split-Path -Leaf $migrationRoot)
foreach ($target in @($sourceRoot, $targetRoot, $testBackup, $testRoot)) {
    if (-not (Test-Path -LiteralPath $target)) { continue }
    $resolved = (Resolve-Path -LiteralPath $target).ProviderPath
    if ($resolved -ne $target -or -not $resolved.Contains($id)) { throw 'Unexpected test cleanup target.' }
    [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($resolved, [Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs, [Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin)
    Write-Output ('Recycled test directory: ' + $resolved)
}
