# One double-click after the week of 10-18 Oct 2026 (PC asleep 3.5 days, devices signed out):
#   1. new app: sessions last 30 days without the server instead of 3; the sign-in page says
#      how many changes are kept on the device
#   2. automations: the new version (already copied) repairs its damaged state file by itself;
#      the week's repeated error is archived so the health warning clears
#   3. alerts: Windows notifications for the alerts of your phone and Mac (ntfy), with a test
#   4. health check
. "$PSScriptRoot\_common.ps1"
Assert-Admin $PSCommandPath
Start-Log 'fix-after-outage'
Step '1/4 New app version'
& (Join-Path $PSScriptRoot 'deploy-app.ps1') -NoPause
Step '2/4 Automations'
$err = Join-Path $State 'automations\errors.log'
if (Test-Path $err) { Move-Item $err (Join-Path $State ('automations\errors-until-' + (Get-Date -Format 'yyyy-MM-dd') + '.log')) -Force; Ok 'old error log archived' }
Stop-Automations; Start-Automations
Start-Sleep 75
$log = Get-Content (Join-Path $Logs 'automations.log') -Tail 400 -ErrorAction SilentlyContinue
$log | Where-Object { $_ -match 'damaged|restarted from|Starting poller' } | Select-Object -Last 4 | ForEach-Object { "   $_" }
if (Test-Path $err) { Warn 'new automation errors:'; Get-Content $err -Tail 5 | ForEach-Object { "      $_" } } else { Ok 'automations run without error' }
Step '3/4 Alerts from the phone and the Mac'
& (Join-Path $PSScriptRoot 'install-alerts.ps1') -NoPause
Step '4/4 Health check'
Invoke-HealthCheck -Show
Stop-Log
