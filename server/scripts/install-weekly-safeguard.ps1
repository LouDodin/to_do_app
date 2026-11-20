# Sets up the safeguard to your Mac through Tailscale (see weekly-safeguard.ps1): checks a Mac is in
# your Tailscale network, schedules "Tasks weekly safeguard" (every hour: a database copy once a day,
# the full server once a week, sent when the Mac is awake), and makes the first full copy now.
# Run it again any time: it only replaces the scheduled task and its setting.
param([switch]$NoPause)
. "$PSScriptRoot\_common.ps1"
Assert-Admin $PSCommandPath
Start-Log 'install-weekly-safeguard'

Step 'Finding your Mac in Tailscale'
try { $st = & $Ts status --json | ConvertFrom-Json } catch { $st = $null }
$macs = @($st.Peer.PSObject.Properties.Value | Where-Object { $_.OS -eq 'macOS' })
if (-not $macs) { Fail 'no Mac found in your Tailscale network: open Tailscale on the Mac and sign in, then run this again'; Stop-Log -NoPause:$NoPause; exit 1 }
$mac = $macs | Sort-Object { -not $_.Online } | Select-Object -First 1
$name = $mac.DNSName.Split('.')[0]
Ok ("{0} ({1})" -f $name, $(if ($mac.Online) { 'online' } else { 'asleep or offline now: copies will wait for it' }))
'mac' | Set-Content -Encoding ascii (Join-Path $State 'offsite-target.txt')

# Until 19 Oct 2026 the copies went to OneDrive: that setting is removed (the files there are yours to delete).
$old = Join-Path $State 'offsite-folder.txt'
if (Test-Path $old) { Remove-Item $old -Force; Ok 'OneDrive copies switched off' }

Step 'Scheduled task'
# Runs as you (Tailscale only lets its own user send files), even when you are not signed in.
$user = "$env:USERDOMAIN\$env:USERNAME"
$owner = (Get-CimInstance Win32_ComputerSystem -ErrorAction SilentlyContinue).UserName
if ($owner) { $user = $owner }
Unregister-ScheduledTask -TaskName 'Tasks weekly safeguard' -Confirm:$false -ErrorAction SilentlyContinue
$act = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$PSScriptRoot\weekly-safeguard.ps1`" -NoPause -Hourly" -WorkingDirectory $Root
$trg = @((New-ScheduledTaskTrigger -AtStartup), (New-ScheduledTaskTrigger -Once -At (Get-Date).Date.AddMinutes(22) -RepetitionInterval (New-TimeSpan -Hours 1)))
$set = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew
$set.ExecutionTimeLimit = 'PT30M'
$pri = New-ScheduledTaskPrincipal -UserId $user -LogonType S4U -RunLevel Highest
Register-ScheduledTask -TaskName 'Tasks weekly safeguard' -Action $act -Trigger $trg -Settings $set -Principal $pri | Out-Null
Ok "Tasks weekly safeguard (every hour, as $user)"

Step 'First full copy now (1 to 3 minutes)'
& powershell -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot\weekly-safeguard.ps1" -NoPause | Out-Null
$r = (Get-Content (Join-Path $State 'offsite-last.txt') -Raw).Trim().Split('|')
if ($r[1] -eq 'ok') { Ok $r[2] } else { Fail $r[2] }
Write-Host ''
Write-Host "   On the Mac, the files arrive in Downloads: tasks-server-<date>.zip, tasks-data-<date>.db."
Stop-Log -NoPause:$NoPause
