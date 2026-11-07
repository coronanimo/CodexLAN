[CmdletBinding()]
param([string]$OutputDirectory = (Join-Path $PSScriptRoot '..\dist\releases'))
$ErrorActionPreference = 'Stop'
$repository = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$version = (Get-Content -LiteralPath (Join-Path $repository 'package.json') -Raw | ConvertFrom-Json).version
$release = [System.IO.Path]::GetFullPath((Join-Path $OutputDirectory ($version + '-react-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))))
if (Test-Path -LiteralPath $release) { throw "Release directory already exists: $release" }
Push-Location -LiteralPath $repository
try {
    $null = New-Item -ItemType Directory -Path $release
    & node (Join-Path $repository 'node_modules\vite\bin\vite.js') build --config (Join-Path $repository 'web\vite.config.ts') --outDir (Join-Path $release 'dist\web')
    if ($LASTEXITCODE -ne 0) { throw 'React build failed.' }
    foreach ($folder in @('server', 'shared', 'products')) {
        Copy-Item -LiteralPath (Join-Path $repository $folder) -Destination $release -Recurse
    }
    $null = New-Item -ItemType Directory -Path (Join-Path $release 'config')
    Copy-Item -LiteralPath (Join-Path $repository 'config\codexlan.schema.json') -Destination (Join-Path $release 'config')
    foreach ($file in @('package.json', 'package-lock.json', 'LICENSE')) {
        Copy-Item -LiteralPath (Join-Path $repository $file) -Destination $release
    }
    Copy-Item -LiteralPath (Join-Path $repository 'docs\THIRD_PARTY_NOTICES.md') -Destination $release
    Push-Location -LiteralPath $release
    try {
        & npm ci --ignore-scripts --omit=dev --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { throw 'Runtime dependency install failed.' }
    } finally { Pop-Location }
} finally { Pop-Location }
Write-Output "Prepared complete React release: $release"
