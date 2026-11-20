# Installs the GTD automations on this PC (moved from the Mac, 10 Oct 2026): labels, dates and
# pending projects, next to the server, 24/7. It does NOT switch them on: the Mac still runs them
# until you switch it to "folders only". Then run start-automations.bat.
#   1. API token: taken from the Mac package in Downloads (or asked), kept in state\, readable only
#      by you, the administrators and the system
#   2. the Mac's state files (what it already processed)
#   3. their tests (about 70)
#   4. a read-only check against the server: the token works, the four automation labels exist
#   5. the scheduled task "Tasks automations", left OFF
. "$PSScriptRoot\_common.ps1"
Assert-Admin $PSCommandPath
Start-Log 'install-automations'
$py = Find-Python
if (-not (Test-Path (Join-Path $Auto 'webhook_listener.py'))) { Fail "no automations folder ($Auto)"; Stop-Log; exit 1 }
$autoState = Join-Path $State 'automations'
New-Item -ItemType Directory -Force $autoState | Out-Null

Step '1/5 API token'
$tok = Join-Path $State 'automation-token.txt'
if (-not (Test-Path $tok)) {
  $pkg = Join-Path $env:USERPROFILE 'Downloads\vikunja-automation-for-pc.zip'
  if (Test-Path $pkg) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $z = [IO.Compression.ZipFile]::OpenRead($pkg)
    try {
      $e = $z.Entries | Where-Object { $_.FullName -like '*webhook_listener.py' } | Select-Object -First 1
      $r = New-Object IO.StreamReader($e.Open()); $text = $r.ReadToEnd(); $r.Close()
      if ($text -match 'API_TOKEN\s*=\s*"(tk_[0-9a-f]+)"') { Set-Content -Path $tok -Value $Matches[1] -Encoding ascii -NoNewline }
    } finally { $z.Dispose() }
  }
  if (-not (Test-Path $tok)) {
    $sec = Read-Host 'Paste the automations API token (Vikunja > Settings > API Tokens; starts with tk_)' -AsSecureString
    $plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
    if ($plain -notmatch '^tk_[0-9a-f]+$') { Fail 'that does not look like a token'; Stop-Log; exit 1 }
    Set-Content -Path $tok -Value $plain -Encoding ascii -NoNewline
  }
}
$me = "$env:USERDOMAIN\$env:USERNAME"
& icacls $tok /inheritance:r /grant:r "*S-1-5-18:R" "*S-1-5-32-544:F" "${me}:F" 2>&1 | Out-Null
Ok 'token in state\automation-token.txt (readable by you, the administrators and the system only)'

Step '2/5 State from the Mac'
$init = Join-Path $Auto 'initial-state'
foreach ($f in Get-ChildItem $init -File -ErrorAction SilentlyContinue) {
  $dst = Join-Path $autoState $f.Name
  if (-not (Test-Path $dst)) { Copy-Item $f.FullName $dst; Ok "$($f.Name)" } else { Ok "$($f.Name) already there (kept)" }
}

Step '3/5 Tests'
Push-Location $Auto
$out = & $py -X utf8 -m unittest test_poller test_healthcheck test_watchdog 2>&1 | ForEach-Object { "$_" } | Where-Object { $_ -match '\S' -and $_ -notmatch 'RemoteException' }
$testsOk = ($LASTEXITCODE -eq 0)
# All the details when something fails, only the summary otherwise
$out | Select-Object -Last $(if ($testsOk) { 2 } else { 80 }) | ForEach-Object { "   $_" }
Pop-Location
if ($testsOk) { Ok 'all tests pass' } else { Fail 'some tests fail: nothing installed. Give this log to Claude.'; Stop-Log; exit 1 }

Step '4/5 Read-only check against the server'
$env:VIKUNJA_URL = 'http://127.0.0.1:3456'
$env:AUTOMATION_STATE_DIR = $autoState
$env:AUTOMATION_LOG = Join-Path $Logs 'automations.log'
$env:VIKUNJA_TOKEN_FILE = $tok
& $py -X utf8 -I (Join-Path $Auto 'webhook_listener.py') --check --role server 2>&1 | ForEach-Object { "   $_" }
if ($LASTEXITCODE -ne 0) { Fail 'the check failed: nothing installed. Give this log to Claude.'; Stop-Log; exit 1 }

Step '5/5 Scheduled task'
Register-SystemTask 'Tasks automations' $py "-X utf8 -I `"$Auto\run_poller.py`"" $Auto { New-ScheduledTaskTrigger -AtStartup } -LongRunning
if (Test-Path $AutoEnabled) {
  Ok 'Tasks automations installed and already switched on: restarting them'
  Stop-Automations; Start-Automations
} else {
  Disable-ScheduledTask -TaskName 'Tasks automations' | Out-Null
  Ok 'Tasks automations installed, OFF for now'
  Write-Host ''
  Write-Host '   Next:' -ForegroundColor Cyan
  Write-Host '   1. Switch the Mac to "folders only" (see docs\AUTOMATIONS.md, "Moving day").'
  Write-Host '   2. Then double-click scripts\start-automations.bat.'
}
Stop-Log
