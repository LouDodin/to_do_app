# Puts the previous version of the app back (the one kept in app-previous by deploy-app).
param([switch]$NoPause)
. "$PSScriptRoot\_common.ps1"
Assert-Admin $PSCommandPath $(if ($NoPause) { '-NoPause' })
Start-Log 'rollback-app'
$app = Join-Path $Root 'app'; $prev = Join-Path $Root 'app-previous'
if (-not (Test-Path (Join-Path $prev 'index.html'))) { Fail 'no previous version kept'; Stop-Log -NoPause:$NoPause; exit 1 }
Step 'Switching back'
Stop-ScheduledTask -TaskName 'Tasks app' -ErrorAction SilentlyContinue
Get-CimInstance Win32_Process -Filter "Name='python.exe'" | Where-Object { $_.CommandLine -like '*serve_app.py*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep 1
$tmp = Join-Path $Root 'app-rolledback'
if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
Rename-Item $app 'app-rolledback'
Rename-Item $prev 'app'
Rename-Item $tmp 'app-previous'
Start-ScheduledTask -TaskName 'Tasks app'
if (Test-Url 'http://127.0.0.1:5173/') { Ok 'previous version is live (run rollback-app again to undo this)' } else { Fail 'not answering: run restart-server.bat' }
Stop-Log -NoPause:$NoPause
