$ErrorActionPreference = 'Stop'
foreach ($parent in @('F:\GPTData\hu', 'F:\GPTData\li')) {
    foreach ($project in (Get-ChildItem -LiteralPath $parent -Directory)) {
        $target = Join-Path 'D:\Code' $project.Name
        $bytes = 0L
        $stack = New-Object 'System.Collections.Generic.Stack[string]'
        $stack.Push($project.FullName)
        while ($stack.Count) {
            foreach ($entry in (Get-ChildItem -LiteralPath $stack.Pop() -Force)) {
                if ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) { continue }
                if ($entry.PSIsContainer) {
                    if ($entry.Name -notin @('.venv', 'node_modules', '__pycache__', '.pytest_cache')) { $stack.Push($entry.FullName) }
                } else { $bytes += $entry.Length }
            }
        }
        Write-Output (ConvertTo-Json -Compress -InputObject @{ Source = $project.FullName; Target = $target; TargetExists = (Test-Path -LiteralPath $target); CopyMiB = [math]::Round($bytes / 1MB) })
    }
}
foreach ($task in (Get-ScheduledTask)) {
    foreach ($action in $task.Actions) {
        if (($action.Execute + ' ' + $action.Arguments + ' ' + $action.WorkingDirectory) -match 'F:[\\/]GPTData') {
            Write-Output (ConvertTo-Json -Compress -InputObject @{ Task = $task.TaskName; Execute = $action.Execute; Arguments = $action.Arguments; WorkingDirectory = $action.WorkingDirectory })
        }
    }
}
