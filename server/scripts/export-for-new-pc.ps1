# Packs everything needed to rebuild the server on another PC into ONE zip:
#   Documents\todo-server-export-<date>.zip
# (database backup made now, settings, app, tools, scripts, docs; not the logs nor old versions).
# Copy that zip to the new PC and follow docs\MOVE-TO-NEW-PC.md. Keep it private: it holds your data
# and the server secret.
. "$PSScriptRoot\_common.ps1"
Start-Log 'export-for-new-pc'
Step 'Fresh backup'
if (-not (Invoke-Backup)) { Fail 'backup failed: stopping'; Stop-Log; exit 1 }
Step 'Packing'
$zip = New-ExportZip ([Environment]::GetFolderPath('MyDocuments'))
Ok ("{0} ({1:N0} MB)" -f $zip, ((Get-Item $zip).Length / 1MB))
Write-Host '   Next: copy it to the new PC and follow docs\MOVE-TO-NEW-PC.md'
Stop-Log
