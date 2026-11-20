# Makes Documents\tasks-starter-kit-<date>.zip: everything someone needs to host THEIR OWN server with
# this app on their Windows PC - WITHOUT any of your data, secrets or tokens (fresh empty database,
# a new secret generated on their PC). Give it with docs\SHARING.md (section "Their own server").
. "$PSScriptRoot\_common.ps1"
Start-Log 'make-starter-kit'
$stage = Join-Path $env:TEMP ("tasks-kit-" + (Get-Date -Format 'yyyyMMddHHmmss'))
$dst = Join-Path $stage 'todo-server'
New-Item -ItemType Directory -Force $dst, (Join-Path $dst 'vikunja\db'), (Join-Path $dst 'vikunja\files'), (Join-Path $dst 'state'), (Join-Path $dst 'backups') | Out-Null
foreach ($d in 'app', 'app-source', 'tools', 'scripts', 'docs') { if (Test-Path (Join-Path $Root $d)) { Copy-Item (Join-Path $Root $d) $dst -Recurse } }
Copy-Item (Join-Path $Vk 'vikunja.exe') (Join-Path $dst 'vikunja')
# Settings file with the secret replaced by a placeholder (repair-services makes a new one there).
(Get-Content (Join-Path $Vk 'run-vikunja.cmd')) -replace '^set VIKUNJA_SERVICE_SECRET=.*$', 'set VIKUNJA_SERVICE_SECRET=CHANGE_ME_SECRET' | Set-Content (Join-Path $dst 'vikunja\run-vikunja.cmd') -Encoding ascii
Remove-Item (Join-Path $dst 'scripts\make-starter-kit.*') -ErrorAction SilentlyContinue
$zip = Join-Path ([Environment]::GetFolderPath('MyDocuments')) ("tasks-starter-kit-{0}.zip" -f (Get-Date -Format 'yyyy-MM-dd'))
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path $dst -DestinationPath $zip
Remove-Item $stage -Recurse -Force
Ok ("{0} ({1:N0} MB) - contains no data, no secret, no token." -f $zip, ((Get-Item $zip).Length / 1MB))
Stop-Log
