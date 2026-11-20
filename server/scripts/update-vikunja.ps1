# Updates Vikunja safely.
#  1. finds the newest release (or the one given: update-vikunja.bat v2.8.0)
#  2. downloads the Windows build and checks its SHA-256
#  3. backs up the database
#  4. TESTS the new version on a COPY of the database (port 3457): it must start, migrate the
#     copy, and still give the app every field it uses
#  5. only then switches; if the switched server misbehaves, the old version and the database
#     from just before are put back automatically
# Nothing changes if any test fails. rollback-vikunja.bat undoes a finished update.
param([string]$Version = '', [switch]$NoPause)
. "$PSScriptRoot\_common.ps1"
Assert-Admin $PSCommandPath ("$Version" + $(if ($NoPause) { ' -NoPause' }))
Start-Log 'update-vikunja'
$py = Find-Python
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ProgressPreference = 'SilentlyContinue'

Step 'Versions'
$current = Get-VikunjaVersion
if (-not $current) { Fail 'Vikunja is not running: run restart-server.bat first.'; Stop-Log -NoPause:$NoPause; exit 1 }
$api = 'https://api.github.com/repos/go-vikunja/vikunja/releases/' + $(if ($Version) { "tags/$Version" } else { 'latest' })
try { $rel = Invoke-RestMethod $api -Headers @{ 'User-Agent' = 'tasks-updater' } } catch { Fail "cannot read the release list: $_"; Stop-Log -NoPause:$NoPause; exit 1 }
$target = $rel.tag_name
Write-Host "   installed: $current   available: $target"
if ($current -eq $target) { Ok 'already up to date'; Stop-Log -NoPause:$NoPause; exit 0 }
Write-Host "   release notes: $($rel.html_url)"

Step 'Download'
# Only Vikunja itself: since 2.7.1 a release also carries other programs (e.g. "veans", a command-line
# tool) built for Windows, which used to be picked by mistake.
$asset = $rel.assets | Where-Object { $_.name -match '^vikunja-.*windows-4\.0-amd64.*full\.zip$' } | Select-Object -First 1
if (-not $asset) { $asset = $rel.assets | Where-Object { $_.name -match '^vikunja-.*windows.*amd64.*\.zip$' } | Select-Object -First 1 }
if (-not $asset) { Fail 'no Windows build in this release'; Stop-Log -NoPause:$NoPause; exit 1 }
$dir = Join-Path $Vk "versions\$target"
if (Test-Path $dir) { Remove-Item $dir -Recurse -Force }  # a previous, failed attempt
New-Item -ItemType Directory -Force $dir | Out-Null
$zip = Join-Path $dir $asset.name
Invoke-WebRequest $asset.browser_download_url -OutFile $zip
Expand-Archive $zip -DestinationPath $dir -Force
$newExe = Get-ChildItem $dir -Filter 'vikunja*.exe' -Recurse | Select-Object -First 1
if (-not $newExe) { Fail "no vikunja .exe in $($asset.name)"; Stop-Log -NoPause:$NoPause; exit 1 }
$shaFile = Get-ChildItem $dir -Filter "$($newExe.Name).sha256" -Recurse | Select-Object -First 1
if (-not $shaFile) { $shaFile = Get-ChildItem $dir -Filter 'vikunja*.sha256' -Recurse | Select-Object -First 1 }
if ($shaFile) {
  $expected = ((Get-Content $shaFile.FullName -Raw).Trim() -split '\s+')[0].ToLower()
  $actual = (Get-FileHash $newExe.FullName -Algorithm SHA256).Hash.ToLower()
  if ($expected -ne $actual) { Fail "checksum mismatch: the download is damaged or not genuine. Nothing changed."; Stop-Log -NoPause:$NoPause; exit 1 }
  Ok "checksum verified ($($newExe.Name))"
} else { Warn 'no checksum file in the release: continuing' }

Step 'Backup'
if (-not (Invoke-Backup)) { Fail 'backup failed: stopping, nothing changed.'; Stop-Log -NoPause:$NoPause; exit 1 }
$latestBackup = Get-ChildItem (Join-Path $Root 'backups') -Filter 'vikunja-*.db' | Sort-Object LastWriteTime -Descending | Select-Object -First 1

