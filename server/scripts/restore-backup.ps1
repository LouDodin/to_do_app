# Puts a backup of the database back (the newest one, or the one you choose in the list).
# The current database is kept as db\vikunja.db.before-restore-<date> first, so this can be undone.
. "$PSScriptRoot\_common.ps1"
Assert-Admin $PSCommandPath
Start-Log 'restore-backup'
$all = Get-ChildItem (Join-Path $Root 'backups') -Filter 'vikunja-*.db' | Sort-Object LastWriteTime -Descending
if (-not $all) { Fail 'no backup found'; Stop-Log; exit 1 }
$i = 0; $all | Select-Object -First 15 | ForEach-Object { Write-Host ("  [{0}] {1}  ({2:N1} MB)" -f $i++, $_.Name, ($_.Length / 1MB)) }
$pick = Read-Host 'Number of the backup to restore (Enter = 0, the newest; anything else cancels)'
if ($pick -eq '') { $pick = '0' }
if ($pick -notmatch '^\d+$' -or [int]$pick -ge $all.Count) { Write-Host 'Cancelled.'; Stop-Log; exit 0 }
$b = $all[[int]$pick]
Warn "Tasks changed after $($b.LastWriteTime) will be replaced by this backup."
if ((Read-Host 'Type YES to restore') -ne 'YES') { Write-Host 'Cancelled.'; Stop-Log; exit 0 }
Stop-Server
if (Get-VikunjaVersion) { Fail 'the server could not be stopped: restart the PC and run this again. Nothing changed.'; Stop-Log; exit 1 }
$keep = Join-Path $Vk ("db\vikunja.db.before-restore-{0}" -f (Get-Date -Format 'yyyyMMdd-HHmm'))
if (-not (Copy-Database (Join-Path $Vk 'db\vikunja.db') $keep)) { Fail 'could not keep a copy of the current database: stopping, nothing changed.'; $up = Start-Server; Stop-Log; exit 1 }
Remove-Item (Join-Path $Vk 'db\vikunja.db-wal'), (Join-Path $Vk 'db\vikunja.db-shm') -ErrorAction SilentlyContinue
Copy-Item $b.FullName (Join-Path $Vk 'db\vikunja.db') -Force
Ok "restored $($b.Name) (previous database kept as $(Split-Path $keep -Leaf))"
$up = Start-Server
Write-Host 'On each device, the app reloads the data within a few minutes (or reopen it).'
Stop-Log
