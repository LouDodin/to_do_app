# Runs every check now and opens the report (the same one the app shows in Settings > Server health).
param([switch]$NoPause)
. "$PSScriptRoot\_common.ps1"
Assert-Admin $PSCommandPath $(if ($NoPause) { '-NoPause' })
Start-Log 'health-check-now'
Step 'Health check'
Invoke-HealthCheck -Show:(-not $NoPause)
Stop-Log -NoPause:$NoPause
