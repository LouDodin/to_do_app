# Phone and Mac alerts on this PC, through your ntfy topic (state\ntfy-topic.txt):
#   - the scheduled task "Tasks alerts" (you, hidden, from log-on) shows them as Windows notifications
#   - sends a test alert: it appears here within 30 s, and on the phone if the ntfy app follows the topic
# Alerts tagged "pc" (this PC's own health alerts) are not shown twice.
param([switch]$NoPause)
. "$PSScriptRoot\_common.ps1"
Start-Log 'install-alerts'
$topicFile = Join-Path $State 'ntfy-topic.txt'
if (-not (Test-Path $topicFile)) { Fail 'no state\ntfy-topic.txt: put your ntfy topic in it first'; Stop-Log -NoPause:$NoPause; exit 1 }
$topic = (Get-Content $topicFile -Raw).Trim()
Register-AlertsListener
Ok 'Tasks alerts: listening (Windows notifications for alerts from your other devices)'
$server = if ($topic -match '://') { $topic.TrimEnd('/') } else { "https://ntfy.sh/$topic" }
try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  Invoke-WebRequest $server -Method Post -Body 'Alerts reach this PC and your phone.' -UseBasicParsing -TimeoutSec 15 -Headers @{ Title = 'Tasks: test alert'; Tags = 'white_check_mark,test'; Priority = '3' } | Out-Null
  Ok 'test alert sent: a Windows notification should appear within 30 seconds, and on the phone if the ntfy app follows the topic'
} catch { Fail "could not reach ntfy: $_" }
Stop-Log -NoPause:$NoPause
