$ErrorActionPreference = 'Stop'
$installation = Join-Path $env:LOCALAPPDATA 'Programs\CodexLAN'
$plan = Get-Content -LiteralPath (Join-Path $installation 'project-layout.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$null = New-Item -ItemType Directory -Path (Join-Path $plan.Release 'scripts') -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'migrate-project-layout.mjs') -Destination (Join-Path $plan.Release 'scripts\migrate-project-layout.mjs')
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'windows\Switch-ProjectLayout.ps1') -Destination (Join-Path $installation 'Switch-ProjectLayout.ps1')
$repository = Split-Path -Parent $PSScriptRoot
foreach ($relative in @('server\workspace-store.mjs', 'server\projects.mjs', 'server\conversations.mjs', 'server\agents\codex\history-reader.mjs', 'public\app.js', 'public\index.html', 'public\dialogs.css', 'config\codexlan.schema.json')) {
    $destination = Join-Path $plan.Release $relative
    $null = New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force
    Copy-Item -LiteralPath (Join-Path $repository $relative) -Destination $destination
}
Copy-Item -LiteralPath (Join-Path $repository 'docs\PROJECT-LAYOUT-MIGRATION.md') -Destination (Join-Path $installation 'PROJECT-LAYOUT.md')
