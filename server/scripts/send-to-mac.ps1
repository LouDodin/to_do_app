# Sends a file to your Mac with Tailscale (Taildrop), without the right-click menu.
# Default: Downloads\automations-for-mac.zip. Other file: drag it onto send-to-mac.bat.
param([string]$File = '')
. "$PSScriptRoot\_common.ps1"
Start-Log 'send-to-mac'
if (-not $File) { $File = Join-Path $env:USERPROFILE 'Downloads\automations-for-mac.zip' }
if (-not (Test-Path $File)) { Fail "file not found: $File"; Stop-Log; exit 1 }
$st = & $Ts status --json | ConvertFrom-Json
$macs = @($st.Peer.PSObject.Properties.Value | Where-Object { $_.OS -eq 'macOS' })
if (-not $macs) { Fail 'no Mac found in your Tailscale network'; Stop-Log; exit 1 }
$mac = $macs | Sort-Object { -not $_.Online } | Select-Object -First 1
$name = $mac.DNSName.Split('.')[0]
if (-not $mac.Online) { Warn "$name looks offline: wake it up and open Tailscale on it" }
Write-Host "   sending $(Split-Path $File -Leaf) to $name ..."
& $Ts file cp $File "$($mac.TailscaleIPs[0]):" 2>&1 | ForEach-Object { "   $_" }
if ($LASTEXITCODE -eq 0) { Ok "sent. On the Mac it arrives in Downloads (Tailscale may show a notification)." }
else { Fail 'not sent (see the message above)' }
Stop-Log
