# Run on the NEW PC, from the unpacked export (Documents\todo-server\scripts\setup-new-pc.bat).
# Installs what is missing (Python, Tailscale), then sets everything up with repair-services.
# See docs\MOVE-TO-NEW-PC.md for the whole procedure (and what to do on the old PC).
. "$PSScriptRoot\_common.ps1"
Assert-Admin $PSCommandPath
Start-Log 'setup-new-pc'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ProgressPreference = 'SilentlyContinue'
if ($Root -ne (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'todo-server')) { Warn "The folder is $Root; the usual place is Documents\todo-server (fine if you chose another)." }

Step 'Python'
if (Find-Python) { Ok (Find-Python) } else {
  $exe = Join-Path $env:TEMP 'python-setup.exe'
  Invoke-WebRequest 'https://www.python.org/ftp/python/3.13.3/python-3.13.3-amd64.exe' -OutFile $exe
  Start-Process $exe -ArgumentList '/quiet InstallAllUsers=1 PrependPath=1 Include_test=0' -Wait
  if (Find-Python) { Ok (Find-Python) } else { Fail 'Python did not install: install it from python.org, then run this again.'; Stop-Log; exit 1 }
}

Step 'Tailscale'
if (Test-Path $Ts) { Ok 'installed' } else {
  $exe = Join-Path $env:TEMP 'tailscale-setup.exe'
  Invoke-WebRequest 'https://pkgs.tailscale.com/stable/tailscale-setup-latest.exe' -OutFile $exe
  Start-Process $exe -Wait
}
Write-Host '   Sign in to Tailscale with your usual account if it asks (tray icon > Log in).'
Write-Host '   IMPORTANT: give this PC the old PC''s name so every device keeps working:'
Write-Host '   Tailscale admin console > Machines > old PC: remove it; new PC: ... > Edit machine name > pc-lou'
Read-Host '   Press Enter once Tailscale is connected and renamed' | Out-Null

Step 'Services'
& (Join-Path $PSScriptRoot 'repair-services.ps1') -NoPause
Step 'First backup on this PC'
if (Invoke-Backup) { Ok 'done' }
Stop-Log
