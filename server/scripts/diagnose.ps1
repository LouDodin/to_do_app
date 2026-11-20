# READ-ONLY. Collects what Windows says about the server's scheduled tasks and processes,
# into logs\diagnose-<date>.txt, for Claude to read. Changes nothing.
. "$PSScriptRoot\_common.ps1"
Assert-Admin $PSCommandPath
Start-Log 'diagnose'
foreach ($n in 'Vikunja', 'Tasks app') {
  Step "Task $n"
  $t = Get-ScheduledTask -TaskName $n -ErrorAction SilentlyContinue
  if (-not $t) { Fail 'missing'; continue }
  $i = $t | Get-ScheduledTaskInfo
  "   State: $($t.State)   LastRun: $($i.LastRunTime)   LastResult: $($i.LastTaskResult) (0x{0:X})   Missed: $($i.NumberOfMissedRuns)" -f $i.LastTaskResult
  $t.Actions | ForEach-Object { "   Action: $($_.Execute) $($_.Arguments)   [in $($_.WorkingDirectory)]" }
  "   Settings: restart $($t.Settings.RestartCount) x $($t.Settings.RestartInterval), limit $($t.Settings.ExecutionTimeLimit), instances $($t.Settings.MultipleInstances)"
  "   Principal: $($t.Principal.UserId) $($t.Principal.LogonType) $($t.Principal.RunLevel)"
}
Step 'Processes'
Get-CimInstance Win32_Process | Where-Object { $_.Name -in 'vikunja.exe', 'cmd.exe', 'python.exe', 'pythonw.exe' } |
  Select-Object ProcessId, ParentProcessId, Name, CreationDate, CommandLine | Format-List | Out-String -Width 300
Step 'Task Scheduler history (last 25 events for the two tasks)'
try {
  Get-WinEvent -LogName 'Microsoft-Windows-TaskScheduler/Operational' -MaxEvents 400 -ErrorAction Stop |
    Where-Object { $_.Message -match '\\Vikunja"|\\Tasks app"' } | Select-Object -First 25 TimeCreated, Id, Message |
    Format-List | Out-String -Width 300
} catch { Warn "history not available ($_)" }
Step 'Ports'
Get-NetTCPConnection -LocalPort 3456, 5173 -State Listen -ErrorAction SilentlyContinue | Select-Object LocalAddress, LocalPort, OwningProcess | Format-Table -AutoSize | Out-String
Stop-Log
