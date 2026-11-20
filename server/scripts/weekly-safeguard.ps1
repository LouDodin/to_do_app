# Safeguard off the PC, to your Mac through Tailscale (Taildrop: encrypted from end to end, no cloud).
# If this PC breaks, is stolen or its disk dies, the Mac holds what is needed to rebuild the server.
# Run every hour by the scheduled task "Tasks weekly safeguard" (-Hourly), or by hand
# (weekly-safeguard.bat: makes a full copy now and sends it). Each run:
#   1. once a day: a fresh, checked backup; the database alone goes to the outbox as
#      tasks-data-<date>.db (a few MB), so at most about a day of changes can be lost
#   2. once a week (Sunday, or when the last full copy is 7 days old): the whole server (data,
#      Vikunja, app, app source, tools, scripts, docs, settings) as tasks-server-<date>.zip,
#      checked (readable, complete) before it goes to the outbox
#   3. sends whatever is in the outbox (state\offsite-outbox) to the Mac. The Mac is often asleep:
#      what cannot be sent waits there and is retried every hour. Sent files leave the outbox.
#   4. a new version of the User guide or the Admin guide goes too, as YYMMDD_<name>.pdf
#      (Add-GuidesToOutbox in _common.ps1; also kept in docs\guides-archive\)
#   5. writes state\offsite-last.txt (this run) and state\offsite-sent.txt (last file that reached
#      the Mac), read by the hourly health check
param([switch]$NoPause, [switch]$Hourly)
. "$PSScriptRoot\_common.ps1"
Start-Log 'weekly-safeguard'
$lastFile = Join-Path $State 'offsite-last.txt'
$sentFile = Join-Path $State 'offsite-sent.txt'
$outbox = Join-Path $State 'offsite-outbox'
$stamp = Join-Path $State 'offsite-made.txt'   # date of the last daily copy | date of the last full copy
New-Item -ItemType Directory -Force $outbox | Out-Null
# An hourly run that only finds nothing to do (or the Mac asleep) leaves no log file behind
# (there used to be 24 a day). Logs of this script older than 14 days are deleted.
$script:quiet = $true
function Done([bool]$ok, [string]$detail) {
  ('{0}|{1}|{2}' -f (Get-Date -Format 's'), $(if ($ok) { 'ok' } else { 'FAILED' }), $detail) | Set-Content -Encoding utf8 $lastFile
  if ($ok) { Ok $detail } else { Fail $detail; $script:quiet = $false }
  $log = $script:LogFile
  Stop-Log -NoPause:$NoPause
  if ($Hourly -and $script:quiet -and $log) { Remove-Item $log -Force -ErrorAction SilentlyContinue }
  Get-ChildItem $Logs -Filter 'weekly-safeguard-*.txt' -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-14) } | Remove-Item -Force -ErrorAction SilentlyContinue
  exit $(if ($ok) { 0 } else { 1 })
}
if (-not (Test-Path (Join-Path $State 'offsite-target.txt'))) { Done $false 'not set up: run scripts\install-weekly-safeguard.bat' }

$today = Get-Date -Format 'yyyy-MM-dd'
$made = if (Test-Path $stamp) { (Get-Content $stamp -Raw).Trim().Split('|') } else { @('', '') }
$lastFullDate = if ($made.Count -gt 1 -and $made[1]) { [datetime]$made[1] } else { [datetime]::MinValue }
$dailyDue = (-not $Hourly) -or ($made[0] -ne $today)
$fullDue = (-not $Hourly) -or ((Get-Date).DayOfWeek -eq 'Sunday' -and $made[1] -ne $today) -or ($lastFullDate -lt (Get-Date).AddDays(-6.5))

if ($dailyDue -or $fullDue) { $script:quiet = $false }
if ($dailyDue) {
  Step 'Fresh backup'
  if (-not (Invoke-Backup)) { Done $false 'the database backup failed' }
  $latest = Get-ChildItem (Join-Path $Root 'backups') -Filter 'vikunja-*.db' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  Copy-Item $latest.FullName (Join-Path $outbox "tasks-data-$today.db") -Force
  Ok "tasks-data-$today.db ready to send"
}

