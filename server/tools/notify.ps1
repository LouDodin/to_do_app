# Shows a Windows notification when the server's health gets worse (a new problem appears),
# and once when everything is fine again. Runs as you, hidden, at log-on and every hour.
# Reads state\health.json written by the hourly health check. Never repeats the same alert.
$Root = Split-Path -Parent $PSScriptRoot
$State = Join-Path $Root 'state'
$healthFile = Join-Path $State 'health.json'
$seenFile = Join-Path $State "notified-$env:USERNAME.json"
if (-not (Test-Path $healthFile)) { exit }
$h = Get-Content $healthFile -Raw -Encoding UTF8 | ConvertFrom-Json
# A warning you acknowledged for yourself only ("Got it", ack_admin) is not shown either (30 Oct 2026).
$bad = @($h.checks | Where-Object { $_.status -ne 'ok' -and -not $_.ack_admin })
$key = ($bad | ForEach-Object { "$($_.name)=$($_.status)" }) -join ';'
$prev = if (Test-Path $seenFile) { (Get-Content $seenFile -Raw | ConvertFrom-Json).key } else { '' }
if ($key -eq $prev) { exit }

function Show-Toast([string]$Title, [string]$Body) {
  [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
  [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
  $esc = { param($s) [Security.SecurityElement]::Escape($s) }
  $report = (Join-Path $State 'health-report.html') -replace '\\', '/'
  $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
  $xml.LoadXml("<toast activationType='protocol' launch='file:///$report'><visual><binding template='ToastGeneric'><text>$(& $esc $Title)</text><text>$(& $esc $Body)</text></binding></visual></toast>")
  $toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
  [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe').Show($toast)
}

$prevBad = @($prev -split ';' | Where-Object { $_ })
$new = @($bad | Where-Object { $prevBad -notcontains "$($_.name)=$($_.status)" })
try {
  if ($bad.Count -eq 0) {
    if ($prev) { Show-Toast 'Tasks server: all good again' 'Every check passes.' }
  } elseif ($new.Count -gt 0) {
    $first = $new | Sort-Object { if ($_.status -eq 'fail') { 0 } else { 1 } } | Select-Object -First 1
    $title = if ($first.status -eq 'fail') { "Tasks server problem: $($first.name)" } else { "Tasks server warning: $($first.name)" }
    $body = "$($first.detail)`n$($first.fix)"
    if ($new.Count -gt 1) { $body += "`n(+$($new.Count - 1) more - click for the report)" }
    Show-Toast $title $body
  }
} catch {}
@{ key = $key; at = (Get-Date).ToString('s') } | ConvertTo-Json | Set-Content $seenFile -Encoding UTF8
