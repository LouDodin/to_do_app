# Shared helpers for every script in this folder. Not meant to be run on its own.
# Every script: asks for admin rights if it needs them, logs everything to logs\<script>-<date>.txt,
# and waits for Enter at the end so you can read what happened.

$ErrorActionPreference = 'Continue'
$Root = Split-Path -Parent $PSScriptRoot          # ...\Documents\todo-server
$Vk = Join-Path $Root 'vikunja'
$Tools = Join-Path $Root 'tools'
$State = Join-Path $Root 'state'
$Logs = Join-Path $Root 'logs'
$Ts = 'C:\Program Files\Tailscale\tailscale.exe'
$Auto = Join-Path $Root 'automations'
$AutoEnabled = Join-Path $State 'automations\enabled.txt'   # the automations run on this PC
New-Item -ItemType Directory -Force -Path $State, $Logs | Out-Null

function Assert-Admin([string]$ScriptPath, [string]$ExtraArgs = '') {
  $me = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
  if (-not $me.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Start-Process powershell -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$ScriptPath`" $ExtraArgs"
    exit
  }
}

function Start-Log([string]$Name) {
  $script:LogFile = Join-Path $Logs ("{0}-{1}.txt" -f $Name, (Get-Date -Format 'yyyy-MM-dd_HHmm'))
  Start-Transcript -Path $script:LogFile -Force | Out-Null
}

function Stop-Log([switch]$NoPause) {
  Write-Host ''
  Write-Host "Log saved in $script:LogFile"
  Stop-Transcript | Out-Null
  if (-not $NoPause) { Read-Host 'Finished - press Enter to close' | Out-Null }
}

function Step([string]$Text) { Write-Host ''; Write-Host "== $Text" -ForegroundColor Cyan }
function Ok([string]$Text) { Write-Host "   OK  $Text" -ForegroundColor Green }
function Warn([string]$Text) { Write-Host "   !!  $Text" -ForegroundColor Yellow }
function Fail([string]$Text) { Write-Host "   XX  $Text" -ForegroundColor Red }

function Find-Python {
  foreach ($c in @(
      (Join-Path $env:LOCALAPPDATA 'Programs\Python\Python313\python.exe'),
      'C:\Users\loudo\AppData\Local\Programs\Python\Python313\python.exe',
      'C:\Program Files\Python313\python.exe')) {
    if ($c -and (Test-Path $c)) { return $c }
  }
  $saved = Join-Path $State 'python-path.txt'
  if (Test-Path $saved) { $p = (Get-Content $saved -Raw).Trim(); if (Test-Path $p) { return $p } }
  $cmd = Get-Command python.exe -ErrorAction SilentlyContinue | Where-Object { $_.Source -notlike '*WindowsApps*' } | Select-Object -First 1
  if ($cmd) { return $cmd.Source }
  return $null
}

function Get-TsName {
  try { return ((& $Ts status --json | ConvertFrom-Json).Self.DNSName).TrimEnd('.') } catch { return $null }
}

function Test-Url([string]$Url, [int]$Tries = 15) {
  for ($i = 0; $i -lt $Tries; $i++) {
    try { $r = Invoke-WebRequest $Url -UseBasicParsing -TimeoutSec 5; if ($r.StatusCode -lt 400) { return $true } } catch {}
    Start-Sleep 2
  }
  return $false
}

function Get-VikunjaVersion([string]$Base = 'http://127.0.0.1:3456') {
  try { return (Invoke-RestMethod "$Base/api/v1/info" -TimeoutSec 5).version } catch { return $null }
}

# A scheduled task that runs as SYSTEM: at start-up (long-running) or on a timer.
function Register-SystemTask([string]$Name, [string]$Exe, [string]$Arguments, [string]$WorkDir, [ScriptBlock]$TriggerFactory, [switch]$LongRunning) {
  Unregister-ScheduledTask -TaskName $Name -Confirm:$false -ErrorAction SilentlyContinue
  $action = New-ScheduledTaskAction -Execute $Exe -Argument $Arguments -WorkingDirectory $WorkDir
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew
  if ($LongRunning) {
    $settings.RestartCount = 999
    $settings.RestartInterval = 'PT1M'
    $settings.ExecutionTimeLimit = 'PT0S'
  } else {
    $settings.ExecutionTimeLimit = 'PT30M'
  }
  $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
  Register-ScheduledTask -TaskName $Name -Action $action -Trigger (& $TriggerFactory) -Settings $settings -Principal $principal | Out-Null
}

function Stop-Server {
  Stop-Automations
  foreach ($n in 'Vikunja', 'Tasks app') { Stop-ScheduledTask -TaskName $n -ErrorAction SilentlyContinue }
  Start-Sleep 1
  # The launcher (cmd.exe running run-vikunja.cmd) first: a launcher left from an older task
  # would otherwise start Vikunja again on its own, outside the scheduled task.
  Get-CimInstance Win32_Process -Filter "Name='cmd.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like '*run-vikunja.cmd*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Get-Process vikunja -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  Get-CimInstance Win32_Process -Filter "Name='python.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like '*serve_app.py*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Start-Sleep 2
}

# The GTD automations (automations\run_poller.py), stopped while the server is down so they do
# not log "server unreachable" errors.
function Stop-Automations {
  Stop-ScheduledTask -TaskName 'Tasks automations' -ErrorAction SilentlyContinue
  Get-CimInstance Win32_Process -Filter "Name='python.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like '*run_poller.py*' -or $_.CommandLine -like '*webhook_listener.py*' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

function Start-Automations {
  if (Test-Path $AutoEnabled) { Start-ScheduledTask -TaskName 'Tasks automations' -ErrorAction SilentlyContinue }
}

function Start-Server {
  $log = Join-Path $Vk 'vikunja.log'
  if ((Test-Path $log) -and ((Get-Item $log).Length -gt 50MB)) { Move-Item $log "$log.old" -Force }
  Start-ScheduledTask -TaskName 'Vikunja'
  Start-ScheduledTask -TaskName 'Tasks app'
  $a = Test-Url 'http://127.0.0.1:3456/api/v1/info'
  $b = Test-Url 'http://127.0.0.1:5173/'
  if ($a) { Ok "Vikunja answers (version $(Get-VikunjaVersion))" } else { Fail 'Vikunja does not answer - last lines of vikunja\vikunja.log:'; Get-Content $log -Tail 15 -ErrorAction SilentlyContinue }
  if ($b) { Ok 'App server answers' } else { Fail 'App server does not answer' }
  if ($a) { Start-Automations }
  return ($a -and $b)
}

# The alerts listener (tools\ntfy-listen.ps1): runs as you, because a notification can only be
# shown in your session. At log-on and every hour (it keeps running; the hourly start only
# brings it back if it stopped, a second copy exits at once).
function Register-AlertsListener {
  $user = "$env:USERDOMAIN\$env:USERNAME"
  $owner = (Get-CimInstance Win32_ComputerSystem -ErrorAction SilentlyContinue).UserName
  if ($owner) { $user = $owner }
  Unregister-ScheduledTask -TaskName 'Tasks alerts' -Confirm:$false -ErrorAction SilentlyContinue
  $act = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "`"$Tools\hidden.vbs`" `"$Tools\ntfy-listen.ps1`"" -WorkingDirectory $Root
  $trg = @((New-ScheduledTaskTrigger -AtLogOn -User $user), (New-ScheduledTaskTrigger -Once -At (Get-Date).Date.AddMinutes(17) -RepetitionInterval (New-TimeSpan -Hours 1)))
  $set = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew
  $set.ExecutionTimeLimit = 'PT5M'
  $pri = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
  Register-ScheduledTask -TaskName 'Tasks alerts' -Action $act -Trigger $trg -Settings $set -Principal $pri | Out-Null
  Start-ScheduledTask -TaskName 'Tasks alerts' -ErrorAction SilentlyContinue
}

function Enable-Funnel {
  & $Ts set --unattended=true 2>&1 | Out-Null
  & $Ts funnel --bg 3456 2>&1 | ForEach-Object { "   $_" }
  & $Ts funnel --bg --https=8443 http://127.0.0.1:5173 2>&1 | ForEach-Object { "   $_" }
}

function Invoke-Backup {
  $py = Find-Python
  if (-not $py) { Fail 'Python not found: no backup made'; return $false }
  $out = & $py -I (Join-Path $Tools 'backup.py') 2>&1
  Write-Host "   $out"
  return ($LASTEXITCODE -eq 0)
}

# Consistent copy of a SQLite database, including changes still in its -wal file
# (a plain file copy after the server was stopped could miss the latest changes).
function Copy-Database([string]$From, [string]$To) {
  $py = Find-Python
  & $py -I -c "import sqlite3,sys; s=sqlite3.connect(sys.argv[1]); d=sqlite3.connect(sys.argv[2]); s.backup(d); d.close(); s.close()" $From $To
  return ($LASTEXITCODE -eq 0 -and (Test-Path $To))
}

function Invoke-HealthCheck([switch]$Show) {
  $py = Find-Python
  if (-not $py) { Fail 'Python not found'; return }
  & $py -I (Join-Path $Tools 'healthcheck.py') 2>&1 | ForEach-Object { "   $_" }
  if ($Show) { Start-Process (Join-Path $State 'health-report.html') }
}

# Packs everything needed to rebuild the server into OutDir\todo-server-export-<date>.zip, from the
# latest backup in backups\ (make one first). Used by export-for-new-pc and the weekly safeguard.
function New-ExportZip([string]$OutDir) {
  $latest = Get-ChildItem (Join-Path $Root 'backups') -Filter 'vikunja-*.db' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  $stage = Join-Path $env:TEMP ("todo-export-" + (Get-Date -Format 'yyyyMMddHHmmss'))
  $dst = Join-Path $stage 'todo-server'
  New-Item -ItemType Directory -Force $dst | Out-Null
  foreach ($d in 'app', 'app-source', 'tools', 'scripts', 'docs', 'automations') { if (Test-Path (Join-Path $Root $d)) { Copy-Item (Join-Path $Root $d) $dst -Recurse } }
  Get-ChildItem $Root -File | Where-Object { $_.Extension -in '.bat', '.md' } | Copy-Item -Destination $dst
  New-Item -ItemType Directory -Force (Join-Path $dst 'vikunja\db'), (Join-Path $dst 'vikunja\files'), (Join-Path $dst 'state'), (Join-Path $dst 'backups') | Out-Null
  Copy-Item (Join-Path $Vk 'vikunja.exe'), (Join-Path $Vk 'run-vikunja.cmd') (Join-Path $dst 'vikunja')
  if (Test-Path (Join-Path $Vk 'files')) { Copy-Item (Join-Path $Vk 'files\*') (Join-Path $dst 'vikunja\files') -Recurse -ErrorAction SilentlyContinue }
  Copy-Item $latest.FullName (Join-Path $dst 'vikunja\db\vikunja.db')
  Copy-Item $latest.FullName (Join-Path $dst 'backups')
  foreach ($f in 'api-token.txt', 'ntfy-topic.txt') { if (Test-Path (Join-Path $State $f)) { Copy-Item (Join-Path $State $f) (Join-Path $dst 'state') } }
  if (Test-Path (Join-Path $State 'automation-token.txt')) { Copy-Item (Join-Path $State 'automation-token.txt') (Join-Path $dst 'state') }
  # The automations' memory, without the "switched on" mark: on the new PC they start only with start-automations.bat
  if (Test-Path (Join-Path $State 'automations')) {
    New-Item -ItemType Directory -Force (Join-Path $dst 'state\automations') | Out-Null
    Get-ChildItem (Join-Path $State 'automations') -File | Where-Object { $_.Name -notin 'enabled.txt', 'poller.lock' } | Copy-Item -Destination (Join-Path $dst 'state\automations')
  }
  $zip = Join-Path $OutDir ("todo-server-export-{0}.zip" -f (Get-Date -Format 'yyyy-MM-dd'))
  if (Test-Path $zip) { Remove-Item $zip -Force }
  Compress-Archive -Path $dst -DestinationPath $zip
  Remove-Item $stage -Recurse -Force
  return $zip
}

# The two guides (docs\Tasks-user-guide.pdf, docs\Tasks-admin-guide.pdf) reach the Mac by
# themselves whenever they change (26 Oct 2026): a dated copy, YYMMDD_<name>.pdf, goes to the
# safeguard outbox (sent to the Mac's Downloads by "Tasks weekly safeguard") and to
# docs\guides-archive\. Dated names, so an older copy is never replaced; nothing is ever deleted.
# Returns how many were queued. Cheap when nothing changed (only the file time is read).
function Add-GuidesToOutbox {
  $docs = Join-Path $Root 'docs'
  $outbox = Join-Path $State 'offsite-outbox'
  $archive = Join-Path $docs 'guides-archive'
  $record = Join-Path $State 'guides-sent.txt'   # name|last write (ticks)|sha256
  $known = @{}
  if (Test-Path $record) {
    foreach ($l in Get-Content $record -ErrorAction SilentlyContinue) {
      $p = $l.Split('|'); if ($p.Count -eq 3) { $known[$p[0]] = $p }
    }
  }
  $queued = 0; $changed = $false
  foreach ($name in @('Tasks-user-guide.pdf', 'Tasks-admin-guide.pdf')) {
    $f = Get-Item (Join-Path $docs $name) -ErrorAction SilentlyContinue
    if (-not $f -or $f.Length -lt 1KB) { continue }
    # Still being copied in: wait for the next run.
    if ($f.LastWriteTime -gt (Get-Date).AddSeconds(-30)) { continue }
    $ticks = [string]$f.LastWriteTimeUtc.Ticks
    if ($known[$name] -and $known[$name][1] -eq $ticks) { continue }
    $sha = (Get-FileHash $f.FullName -Algorithm SHA256).Hash
    if ($known[$name] -and $known[$name][2] -eq $sha) { $known[$name] = @($name, $ticks, $sha); $changed = $true; continue }
    $dated = '{0}_{1}' -f (Get-Date -Format 'yyMMdd'), $name
    New-Item -ItemType Directory -Force $outbox, $archive | Out-Null
    $target = Join-Path $archive $dated
    $n = 2
    while (Test-Path $target) { $target = Join-Path $archive ('{0}_{1}-{2}' -f (Get-Date -Format 'yyMMdd'), [IO.Path]::GetFileNameWithoutExtension($name), "$n.pdf"); $n++ }
    Copy-Item $f.FullName $target -Force
    Copy-Item $f.FullName (Join-Path $outbox (Split-Path $target -Leaf)) -Force
    $known[$name] = @($name, $ticks, $sha); $changed = $true; $queued++
  }
  if ($changed) { ($known.Values | ForEach-Object { $_ -join '|' }) | Set-Content -Encoding utf8 $record }
  return $queued
}
