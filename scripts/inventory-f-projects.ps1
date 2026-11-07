$ErrorActionPreference = 'Stop'
$projectRoots = @('F:\GPTData\hu', 'F:\GPTData\li')
foreach ($parent in $projectRoots) {
    foreach ($project in (Get-ChildItem -LiteralPath $parent -Directory -Force)) {
        $entries = Get-ChildItem -LiteralPath $project.FullName -Force
        $summary = foreach ($entry in $entries) {
            if ($entry.PSIsContainer) { $entry.Name + '/' }
            else { $entry.Name + ' (' + $entry.Length + ')' }
        }
        Write-Output (ConvertTo-Json -Compress -InputObject @{ Project = $project.FullName; Entries = $summary })
    }
}
