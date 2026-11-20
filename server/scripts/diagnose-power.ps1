# Why was the server PC unreachable? Lists, for the last 10 days, every sleep, wake-up,
# restart and shutdown Windows recorded, with the reason, plus the power settings.
# Read-only. The result is in logs\diagnose-power-<date>.txt (give it to Claude).
. "$PSScriptRoot\_common.ps1"
Start-Log 'diagnose-power'
$since = (Get-Date).AddDays(-10)
Step 'Power settings'
$bat = Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue
Write-Host ("   battery: " + $(if ($bat) { "yes (laptop), charge $($bat.EstimatedChargeRemaining)%, status $($bat.BatteryStatus)" } else { 'no (desktop)' }))
foreach ($q in @(@('SUB_SLEEP','STANDBYIDLE','sleep after'), @('SUB_SLEEP','HIBERNATEIDLE','hibernate after'), @('SUB_SLEEP','HYBRIDSLEEP','hybrid sleep'), @('SUB_SLEEP','RTCWAKE','wake timers'), @('SUB_BUTTONS','LIDACTION','lid closed'), @('SUB_BUTTONS','PBUTTONACTION','power button'))) {
  $out = powercfg /query SCHEME_CURRENT $q[0] $q[1] 2>$null
  $vals = @($out | Where-Object { $_ -match '0x[0-9a-f]{8}' } | ForEach-Object { [Convert]::ToInt32(($_ -split '0x')[-1].Trim(), 16) })
  if ($vals.Count -ge 2) { Write-Host ("   {0}: plugged in {1}, on battery {2}" -f $q[2], $vals[-2], $vals[-1]) }
}
Write-Host '   (sleep / hibernate in seconds, 0 = never; lid / button: 0 nothing, 1 sleep, 2 hibernate, 3 shut down)'
foreach ($q in @(@('SUB_BUTTONS','LIDACTION','lid closed'), @('SUB_BUTTONS','PBUTTONACTION','power button'), @('SUB_BUTTONS','SBUTTONACTION','sleep button'), @('SUB_BATTERY','BATACTIONCRIT','critical battery action'), @('SUB_BATTERY','BATLEVELCRIT','critical battery level %'), @('SUB_BATTERY','BATACTIONLOW','low battery action'), @('SUB_BATTERY','BATLEVELLOW','low battery level %'))) {
  $out = powercfg /query SCHEME_CURRENT $q[0] $q[1] 2>&1
  $vals = @($out | Where-Object { "$_" -match '0x[0-9a-fA-F]{8}' } | ForEach-Object { [Convert]::ToInt32(("$_" -split '0x')[-1].Trim(), 16) })
  if ($vals.Count -ge 2) { Write-Host ("   {0}: plugged in {1}, on battery {2}" -f $q[2], $vals[-2], $vals[-1]) } else { Write-Host ("   {0}: (not available)" -f $q[2]) }
}
$ac = (Get-CimInstance -Namespace root/wmi -ClassName BatteryStatus -ErrorAction SilentlyContinue | Select-Object -First 1)
if ($ac) { Write-Host ("   right now: charger {0}, charging {1}" -f $(if ($ac.PowerOnline) { 'connected' } else { 'NOT connected' }), $ac.Charging) }
Step 'Battery report (when the PC ran on battery, slept or was active, over the last days)'
$rep = Join-Path $Logs ('battery-report-' + (Get-Date -Format 'yyyy-MM-dd_HHmm') + '.html')
powercfg /batteryreport /output $rep 2>&1 | Out-Null
if (Test-Path $rep) { Ok "saved: $rep" } else { Warn 'battery report not available' }
powercfg /a 2>&1 | ForEach-Object { "   $_" }
Step 'What can wake the PC'
powercfg /lastwake 2>&1 | ForEach-Object { "   $_" }
Step ('Sleeps, wake-ups, restarts and shutdowns since ' + $since.ToString('dd MMM'))
$ids = @{ 42 = 'goes to sleep'; 107 = 'wakes up'; 41 = 'restarted WITHOUT a clean shutdown (crash or power cut)'; 6008 = 'previous shutdown was unexpected'; 1074 = 'restart / shutdown asked by'; 12 = 'Windows started'; 13 = 'Windows shut down'; 1 = 'woke up' ; 506 = 'enters Modern Standby'; 507 = 'leaves Modern Standby' }
$ev = Get-WinEvent -FilterHashtable @{ LogName = 'System'; StartTime = $since; Id = @($ids.Keys) } -ErrorAction SilentlyContinue |
  Where-Object { $_.ProviderName -match 'Kernel-Power|Kernel-General|EventLog|User32|Power-Troubleshooter' } | Sort-Object TimeCreated
foreach ($e in $ev) {
  $what = $ids[$e.Id]
  $extra = ''
  if ($e.Id -eq 42) { $r = ([xml]$e.ToXml()).Event.EventData.Data | Where-Object { $_.Name -eq 'Reason' } | Select-Object -ExpandProperty '#text' -ErrorAction SilentlyContinue; $extra = " (reason code $r)" }
  if ($e.Id -eq 42) { $extra += ': ' + (@(($e.Message -split "`n") | Where-Object { $_ -match '\S' } | Select-Object -Skip 1 -First 2) -join ' ').Trim() }
  if ($e.Id -eq 1074 -or $e.Id -eq 1) { $extra = ': ' + (($e.Message -split "`n")[0..2] -join ' ').Trim() }
  Write-Host ("   {0:ddd dd MMM HH:mm}  {1}{2}" -f $e.TimeCreated, $what, $extra)
}
if (-not $ev) { Warn 'no event found (the log may need admin rights: run this again with right-click > Run as administrator)' }
Step 'Windows Update restarts'
Get-WinEvent -FilterHashtable @{ LogName = 'System'; StartTime = $since; ProviderName = 'Microsoft-Windows-WindowsUpdateClient'; Id = 19, 20, 43 } -ErrorAction SilentlyContinue |
  Sort-Object TimeCreated | Select-Object -Last 15 | ForEach-Object { "   {0:ddd dd MMM HH:mm}  {1}" -f $_.TimeCreated, (($_.Message -split "`n")[0]).Trim() }
Stop-Log
