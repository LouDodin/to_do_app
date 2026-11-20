# Installs a new version of the app: app-next.zip (or the app-next folder) becomes the live app.
# The current version is kept in app-previous (rollback-app.bat puts it back).
# If the new version does not answer, the previous one is restored automatically.
param([switch]$NoPause)
. "$PSScriptRoot\_common.ps1"
Assert-Admin $PSCommandPath $(if ($NoPause) { '-NoPause' })
Start-Log 'deploy-app'
$app = Join-Path $Root 'app'
$next = Join-Path $Root 'app-next'
$prev = Join-Path $Root 'app-previous'
$zip = Join-Path $Root 'app-next.zip'

Step 'New version'
if (Test-Path $zip) {
  if (Test-Path $next) { Remove-Item $next -Recurse -Force }
  Expand-Archive $zip -DestinationPath $next -Force
  Ok "unpacked $zip"
}
if (-not (Test-Path (Join-Path $next 'index.html'))) { Fail 'no new version found (app-next.zip or app-next\index.html)'; Stop-Log -NoPause:$NoPause; exit 1 }
$ver = Get-Content (Join-Path $next 'version.txt') -ErrorAction SilentlyContinue
Ok "version: $ver"

Step 'Switching'
Stop-ScheduledTask -TaskName 'Tasks app' -ErrorAction SilentlyContinue
Get-CimInstance Win32_Process -Filter "Name='python.exe'" | Where-Object { $_.CommandLine -like '*serve_app.py*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep 1
try {
  if (Test-Path $prev) { Remove-Item $prev -Recurse -Force -ErrorAction Stop }
  if (Test-Path $app) { Rename-Item $app 'app-previous' -ErrorAction Stop }
  Rename-Item $next 'app' -ErrorAction Stop
} catch {
  Fail "could not switch folders ($_). Is a file of the app open (Explorer preview, antivirus)? Nothing was changed."
  if (-not (Test-Path $app) -and (Test-Path $prev)) { Rename-Item $prev 'app' -ErrorAction SilentlyContinue }
  Start-ScheduledTask -TaskName 'Tasks app'
  Stop-Log -NoPause:$NoPause
  exit 1
}
if (Test-Path $zip) { Remove-Item $zip -Force }
Start-ScheduledTask -TaskName 'Tasks app'
$live = try { (Invoke-WebRequest 'http://127.0.0.1:5173/version.txt' -UseBasicParsing -TimeoutSec 5).Content.Trim() } catch { '' }
if ((Test-Url 'http://127.0.0.1:5173/') -and (Test-Url 'http://127.0.0.1:5173/manifest.webmanifest') -and ((-not $ver) -or ($live -eq "$ver".Trim()))) {
  Ok 'the new version is live. Devices pick it up the next time the app is opened (a "Reload" button may appear).'
} else {
  Fail 'the new version does not answer: putting the previous one back'
  Stop-ScheduledTask -TaskName 'Tasks app' -ErrorAction SilentlyContinue
  Start-Sleep 1
  Rename-Item $app 'app-failed'
  Rename-Item $prev 'app'
  Start-ScheduledTask -TaskName 'Tasks app'
  if (Test-Url 'http://127.0.0.1:5173/') { Ok 'previous version restored' } else { Fail 'still not answering: run restart-server.bat' }
}

# The app's source code (kept on the PC so it can be changed or rebuilt later).
$srcZip = Join-Path $Root 'app-source-next.zip'
if (Test-Path $srcZip) {
  Step 'Source code'
  $src = Join-Path $Root 'app-source'
  $srcPrev = Join-Path $Root 'app-source-previous'
  if (Test-Path $srcPrev) { Remove-Item $srcPrev -Recurse -Force }
  if (Test-Path $src) { Rename-Item $src 'app-source-previous' }
  Expand-Archive $srcZip -DestinationPath $src -Force
  Remove-Item $srcZip -Force
  Ok 'app-source updated (previous kept in app-source-previous)'
}
Stop-Log -NoPause:$NoPause
