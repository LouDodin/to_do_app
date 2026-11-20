# Sends todo-server\_to_delete\ (filled by cleanup-pc-apply) to the Windows Recycle Bin, after you
# type YES. Nothing is erased for good: you can still restore it from the Recycle Bin.
. "$PSScriptRoot\_common.ps1"
Start-Log 'cleanup-pc-empty'
$bin = Join-Path $Root '_to_delete'
if (-not (Test-Path $bin)) { Ok 'nothing to empty (no _to_delete folder)'; Stop-Log; exit 0 }
Step 'Contents of _to_delete'
Get-ChildItem $bin -Recurse -File | ForEach-Object { '   {0}  ({1:N1} MB)' -f $_.FullName.Substring($bin.Length + 1), ($_.Length / 1MB) }
$total = (Get-ChildItem $bin -Recurse -File | Measure-Object Length -Sum).Sum / 1MB
Write-Host ('   total {0:N0} MB' -f $total)
$answer = Read-Host 'Type YES to send all of it to the Recycle Bin'
if ($answer -ne 'YES') { Warn 'nothing done'; Stop-Log; exit 0 }
Add-Type -AssemblyName Microsoft.VisualBasic
[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($bin, 'OnlyErrorDialogs', 'SendToRecycleBin')
if (Test-Path $bin) { Fail 'some files could not be moved to the Recycle Bin' } else { Ok 'sent to the Recycle Bin' }
Stop-Log
