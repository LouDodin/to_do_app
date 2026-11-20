# Stops and restarts Vikunja and the app, switches the public addresses (Funnel) back on,
# then runs a health check. The first thing to try when something does not work.
param([switch]$NoPause)
. "$PSScriptRoot\_common.ps1"
Assert-Admin $PSCommandPath $(if ($NoPause) { '-NoPause' })
Start-Log 'restart-server'
Step 'Stopping'
Stop-Server
Ok 'stopped'
Step 'Starting'
$up = Start-Server
Step 'Public addresses (Tailscale Funnel)'
Enable-Funnel
Step 'Health check'
Invoke-HealthCheck -Show:(-not $NoPause)
Stop-Log -NoPause:$NoPause
