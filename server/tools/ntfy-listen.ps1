# Shows a Windows notification for each alert on your ntfy topic (state\ntfy-topic.txt) sent by
# another device: the phone or the Mac (the app's "sync stuck" and "signed out" alerts, a test).
# Alerts tagged "pc" are skipped: they come from this PC's own health check, which the
# notifier already shows here. Runs as you, hidden, from log-on (scheduled task "Tasks alerts");
# only one copy runs. It asks ntfy every 30 seconds for new alerts.
$Root = Split-Path -Parent $PSScriptRoot
$State = Join-Path $Root 'state'
$topicFile = Join-Path $State 'ntfy-topic.txt'
$seenFile = Join-Path $State "ntfy-seen-$env:USERNAME.json"
$log = Join-Path $Root 'logs\alerts-listener.log'

$created = $false
$mutex = New-Object Threading.Mutex($true, 'Local\TasksAlertsListener', [ref]$created)
if (-not $created) { exit }

function Add-ListenerLog([string]$Text) {
  try {
    if ((Test-Path $log) -and (Get-Item $log).Length -gt 1MB) { Move-Item $log "$log.old" -Force }
    Add-Content -Path $log -Value ("{0} {1}" -f (Get-Date -Format s), $Text)
  } catch {}
}

function Show-Toast([string]$Title, [string]$Body) {
  [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
  [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
  $esc = { param($s) [Security.SecurityElement]::Escape($s) }
  $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
  $xml.LoadXml("<toast activationType='protocol' launch='http://127.0.0.1:5173/settings'><visual><binding template='ToastGeneric'><text>$(& $esc $Title)</text><text>$(& $esc $Body)</text></binding></visual></toast>")
  $toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
  [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe').Show($toast)
}

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
# What was already seen: the time of the newest alert and the ids at that time.
$seen = @{ time = [int64]([DateTimeOffset]::UtcNow.ToUnixTimeSeconds()); ids = @() }
if (Test-Path $seenFile) { try { $j = Get-Content $seenFile -Raw | ConvertFrom-Json; $seen.time = [int64]$j.time; $seen.ids = @($j.ids) } catch {} }
# Never show alerts older than 12 hours (the PC was off, or you were logged out).
$oldest = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds() - 12 * 3600
if ($seen.time -lt $oldest) { $seen.time = $oldest }
Add-ListenerLog 'started'

while ($true) {
  $topic = (Get-Content $topicFile -Raw -ErrorAction SilentlyContinue)
  if ($topic) { $topic = $topic.Trim() }
  if (-not $topic) { Start-Sleep 300; continue }
  $server = if ($topic -match '://') { $topic.TrimEnd('/') } else { "https://ntfy.sh/$topic" }
  try {
    $r = Invoke-WebRequest "$server/json?poll=1&since=$($seen.time)" -UseBasicParsing -TimeoutSec 20
    $text = [Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray())
    foreach ($line in ($text -split "`n")) {
      if (-not $line.Trim()) { continue }
      $m = $line | ConvertFrom-Json
      if ($m.event -ne 'message' -or $seen.ids -contains $m.id -or [int64]$m.time -lt $seen.time) { continue }
      if ([int64]$m.time -gt $seen.time) { $seen.time = [int64]$m.time; $seen.ids = @() }
      $seen.ids += $m.id
      if (@($m.tags) -contains 'pc') { continue }
      $title = if ($m.title) { $m.title } else { 'Tasks' }
      try { Show-Toast $title $m.message; Add-ListenerLog "shown: $title | $($m.message) [$(@($m.tags) -join ',')]" } catch { Add-ListenerLog "toast failed: $_" }
    }
    @{ time = $seen.time; ids = $seen.ids } | ConvertTo-Json | Set-Content $seenFile -Encoding ascii
  } catch {
    Add-ListenerLog "ntfy not reachable: $($_.Exception.Message)"
    Start-Sleep 60
  }
  Start-Sleep 30
}
