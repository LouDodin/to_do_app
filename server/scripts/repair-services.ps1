# Re-creates everything that keeps the server running by itself, exactly as it should be.
# Safe to run any number of times. Used after a problem, after moving to a new PC, and by MORNING.bat.
#   - scheduled tasks: Vikunja, Tasks app, Vikunja backup (03:00), Tasks health check (hourly), (Tasks weekly safeguard: only checked),
#     Tasks notifier (Windows notification for you, at log-on and hourly)
#   - Tailscale: stays connected when nobody is logged in; Funnel on 443 (Vikunja) and 8443 (app)
#   - power: never sleep / hibernate on mains power, lid closed does nothing on mains power
param([switch]$NoPause, [switch]$NoRestart)
. "$PSScriptRoot\_common.ps1"
Assert-Admin $PSCommandPath ($(if ($NoPause) { '-NoPause' }) + $(if ($NoRestart) { ' -NoRestart' }))
Start-Log 'repair-services'

Step 'Python (runs the app server, backups and health checks)'
$py = Find-Python
if (-not $py) { Fail 'Python 3 not found. Install it from python.org (tick "Add to PATH"), then run this again.'; Stop-Log -NoPause:$NoPause; exit 1 }
Set-Content -Path (Join-Path $State 'python-path.txt') -Value $py -Encoding ascii
Ok $py

Step 'Server settings'
$next = Join-Path $Vk 'run-vikunja.cmd.next'
if (Test-Path $next) {
  Copy-Item (Join-Path $Vk 'run-vikunja.cmd') (Join-Path $Vk ("run-vikunja.cmd.before-{0}" -f (Get-Date -Format 'yyyyMMdd-HHmm'))) -ErrorAction SilentlyContinue
  Move-Item $next (Join-Path $Vk 'run-vikunja.cmd') -Force
  Ok 'new run-vikunja.cmd installed (previous one kept next to it)'
} else { Ok 'run-vikunja.cmd unchanged' }
# A starter kit (new server for someone else) arrives without a secret: make a random one, once.
$cmdFile = Join-Path $Vk 'run-vikunja.cmd'
if ((Get-Content $cmdFile -Raw) -match 'CHANGE_ME_SECRET') {
  $bytes = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $secret = -join ($bytes | ForEach-Object { $_.ToString('x2') })
  (Get-Content $cmdFile) -replace 'CHANGE_ME_SECRET', $secret | Set-Content $cmdFile -Encoding ascii
  Ok 'new server secret generated'
}

Step 'Tailscale'
if (-not (Test-Path $Ts)) { Fail 'Tailscale is not installed.' } else {
  & $Ts set --unattended=true 2>&1 | Out-Null
  # Security fixes for Tailscale install themselves.
  & $Ts set --auto-update=true 2>&1 | Out-Null
  $name = Get-TsName
  if ($name) {
    "https://$name/" | Set-Content -Encoding ascii (Join-Path $Vk 'publicurl.txt')
    Ok "this PC is $name"
  } else { Warn 'Tailscale is not connected: open it and sign in, then run this again.' }
}

Step 'Scheduled tasks'
Register-SystemTask 'Vikunja' 'cmd.exe' "/c `"$Vk\run-vikunja.cmd`"" $Vk { New-ScheduledTaskTrigger -AtStartup } -LongRunning
Ok 'Vikunja (at start-up, restarts if it stops)'
Register-SystemTask 'Tasks app' $py "-I `"$Tools\serve_app.py`"" $Root { New-ScheduledTaskTrigger -AtStartup } -LongRunning
Ok 'Tasks app (at start-up, restarts if it stops)'
Register-SystemTask 'Vikunja backup' $py "-I `"$Tools\backup.py`"" $Root { New-ScheduledTaskTrigger -Daily -At 3am }
Ok 'Vikunja backup (every day at 03:00, or at the next start-up if missed)'
Register-SystemTask 'Tasks health check' $py "-I `"$Tools\healthcheck.py`" --quiet" $Root {
  @((New-ScheduledTaskTrigger -AtStartup), (New-ScheduledTaskTrigger -Once -At (Get-Date).Date.AddMinutes(7) -RepetitionInterval (New-TimeSpan -Hours 1)))
}
Ok 'Tasks health check (every hour)'
if ((Test-Path (Join-Path $State 'offsite-target.txt')) -and -not (Get-ScheduledTask -TaskName 'Tasks weekly safeguard' -ErrorAction SilentlyContinue)) { Warn 'Tasks weekly safeguard is missing: run install-weekly-safeguard.bat (it runs as you, so it is not re-created here)' }
if ((Test-Path (Join-Path $Root 'requests')) -and -not (Get-ScheduledTask -TaskName 'Tasks auto-update' -ErrorAction SilentlyContinue)) { Warn 'Tasks auto-update is missing: run install-auto-update.bat (Claude cannot apply updates without it)' }

# GTD automations (moved from the Mac on 10 Oct 2026): only on a PC that has them.
if (Test-Path (Join-Path $Auto 'run_poller.py')) {
  Register-SystemTask 'Tasks automations' $py "-X utf8 -I `"$Auto\run_poller.py`"" $Auto { New-ScheduledTaskTrigger -AtStartup } -LongRunning
  if (Test-Path $AutoEnabled) { Ok 'Tasks automations (at start-up, restarts if it stops)' }
  else { Disable-ScheduledTask -TaskName 'Tasks automations' | Out-Null; Ok 'Tasks automations (installed, off until start-automations.bat)' }
}

# The notifier runs as you (a notification can only be shown in your session), hidden.
$user = "$env:USERDOMAIN\$env:USERNAME"
$owner = (Get-CimInstance Win32_ComputerSystem).UserName
if ($owner) { $user = $owner }
Unregister-ScheduledTask -TaskName 'Tasks notifier' -Confirm:$false -ErrorAction SilentlyContinue
$act = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "`"$Tools\hidden.vbs`" `"$Tools\notify.ps1`"" -WorkingDirectory $Root
$trg = @((New-ScheduledTaskTrigger -AtLogOn -User $user), (New-ScheduledTaskTrigger -Once -At (Get-Date).Date.AddMinutes(12) -RepetitionInterval (New-TimeSpan -Hours 1)))
$set = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew
$set.ExecutionTimeLimit = 'PT5M'
$pri = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName 'Tasks notifier' -Action $act -Trigger $trg -Settings $set -Principal $pri | Out-Null
Ok "Tasks notifier (as $user, at log-on and hourly)"
if (Test-Path (Join-Path $State 'ntfy-topic.txt')) { Register-AlertsListener; Ok 'Tasks alerts (alerts from the phone and the Mac, as Windows notifications)' }

Step 'Power'
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
# Lid closed on mains power: do nothing (22 Oct 2026: the PC is left closed and managed from the Mac).
powercfg /setacvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 0
powercfg /setactive SCHEME_CURRENT
Ok 'never sleeps / hibernates on mains power, even with the lid closed'

if (-not $NoRestart) {
  Step 'Restarting the server with these settings'
  Stop-Server
  $up = Start-Server
  Step 'Public addresses (Tailscale Funnel)'
  Enable-Funnel
}

Step 'Health check'
Invoke-HealthCheck
Stop-Log -NoPause:$NoPause
