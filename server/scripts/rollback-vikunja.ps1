# Undoes the last Vikunja update: the previous program AND the database as it was just before
# the update. Changes made since the update are lost (a backup of them is kept).
. "$PSScriptRoot\_common.ps1"
Assert-Admin $PSCommandPath
Start-Log 'rollback-vikunja'
$info = Get-Content (Join-Path $State 'last-vikunja-update.json') -Raw -ErrorAction SilentlyContinue | ConvertFrom-Json
if (-not $info -or -not (Test-Path (Join-Path $Vk 'vikunja-previous.exe'))) { Fail 'no update to undo'; Stop-Log; exit 1 }
Write-Host "Last update: $($info.from) -> $($info.to) on $($info.at)"
Warn 'Tasks changed since then will be lost (they stay in a backup).'
if ((Read-Host 'Type YES to go back') -ne 'YES') { Write-Host 'Cancelled, nothing changed.'; Stop-Log; exit 0 }
Invoke-Backup | Out-Null
Stop-Server
if (Get-VikunjaVersion) { Fail 'the server could not be stopped: restart the PC and run this again. Nothing changed.'; Stop-Log; exit 1 }
Copy-Item (Join-Path $Vk 'vikunja-previous.exe') (Join-Path $Vk 'vikunja.exe') -Force
Copy-Item (Join-Path $Vk "db\$($info.dbBefore)") (Join-Path $Vk 'db\vikunja.db') -Force
Remove-Item (Join-Path $Vk 'db\vikunja.db-wal'), (Join-Path $Vk 'db\vikunja.db-shm') -ErrorAction SilentlyContinue
$up = Start-Server
Ok "now running $(Get-VikunjaVersion)"
Remove-Item (Join-Path $State 'last-vikunja-update.json')
Stop-Log
