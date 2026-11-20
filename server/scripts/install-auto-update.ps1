# Lets Claude update the server without you at the PC (22 Oct 2026): schedules "Tasks auto-update"
# (SYSTEM, every minute and at start-up), which runs scripts\auto-update.ps1. That script does
# nothing unless an update is waiting (app-next.zip, or a request in requests\). See docs\OPERATIONS.md.
# Run it again any time: it only replaces the scheduled task. To switch it off: uninstall-auto-update.bat.
param([switch]$NoPause)
. "$PSScriptRoot\_common.ps1"
Assert-Admin $PSCommandPath $(if ($NoPause) { '-NoPause' })
Start-Log 'install-auto-update'
Step 'Scheduled task'
New-Item -ItemType Directory -Force -Path (Join-Path $Root 'requests') | Out-Null
Register-SystemTask -Name 'Tasks auto-update' -Exe 'powershell.exe' `
  -Arguments "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$PSScriptRoot\auto-update.ps1`" -NoPause" `
  -WorkDir $Root -TriggerFactory { @((New-ScheduledTaskTrigger -AtStartup), (New-ScheduledTaskTrigger -Once -At (Get-Date).Date -RepetitionInterval (New-TimeSpan -Minutes 1))) }
if (Get-ScheduledTask -TaskName 'Tasks auto-update' -ErrorAction SilentlyContinue) { Ok 'Tasks auto-update: checks every minute for an update to apply' } else { Fail 'the scheduled task could not be created' }
Step 'First run'
Start-ScheduledTask -TaskName 'Tasks auto-update'
Start-Sleep 5
$last = Join-Path $State 'auto-update-last.txt'
if (Test-Path $last) { Ok ("last result: " + (Get-Content $last -Raw).Trim()) } else { Ok 'nothing waiting' }
Stop-Log -NoPause:$NoPause
