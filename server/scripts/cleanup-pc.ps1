# Tidies the PC after the move from the Mac. By default it only LISTS what it would do.
# With -Apply (cleanup-pc.bat apply) it MOVES things, it never deletes:
#   - setup scripts and their results  -> todo-server\setup-history\   (kept: they document the setup)
#   - leftovers no longer needed        -> todo-server\_to_delete\<date>\  (delete that folder yourself
#                                          once you are sure; everything in it is listed in the log)
# It never touches the database, backups, the live app or anything outside the list below.
param([switch]$Apply)
. "$PSScriptRoot\_common.ps1"
Start-Log 'cleanup-pc'
$dl = Join-Path $env:USERPROFILE 'Downloads'
$bin = Join-Path $Root ("_to_delete\" + (Get-Date -Format 'yyyy-MM-dd'))
$hist = Join-Path $Root 'setup-history'
$plan = @()
function Plan($Path, $Dest, $Why) { if (Test-Path -LiteralPath $Path) { $script:plan += [pscustomobject]@{ Path = $Path; Dest = $Dest; Why = $Why } } }

# Setup scripts of 9 Oct 2026 (one-off, replaced by scripts\*)
Get-ChildItem $Root -File | Where-Object { $_.Name -match '^[0-5]-' -or $_.Name -in 'check-result.txt' } | ForEach-Object { Plan $_.FullName $hist 'one-off setup script / result (kept for reference)' }
# Already unpacked / duplicates
Plan (Join-Path $Root 'app-build.zip') $bin 'already unpacked into app\'
Plan (Join-Path $Root 'app-source.zip') $bin 'already unpacked into app-source\'
Plan (Join-Path $Vk 'bin') $bin 'duplicate of vikunja.exe from the first download (46 MB)'
Plan (Join-Path $Root 'app-failed') $bin 'a version that failed to deploy'
Plan (Join-Path $Root 'app-rolledback') $bin 'leftover of a rollback'
# Transfers from the Mac (the data now lives in vikunja\db, and is backed up every night)
Plan (Join-Path $dl 'vikunja.zip') $bin 'copy of the Mac Vikunja folder sent on 9 Oct (contains the server secret)'
Plan (Join-Path $dl 'tasks-app-v1-source.zip') $bin 'copy of the app source sent from the Mac (now in app-source\)'
Plan (Join-Path $env:TEMP 'tailscale-setup-latest.exe') $bin 'Tailscale installer'
# The Mac automation package (holds the API token): only once the PC runs them
if (Test-Path $AutoEnabled) {
  Plan (Join-Path $dl 'vikunja-automation-for-pc.zip') $bin 'Mac automation package, installed in automations\ (holds the API token)'
  Plan (Join-Path $dl 'automations-for-mac.zip') $bin 'package sent to the Mac (a copy stays in mac\automations-for-mac\)'
  Plan (Join-Path $Auto 'initial-state') $hist 'the Mac state used once at install (the live state is in state\automations\)'
  Plan (Join-Path $Root 'mac\2-retarget-automations.command') $hist 'done: the Mac automations point at the PC and run folders only'
}
Get-ChildItem $dl -Force -File -Filter '~$GPROD_*.pptx' -ErrorAction SilentlyContinue | ForEach-Object { Plan $_.FullName $bin 'stale PowerPoint lock file from Nov 2023 (left by a crash; not a document)' }
# One-off scripts and reports of 10 Oct (done; kept for reference)
foreach ($f in 'MORNING.bat', 'MORNING.ps1', 'REPORT-2026-10-10.md') { Plan (Join-Path $Root $f) $hist 'one-off of 10 Oct (done; kept for reference)' }
foreach ($f in 'fix-quick-capture.bat', 'fix-quick-capture.ps1', 'fix-groceries-filter.bat', 'fix-groceries-filter.ps1') { Plan (Join-Path $PSScriptRoot $f) $hist 'one-off fix of 10 Oct (done; kept for reference)' }
Plan (Join-Path $Tools 'fix_groceries_filter.py') $hist 'one-off fix of 10 Oct (done; kept for reference)'
# Settings file already installed (repair-services installs a .next file only when there is one)
$nextCmd = Join-Path $Vk 'run-vikunja.cmd.next'
if ((Test-Path $nextCmd) -and ((Get-FileHash $nextCmd).Hash -eq (Get-FileHash (Join-Path $Vk 'run-vikunja.cmd')).Hash)) { Plan $nextCmd $bin 'identical to the installed run-vikunja.cmd' }
# Old copies of the server settings (the newest one is kept, for undo)
Get-ChildItem $Vk -File -Filter 'run-vikunja.cmd.before-*' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -Skip 1 | ForEach-Object { Plan $_.FullName $bin 'older copy of the server settings (the newest is kept)' }
# Script logs older than 90 days (health.log is kept: one line per hour)
Get-ChildItem $Logs -File -Filter '*.txt' -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-90) } | ForEach-Object { Plan $_.FullName $bin 'script log over 90 days old' }
# Old Vikunja versions downloaded by update-vikunja (keep the two newest)
$versions = Join-Path $Vk 'versions'
if (Test-Path $versions) { Get-ChildItem $versions -Directory | Sort-Object LastWriteTime -Descending | Select-Object -Skip 2 | ForEach-Object { Plan $_.FullName $bin 'old downloaded Vikunja version' } }
# Database copies made before updates / restores, older than 60 days
Get-ChildItem (Join-Path $Vk 'db') -File -Filter 'vikunja.db.before-*' -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-60) } | ForEach-Object { Plan $_.FullName $bin 'database copy from before an update/restore, over 60 days old' }

Step ($(if ($Apply) { 'Moving' } else { 'Would move (nothing changed: run cleanup-pc-apply.bat to do it)' }))
if (-not $plan) { Ok 'nothing to tidy' }
foreach ($p in $plan) {
  $size = if (Test-Path -LiteralPath $p.Path -PathType Leaf) { '{0:N1} MB' -f ((Get-Item -LiteralPath $p.Path -Force).Length / 1MB) } else { 'folder' }
  Write-Host ("   {0}`n      -> {1}  ({2}; {3})" -f $p.Path, $p.Dest, $p.Why, $size)
  if ($Apply) {
    New-Item -ItemType Directory -Force $p.Dest | Out-Null
    try { Move-Item -LiteralPath $p.Path -Destination $p.Dest -Force -ErrorAction Stop } catch { Warn "could not move: $_" }
  }
}
if ($Apply -and $plan) { Ok "done. When you are sure, cleanup-pc-empty.bat sends the _to_delete folder to the Recycle Bin." }
Stop-Log
