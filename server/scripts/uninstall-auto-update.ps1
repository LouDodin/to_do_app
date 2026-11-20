# Switches off automatic updates: removes the scheduled task "Tasks auto-update". Updates then
# need deploy-app.bat (and the other scripts) again, run by you at the PC.
param([switch]$NoPause)
. "$PSScriptRoot\_common.ps1"
Assert-Admin $PSCommandPath $(if ($NoPause) { '-NoPause' })
Start-Log 'uninstall-auto-update'
Unregister-ScheduledTask -TaskName 'Tasks auto-update' -Confirm:$false -ErrorAction SilentlyContinue
if (Get-ScheduledTask -TaskName 'Tasks auto-update' -ErrorAction SilentlyContinue) { Fail 'still there' } else { Ok 'automatic updates are off' }
Stop-Log -NoPause:$NoPause
