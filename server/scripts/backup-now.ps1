# Makes a backup of the database now (safe while the server runs). Backups: todo-server\backups (30 days kept).
param([switch]$NoPause)
. "$PSScriptRoot\_common.ps1"
Start-Log 'backup-now'
Step 'Backup'
if (Invoke-Backup) { Ok 'done' } else { Fail 'the backup failed (see above)' }
Get-ChildItem (Join-Path $Root 'backups') -Filter 'vikunja-*.db' | Sort-Object LastWriteTime -Descending | Select-Object -First 5 Name, LastWriteTime, @{n='MB';e={[math]::Round($_.Length/1MB,2)}} | Format-Table -AutoSize
Stop-Log -NoPause:$NoPause