Step "Test of $target on a copy of your data"
$test = Join-Path $State 'update-test'
if (Test-Path $test) { Remove-Item $test -Recurse -Force }
New-Item -ItemType Directory -Force (Join-Path $test 'files') | Out-Null
Copy-Item $latestBackup.FullName (Join-Path $test 'vikunja.db')
# Same settings as the real server (run-vikunja.cmd), on another port and the copy.
$cmd = Get-Content (Join-Path $Vk 'run-vikunja.cmd')
foreach ($line in $cmd) { if ($line -match '^set (VIKUNJA_[A-Z_]+)=(.*)$' -and $Matches[2] -notmatch '%') { Set-Item "env:$($Matches[1])" $Matches[2] } }
$env:VIKUNJA_SERVICE_ROOTPATH = "$test\"
$env:VIKUNJA_SERVICE_INTERFACE = '127.0.0.1:3457'
$env:VIKUNJA_DATABASE_PATH = Join-Path $test 'vikunja.db'
$env:VIKUNJA_FILES_BASEPATH = Join-Path $test 'files'
$env:VIKUNJA_SERVICE_PUBLICURL = (Get-Content (Join-Path $Vk 'publicurl.txt') -ErrorAction SilentlyContinue | Select-Object -First 1)
$proc = Start-Process $newExe.FullName -WorkingDirectory $test -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $test 'test.log') -RedirectStandardError (Join-Path $test 'test-err.log')
$okTest = $false
if (Test-Url 'http://127.0.0.1:3457/api/v1/info' 30) {
  $v = Get-VikunjaVersion 'http://127.0.0.1:3457'
  Ok "the new version starts and upgraded the copy ($v)"
  & $py -I (Join-Path $Tools 'healthcheck.py') --base 'http://127.0.0.1:3457' --contract-only 2>&1 | ForEach-Object { "   $_" }
  $okTest = ($LASTEXITCODE -eq 0) -and ($v -eq $target)
  # The GTD automations: one full cycle against the new version, on the copy (it may write to the copy only).
  if ($okTest -and (Test-Path (Join-Path $Auto 'webhook_listener.py')) -and (Test-Path (Join-Path $State 'automation-token.txt'))) {
    $autoTest = Join-Path $test 'automations-state'
    New-Item -ItemType Directory -Force $autoTest | Out-Null
    Get-ChildItem (Join-Path $State 'automations') -Filter '*.txt' -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne 'enabled.txt' } | Copy-Item -Destination $autoTest
    $saved = @{}; foreach ($k in 'VIKUNJA_URL', 'AUTOMATION_STATE_DIR', 'AUTOMATION_LOG', 'VIKUNJA_TOKEN_FILE') { $saved[$k] = [Environment]::GetEnvironmentVariable($k) }
    $env:VIKUNJA_URL = 'http://127.0.0.1:3457'; $env:AUTOMATION_STATE_DIR = $autoTest
    $env:AUTOMATION_LOG = Join-Path $test 'automations.log'; $env:VIKUNJA_TOKEN_FILE = Join-Path $State 'automation-token.txt'
    & $py -X utf8 -I (Join-Path $Auto 'webhook_listener.py') --once --role server 2>&1 | ForEach-Object { "   automations: $_" }
    if ($LASTEXITCODE -eq 0) { Ok 'the automations run a full cycle on the new version' }
    else { $okTest = $false; Fail 'the automations fail on the new version:'; Get-Content (Join-Path $autoTest 'errors.log') -Tail 10 -ErrorAction SilentlyContinue | ForEach-Object { "      $_" } }
    foreach ($k in $saved.Keys) { [Environment]::SetEnvironmentVariable($k, $saved[$k]) }
  }
} else {
  Fail 'the new version did not start on the copy. Its log:'
  Get-Content (Join-Path $test 'test.log'), (Join-Path $test 'test-err.log') -Tail 20 -ErrorAction SilentlyContinue
}
Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
if (-not $okTest) { Fail "test failed: nothing changed, you stay on $current. Give this log to Claude: $script:LogFile"; Stop-Log -NoPause:$NoPause; exit 1 }

Step 'Switching'
Stop-Server
if (Get-VikunjaVersion) {
  Fail 'the server could not be stopped: nothing changed. Restart the PC, then run this again.'
  Stop-Log -NoPause:$NoPause; exit 1
}
$stamp = Get-Date -Format 'yyyyMMdd-HHmm'
try {
  Copy-Item (Join-Path $Vk 'vikunja.exe') (Join-Path $Vk 'vikunja-previous.exe') -Force -ErrorAction Stop
  if (-not (Copy-Database (Join-Path $Vk 'db\vikunja.db') (Join-Path $Vk "db\vikunja.db.before-$target-$stamp"))) { throw 'database copy failed' }
  Copy-Item $newExe.FullName (Join-Path $Vk 'vikunja.exe') -Force -ErrorAction Stop
} catch {
  Fail "could not replace the program ($_): starting the current version again, nothing changed."
  Copy-Item (Join-Path $Vk 'vikunja-previous.exe') (Join-Path $Vk 'vikunja.exe') -Force -ErrorAction SilentlyContinue
  $up = Start-Server
  Stop-Log -NoPause:$NoPause; exit 1
}
$up = Start-Server
$after = Get-VikunjaVersion
& $py -I (Join-Path $Tools 'healthcheck.py') --contract-only 2>&1 | ForEach-Object { "   $_" }
if ($up -and $after -eq $target -and $LASTEXITCODE -eq 0) {
  Ok "Vikunja updated: $current -> $target"
  @{ from = $current; to = $target; at = (Get-Date).ToString('s'); dbBefore = "vikunja.db.before-$target-$stamp" } | ConvertTo-Json | Set-Content (Join-Path $State 'last-vikunja-update.json')
  Remove-Item $test -Recurse -Force -ErrorAction SilentlyContinue
} else {
  Fail 'the updated server misbehaves: putting the previous version and database back'
  Stop-Server
  if (Get-VikunjaVersion) { Fail 'the server could not be stopped: restart the PC, then run rollback-vikunja.bat'; Stop-Log -NoPause:$NoPause; exit 1 }
  Copy-Item (Join-Path $Vk 'vikunja-previous.exe') (Join-Path $Vk 'vikunja.exe') -Force
  Copy-Item (Join-Path $Vk "db\vikunja.db.before-$target-$stamp") (Join-Path $Vk 'db\vikunja.db') -Force
  Remove-Item (Join-Path $Vk 'db\vikunja.db-wal'), (Join-Path $Vk 'db\vikunja.db-shm') -ErrorAction SilentlyContinue
  $up = Start-Server
  if ((Get-VikunjaVersion) -eq $current) { Ok "back on $current, nothing lost" } else { Fail 'could not restore: run rollback-vikunja.bat' }
}
Step 'Health check'
Invoke-HealthCheck
Stop-Log -NoPause:$NoPause