if ($fullDue) {
  Step 'Packing the whole server'
  $tmp = Join-Path $env:TEMP 'todo-safeguard'
  New-Item -ItemType Directory -Force $tmp | Out-Null
  Get-ChildItem $tmp -File -ErrorAction SilentlyContinue | Remove-Item -Force
  try { $zip = New-ExportZip $tmp } catch { Done $false "packing failed: $_" }
  if (-not $zip -or -not (Test-Path $zip)) { Done $false 'packing failed: no zip made' }

  Step 'Checking the zip'
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  try {
    $z = [IO.Compression.ZipFile]::OpenRead($zip)
    $names = @($z.Entries | ForEach-Object { $_.FullName.Replace('\', '/') })
    $db = $z.Entries | Where-Object { $_.FullName.Replace('\', '/') -eq 'todo-server/vikunja/db/vikunja.db' } | Select-Object -First 1
    $dbLen = if ($db) { $db.Length } else { 0 }
    $z.Dispose()
  } catch { Done $false "the zip cannot be read: $_" }
  $missing = @('todo-server/vikunja/db/vikunja.db', 'todo-server/vikunja/vikunja.exe', 'todo-server/app/index.html', 'todo-server/scripts/setup-new-pc.ps1', 'todo-server/docs/MOVE-TO-NEW-PC.md') | Where-Object { $names -notcontains $_ }
  if ($missing) { Done $false ("the zip is incomplete, missing: " + ($missing -join ', ')) }
  if ($dbLen -lt 10KB) { Done $false 'the database in the zip is empty' }
  Ok ("{0} files, database {1:N0} KB" -f $names.Count, ($dbLen / 1KB))
  # Only the newest full copy waits in the outbox: an older unsent one is replaced.
  Get-ChildItem $outbox -Filter 'tasks-server-*.zip' | Remove-Item -Force
  Move-Item $zip (Join-Path $outbox "tasks-server-$today.zip") -Force
  $made = @($today, $today)
}
if ($dailyDue -or $fullDue) { ('{0}|{1}' -f $(if ($dailyDue) { $today } else { $made[0] }), $made[1]) | Set-Content -Encoding ascii $stamp }

# At most 14 daily copies wait if the Mac stays away (the older ones are still in backups\ on the PC).
Get-ChildItem $outbox -Filter 'tasks-data-*.db' | Sort-Object Name -Descending | Select-Object -Skip 14 | Remove-Item -Force

$g = Add-GuidesToOutbox
if ($g -gt 0) { $script:quiet = $false; Ok "$g new guide(s) ready to send" }

Step 'Sending to the Mac'
$pending = @(Get-ChildItem $outbox -File | Sort-Object Name)
if (-not $pending) { Done $true 'nothing to send: everything is already on the Mac' }
try { $st = & $Ts status --json | ConvertFrom-Json } catch { $st = $null }
$macs = @($st.Peer.PSObject.Properties.Value | Where-Object { $_.OS -eq 'macOS' -and $_.Online })
if (-not $macs) { Done $true ("{0} file(s) waiting: the Mac is asleep or offline, retried every hour" -f $pending.Count) }
$mac = $macs[0]
$name = $mac.DNSName.Split('.')[0]
$sent = 0
foreach ($f in $pending) {
  $out = & $Ts file cp $f.FullName "$($mac.TailscaleIPs[0]):" 2>&1
  if ($LASTEXITCODE -eq 0) {
    Remove-Item $f.FullName -Force
    $sent++
    $script:quiet = $false
    Write-Host "   sent $($f.Name)"
    ('{0}|{1}|{2}' -f (Get-Date -Format 's'), $name, $f.Name) | Set-Content -Encoding utf8 $sentFile
  } else {
    $text = ($out | Out-String)
    # Listed as online but asleep (lid closed): Tailscale says "not replying" / 502. Not a fault.
    if ($text -match 'not replying|502|Bad Gateway|timeout|timed out|no route') {
      if ($sent -gt 0) { Done $true ("{0} file(s) sent to {1}, the rest waits: the Mac stopped answering" -f $sent, $name) }
      Done $true ("{0} file(s) waiting: {1} is asleep (not answering), retried every hour" -f $pending.Count, $name)
    }
    Done $false ("could not send {0} to {1}: {2}" -f $f.Name, $name, ($text -replace '\s+', ' ').Trim())
  }
}
Done $true ("{0} file(s) sent to {1} (in its Downloads folder)" -f $sent, $name)
