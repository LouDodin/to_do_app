# Applies updates without anyone at the PC (22 Oct 2026). Run every minute by the scheduled task
# "Tasks auto-update" (install-auto-update.bat). It does nothing unless there is work:
#
#  1. app-next.zip in this folder (put there by Claude through the linked PC): runs deploy-app
#     (which keeps the previous version and puts it back by itself if the new one does not answer).
#  2. a request file in requests\ : <name>.request runs scripts\<name>.ps1, for these names only:
#       update-vikunja (the file may contain a version such as v2.8.0), restart-server,
#       health-check-now, repair-services, backup-now, rollback-app,
#       create-user (the file holds "username|e-mail"; the temporary password is made on the PC and
#       sent only to the Mac, never written in a result: see create-user.ps1),
#       task-ops (the file holds JSON {"ops": [...]}: validate / move / complete the main account's
#       own tasks, never delete: see tools\task_ops.py)
#     (rollback-vikunja asks you to confirm: it stays a decision made at the PC)
#     Anything else is refused. A request runs once: it is renamed <name>.done-<time> (or
#     .refused-<time>), and the result goes to requests\<name>.result.txt.
#
#  3. a new User guide or Admin guide PDF in docs\: a dated copy (YYMMDD_<name>.pdf) is queued for
#     the Mac and "Tasks weekly safeguard" is started at once to send it (otherwise within the hour).
#
#  4. power watch (10 Nov 2026), every minute: on battery for 1 h 30 (11 Nov; and the charge has
#     really gone down), or at 20 % or less, an
#     urgent phone notification (ntfy priority 5, generic text) and an immediate health check (Power
#     turns red in the app). Once per stage until it is back on the charger
#     (state\on-battery-since.txt, shared with the health check, and state\power-alerted.txt).
#
# Every result is also in state\auto-update-last.txt (shown by the health check) and
# state\auto-update-history.log. Each script keeps its own full log in logs\ as usual.
param([string]$ScriptsDir = $PSScriptRoot, [switch]$NoPause)
. "$PSScriptRoot\_common.ps1"

$Allowed = @('update-vikunja', 'restart-server', 'health-check-now', 'repair-services', 'backup-now', 'rollback-app', 'create-user', 'task-ops')
$Requests = Join-Path $Root 'requests'
$LastFile = Join-Path $State 'auto-update-last.txt'
$History = Join-Path $State 'auto-update-history.log'
$Lock = Join-Path $State 'auto-update.lock'
$Shell = (Get-Process -Id $PID).Path   # the same PowerShell as this one
New-Item -ItemType Directory -Force -Path $Requests | Out-Null

function Write-Result([string]$What, [bool]$Ok, [string]$Detail, [string]$LogPath) {
  $line = '{0}|{1}|{2}|{3}|{4}' -f (Get-Date -Format 's'), $(if ($Ok) { 'ok' } else { 'fail' }), $What, ($Detail -replace '[\r\n|]+', ' '), $LogPath
  Set-Content -Path $LastFile -Value $line -Encoding UTF8
  Add-Content -Path $History -Value $line -Encoding UTF8
  return $line
}

# Runs scripts\<name>.ps1 and returns @{ ok; detail; log }. Success = exit code 0 and no "XX" line
# (the mark of a failed step) in its log.
function Invoke-Script([string]$Name, [string[]]$ScriptArgs = @()) {
  $start = Get-Date
  $file = Join-Path $ScriptsDir "$Name.ps1"
  $out = & $Shell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $file @ScriptArgs -NoPause 2>&1 | Out-String
  $code = $LASTEXITCODE
  $log = Get-ChildItem $Logs -Filter "$Name-*.txt" -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -ge $start.AddSeconds(-5) } | Sort-Object LastWriteTime | Select-Object -Last 1
  $text = if ($log) { Get-Content $log.FullName -Raw -ErrorAction SilentlyContinue } else { $out }
  $failed = @(($text -split "`r?`n") | Where-Object { $_ -match '^\s*XX\s' })
  $oks = @(($text -split "`r?`n") | Where-Object { $_ -match '^\s*OK\s' })
  $ok = ($code -eq 0 -or $null -eq $code) -and $failed.Count -eq 0
  $detail = if (-not $ok) { (($failed | Select-Object -First 2) -join ' / ').Trim() } elseif ($oks) { $oks[-1].Trim() } else { 'done' }
  if (-not $detail) { $detail = "exit code $code" }
  return @{ ok = $ok; detail = $detail; log = $(if ($log) { $log.FullName } else { '' }) }
}

