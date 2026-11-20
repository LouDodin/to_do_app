# Windows quick capture: Ctrl+Alt+T from anywhere opens a small "New task" window (Enter adds the
# task to the Inbox, the window closes). Creates a Start-menu shortcut with that hot key, opening
# the app's /quick-add page in a bare Brave (or Edge) app window. Sign in once in that window.
# It uses the app's local address on this PC (http://127.0.0.1:5173): browsers on the server PC
# itself cannot reliably reach its own public Funnel address (that gave "500 Internal Error").
param([switch]$NoPause)
. "$PSScriptRoot\_common.ps1"
Start-Log 'install-windows-quick-capture'
$url = 'http://127.0.0.1:5173/quick-add'
$browser = @(
  "${env:ProgramFiles}\BraveSoftware\Brave-Browser\Application\brave.exe",
  "${env:ProgramFiles(x86)}\BraveSoftware\Brave-Browser\Application\brave.exe",
  "${env:LOCALAPPDATA}\BraveSoftware\Brave-Browser\Application\brave.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles}\Microsoft\Edge\Application\msedge.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $browser) { Fail 'Neither Brave nor Edge found.'; Stop-Log -NoPause:$NoPause; exit 1 }
$lnk = Join-Path ([Environment]::GetFolderPath('Programs')) 'Tasks - New task.lnk'
$sh = New-Object -ComObject WScript.Shell
$s = $sh.CreateShortcut($lnk)
$s.TargetPath = $browser
$s.Arguments = "--app=$url --window-size=680,320"
$s.Hotkey = 'CTRL+ALT+T'
$s.Description = 'New task in the Inbox'
$ico = Join-Path $Tools 'tasks.ico'
if (Test-Path $ico) { $s.IconLocation = "$ico,0" }
$s.Save()
Ok "Ctrl+Alt+T now opens $url (shortcut: $lnk)"
Write-Host '   First time: the window asks you to sign in (server address already filled in).'
Write-Host '   If the key does nothing, sign out and back in to Windows once (Windows reads hot keys at log-on).'
Stop-Log -NoPause:$NoPause
