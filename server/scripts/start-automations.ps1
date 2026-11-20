# Switches the GTD automations on, on this PC. Only once the Mac runs "folders only": two copies
# working on labels and dates at the same time would undo each other's changes.
. "$PSScriptRoot\_common.ps1"
Assert-Admin $PSCommandPath
Start-Log 'start-automations'
if (-not (Get-ScheduledTask -TaskName 'Tasks automations' -ErrorAction SilentlyContinue)) { Fail 'not installed: run install-automations.bat first'; Stop-Log; exit 1 }
Write-Host 'The Mac must already run "folders only" (its log says "role folders").'
$a = Read-Host 'Type YES if the Mac has been switched'
if ($a -ne 'YES') { Warn 'nothing changed'; Stop-Log; exit 0 }
$autoState = Join-Path $State 'automations'
$errors = Join-Path $autoState 'errors.log'
$errLines = if (Test-Path $errors) { (Get-Content $errors).Count } else { 0 }
$t0 = (Get-Date).ToUniversalTime()
Set-Content $AutoEnabled ("switched on " + (Get-Date -Format s)) -Encoding ascii
Enable-ScheduledTask -TaskName 'Tasks automations' | Out-Null
Start-Automations

Step 'Waiting for the first cycle (up to 3 min)'
$ok = $false
for ($i = 0; $i -lt 36; $i++) {
  Start-Sleep 5
  $hb = Join-Path $autoState 'heartbeat.txt'
  if (Test-Path $hb) {
    $beat = [datetime]::ParseExact((Get-Content $hb -Raw).Trim(), 'yyyy-MM-ddTHH:mm:ssZ', [Globalization.CultureInfo]::InvariantCulture, 'AssumeUniversal, AdjustToUniversal')
    if ($beat -ge $t0.AddSeconds(-1)) { $ok = $true; break }
  }
}
$new = if (Test-Path $errors) { Get-Content $errors | Select-Object -Skip $errLines } else { @() }
if ($ok -and -not $new) { Ok 'first cycle done, no problem' }
elseif ($ok) { Warn 'first cycle done, with problems:'; $new | ForEach-Object { "      $_" } }
else { Fail 'no cycle after 3 minutes: give logs\automations.log to Claude. To give them back to the Mac: stop-automations.bat' }
Step 'Last lines of logs\automations.log'
Get-Content (Join-Path $Logs 'automations.log') -Tail 12 -ErrorAction SilentlyContinue | ForEach-Object { "   $_" }
if ($ok) {
  Write-Host ''
  Write-Host '   The PC now runs the automations. The Mac keeps only the project folders and the weekly report.' -ForegroundColor Green
}
Step 'Health check'
Invoke-HealthCheck
Stop-Log