# 4. Power watch: cheap (one WMI read), so it runs every minute, before anything else can wait.
# 9-10 Nov 2026: the PC was unplugged at about 20:00, the hourly check warned only at 00:07, and the
# battery ran out at 05:07 (off for 12 h). Now: an urgent notification after 1 h 30 on battery.
try {
  $bat = Get-CimInstance Win32_Battery -ErrorAction Stop | Select-Object -First 1
  if ($bat) {
    $sinceFile = Join-Path $State 'on-battery-since.txt'
    $alertedFile = Join-Path $State 'power-alerted.txt'
    $startFile = Join-Path $State 'on-battery-charge.txt'
    # On the charger? Windows' power line flag (11 Nov 2026): plugged in and full, the battery
    # itself says "discharging" (BatteryStatus 1) and gave five false alarms in one night.
    $online = $null
    try { $ps = Get-CimInstance -Namespace root\wmi -ClassName BatteryStatus -ErrorAction Stop | Select-Object -First 1; if ($ps) { $online = [bool]$ps.PowerOnline } } catch { }
    if ($null -eq $online) { $online = ($bat.BatteryStatus -ne 1) }
    if (-not $online) {
      if (-not (Test-Path $sinceFile)) {
        Set-Content -Path $sinceFile -Value (Get-Date -Format 's') -Encoding ASCII
        Set-Content -Path $startFile -Value ([int]$bat.EstimatedChargeRemaining) -Encoding ASCII
      }
      $since = Get-Date
      try { $since = [datetime]::Parse((Get-Content $sinceFile -Raw).Trim()) } catch { }
      $mins = ((Get-Date) - $since).TotalMinutes
      $charge = [int]$bat.EstimatedChargeRemaining
      $startCharge = $charge
      try { $startCharge = [int](Get-Content $startFile -Raw).Trim() } catch { }
      $dropping = ($startCharge - $charge) -ge 3   # really running on the battery
      $stage = if ($charge -le 20) { 'low' } elseif ($mins -ge 90 -and $dropping) { 'hour' } else { '' }
      $done = if (Test-Path $alertedFile) { (Get-Content $alertedFile -Raw).Trim() } else { '' }
      if ($stage -and ($done -split ' ') -notcontains $stage) {
        Set-Content -Path $alertedFile -Value ("$done $stage").Trim() -Encoding ASCII
        $topicFile = Join-Path $State 'ntfy-topic.txt'
        $sent = 'not sent (no ntfy topic)'
        if (Test-Path $topicFile) {
          $topic = (Get-Content $topicFile -Raw).Trim()
          $url = if ($topic -match '://') { $topic } else { "https://ntfy.sh/$topic" }
          # Generic on purpose: the topic is a public channel.
          $title = if ($stage -eq 'low') { 'Tasks problem: Power (battery low)' } else { 'Tasks problem: Power (on battery for 1 h 30)' }
          $body = 'Plug the PC charger in now, or the PC will switch off and no device can sync.'
          try {
            Invoke-RestMethod -Uri $url -Method Post -Body ([Text.Encoding]::UTF8.GetBytes($body)) -TimeoutSec 15 -Headers @{ Title = $title; Priority = '5'; Tags = 'rotating_light,pc' } | Out-Null
            $sent = 'urgent notification sent'
          } catch {
            & curl.exe -s -f -m 15 -d $body -H "Title: $title" -H 'Priority: 5' -H 'Tags: rotating_light,pc' $url | Out-Null
            $sent = if ($LASTEXITCODE -eq 0) { 'urgent notification sent' } else { 'urgent notification NOT sent (ntfy unreachable)' }
          }
        }
        Add-Content -Path $History -Value ('{0}|fail|power|on battery for {1:N0} min, {2} % left (was {3} %): {4}|' -f (Get-Date -Format 's'), $mins, $charge, $startCharge, $sent) -Encoding UTF8
        Start-ScheduledTask -TaskName 'Tasks health check' -ErrorAction SilentlyContinue
      }
    } else {
      # On the charger: the next time on battery starts from zero.
      Remove-Item $sinceFile, $startFile -Force -ErrorAction SilentlyContinue
    }
    if ($online -and (Test-Path $alertedFile)) {
      # Back on the charger after an alert: the health check says "all OK again" at once.
      Remove-Item $alertedFile -Force -ErrorAction SilentlyContinue
      Add-Content -Path $History -Value ('{0}|ok|power|back on the charger|' -f (Get-Date -Format 's')) -Encoding UTF8
      Start-ScheduledTask -TaskName 'Tasks health check' -ErrorAction SilentlyContinue
    }
  }
} catch { }

# One at a time (a manual run of the same script is not prevented, but two automatic ones are).
if (Test-Path $Lock) {
  if ((Get-Item $Lock).LastWriteTime -gt (Get-Date).AddMinutes(-45)) { exit 0 }
  Remove-Item $Lock -Force -ErrorAction SilentlyContinue   # left by a run that was killed
}
# 3. New guides: cheap check (file times), so it runs every minute.
try {
  if ((Add-GuidesToOutbox) -gt 0) {
    Add-Content -Path $History -Value ('{0}|ok|guides|new guide PDF queued for the Mac|' -f (Get-Date -Format 's')) -Encoding UTF8
    Start-ScheduledTask -TaskName 'Tasks weekly safeguard' -ErrorAction SilentlyContinue
  }
} catch { }

