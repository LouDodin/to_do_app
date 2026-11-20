# Switches the GTD automations off on this PC (they stay installed). To run them on the Mac again,
# set the Mac back to role "all" (docs\AUTOMATIONS.md). start-automations.bat switches them on again.
. "$PSScriptRoot\_common.ps1"
Assert-Admin $PSCommandPath
Start-Log 'stop-automations'
Remove-Item $AutoEnabled -ErrorAction SilentlyContinue
Stop-Automations
Disable-ScheduledTask -TaskName 'Tasks automations' -ErrorAction SilentlyContinue | Out-Null
Ok 'automations stopped on this PC (installed, off)'
Stop-Log