$zip = Join-Path $Root 'app-next.zip'
$pending = @(Get-ChildItem $Requests -Filter '*.request' -ErrorAction SilentlyContinue)
$zipReady = (Test-Path $zip) -and ((Get-Item $zip).LastWriteTime -lt (Get-Date).AddSeconds(-30))  # fully copied
if (-not $zipReady -and -not $pending) { exit 0 }
Set-Content -Path $Lock -Value $PID
try {
  # 1. A new version of the app
  if ($zipReady) {
    $want = ''
    try {
      Add-Type -AssemblyName System.IO.Compression.FileSystem
      $z = [IO.Compression.ZipFile]::OpenRead($zip)
      $entry = $z.Entries | Where-Object { $_.FullName -eq 'version.txt' } | Select-Object -First 1
      $hasIndex = [bool]($z.Entries | Where-Object { $_.FullName -eq 'index.html' })
      if ($entry) { $r = New-Object IO.StreamReader($entry.Open()); $want = $r.ReadToEnd().Trim(); $r.Close() }
      $z.Dispose()
    } catch { $hasIndex = $false }
    if (-not $hasIndex -or -not $want) {
      $bad = Join-Path $Root ('app-next-refused-{0}.zip' -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
      Move-Item $zip $bad -Force
      Write-Result 'app' $false "app-next.zip is not an app build (no index.html or version.txt): set aside as $(Split-Path $bad -Leaf)" '' | Out-Null
    } else {
      $r = Invoke-Script 'deploy-app'
      $live = try { (Invoke-WebRequest 'http://127.0.0.1:5173/version.txt' -UseBasicParsing -TimeoutSec 5).Content.Trim() } catch { '' }
      if ($live -eq $want) { Write-Result 'app' $true "version $want is live" $r.log | Out-Null }
      else { Write-Result 'app' $false "version $want did not go live (live: $(if ($live) { $live } else { 'not answering' })): $($r.detail)" $r.log | Out-Null }
    }
  }

  # 2. Requests
  foreach ($req in $pending) {
    $name = $req.BaseName.ToLower()
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $resultFile = Join-Path $Requests "$name.result.txt"
    if ($Allowed -notcontains $name) {
      Rename-Item $req.FullName "$($req.Name).refused-$stamp" -ErrorAction SilentlyContinue
      $line = Write-Result $name $false "refused: only $($Allowed -join ', ') can be requested" ''
      Set-Content $resultFile $line -Encoding UTF8
      continue
    }
    $content = (Get-Content $req.FullName -Raw -ErrorAction SilentlyContinue)
    $argsList = @()
    if ($name -eq 'update-vikunja' -and $content -and $content.Trim()) {
      if ($content.Trim() -match '^v\d+\.\d+\.\d+$') { $argsList = @($content.Trim()) }
      else {
        Rename-Item $req.FullName "$($req.Name).refused-$stamp" -ErrorAction SilentlyContinue
        $line = Write-Result $name $false "refused: '$($content.Trim())' is not a version like v2.8.0" ''
        Set-Content $resultFile $line -Encoding UTF8
        continue
      }
    }
    if ($name -eq 'create-user') {
      $parts = @((($content | Out-String).Trim()) -split '\|')
      if ($parts.Count -ne 2 -or $parts[0].Trim() -notmatch '^[A-Za-z0-9._-]{3,40}$' -or $parts[1].Trim() -notmatch '^[^@\s|]+@[^@\s|]+\.[^@\s|]+$') {
        Rename-Item $req.FullName "$($req.Name).refused-$stamp" -ErrorAction SilentlyContinue
        $line = Write-Result $name $false "refused: the file must hold 'username|e-mail'" ''
        Set-Content $resultFile $line -Encoding UTF8
        continue
      }
      $argsList = @('-Username', $parts[0].Trim(), '-Email', $parts[1].Trim(), '-Generate')
    }
    if ($name -eq 'task-ops') {
      $ok = $false
      try { $j = ($content | Out-String) | ConvertFrom-Json; $ok = $null -ne $j.ops } catch { }
      if (-not $ok) {
        Rename-Item $req.FullName "$($req.Name).refused-$stamp" -ErrorAction SilentlyContinue
        $line = Write-Result $name $false "refused: the file must hold JSON {`"ops`": [...]}" ''
        Set-Content $resultFile $line -Encoding UTF8
        continue
      }
      $in = Join-Path $State 'task-ops.json'
      Set-Content -Path $in -Value ($content | Out-String) -Encoding UTF8
      $argsList = @('-InputFile', $in)
    }
    Rename-Item $req.FullName "$($req.Name).done-$stamp" -ErrorAction SilentlyContinue
    $r = Invoke-Script $name $argsList
    $line = Write-Result $name $r.ok $r.detail $r.log
    Set-Content $resultFile $line -Encoding UTF8
  }
} finally {
  Remove-Item $Lock -Force -ErrorAction SilentlyContinue
}
