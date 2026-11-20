# Creates a Vikunja account on THIS server for someone else (sign-ups stay closed to the public).
# They then open the app address, sign in with it, and get an empty, private account
# (they cannot see your tasks, you do not see theirs in the app; see docs\SHARING.md for the limits).
#
# Two ways (26 Oct 2026):
#  - double-click create-user.bat at the PC: asks for the username, e-mail and a temporary password
#  - from the Mac, through Claude: requests\create-user.request holding "username|e-mail", run by
#    "Tasks auto-update" with -Username -Email -Generate. The PC then makes a random temporary
#    password itself and sends it ONLY to your Mac (Downloads, YYMMDD_Tasks-account-<username>.txt,
#    through the safeguard outbox). It is never written to a log or a result file, so Claude never
#    sees it.
param([string]$Username = '', [string]$Email = '', [switch]$Generate, [switch]$NoPause)
. "$PSScriptRoot\_common.ps1"
Start-Log 'create-user'
$Vk = Join-Path $Root 'vikunja'

if ($Generate) {
  if ($Username -notmatch '^[A-Za-z0-9._-]{3,40}$') { Fail "not a valid username: '$Username' (letters, digits, . _ -, 3 to 40)"; Stop-Log -NoPause; exit 1 }
  if ($Email -notmatch '^[^@\s|]+@[^@\s|]+\.[^@\s|]+$') { Fail "not a valid e-mail: '$Email'"; Stop-Log -NoPause; exit 1 }
  if (-not (Test-Path (Join-Path $State 'offsite-target.txt'))) { Fail 'the safeguard to the Mac is not set up (install-weekly-safeguard): the password could not reach you'; Stop-Log -NoPause; exit 1 }
  $u = $Username; $e = $Email
  # 16 characters, no look-alikes (0/O, 1/l/I).
  $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  $bytes = New-Object byte[] 16
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $plain = -join ($bytes | ForEach-Object { $chars[$_ % $chars.Length] })
} else {
  $u = Read-Host 'Username'
  $e = Read-Host 'Their e-mail'
  $p = Read-Host 'Temporary password (they should change it: Vikunja > Settings)' -AsSecureString
  $plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($p))
}

Step "Creating the account $u"
# Same settings as the running server, so the CLI writes into the right database.
foreach ($line in Get-Content (Join-Path $Vk 'run-vikunja.cmd')) { if ($line -match '^set (VIKUNJA_[A-Z_]+)=(.*)$' -and $Matches[2] -notmatch '%') { Set-Item "env:$($Matches[1])" $Matches[2] } }
$env:VIKUNJA_DATABASE_PATH = Join-Path $Vk 'db\vikunja.db'
$env:VIKUNJA_SERVICE_ROOTPATH = "$Vk\"
$env:VIKUNJA_SERVICE_PUBLICURL = (Get-Content (Join-Path $Vk 'publicurl.txt') | Select-Object -First 1)
$out = & (Join-Path $Vk 'vikunja.exe') user create --username $u --email $e --password $plain 2>&1 | Out-String
$code = $LASTEXITCODE
# Never show anything that could contain the password.
$shown = ($out -split "`r?`n" | Where-Object { $_ -and $_ -notmatch 'password' -and ($plain -eq '' -or $_ -notlike "*$plain*") })
$shown | ForEach-Object { "   $_" }
if ($code -ne 0 -or $out -match '(?i)already exists|already taken|is taken') {
  $plain = $null
  Fail "the account $u was not created (see above: the username or e-mail may already be used)"
  Stop-Log -NoPause:($NoPause -or $Generate)
  exit 1
}
Ok "account $u created ($e)"
$name = Get-TsName
if (-not $name) { $name = ([uri]$env:VIKUNJA_SERVICE_PUBLICURL).Host }

if ($Generate) {
  Step 'Sending the temporary password to your Mac'
  $file = Join-Path (Join-Path $State 'offsite-outbox') ('{0}_Tasks-account-{1}.txt' -f (Get-Date -Format 'yyMMdd'), $u)
  New-Item -ItemType Directory -Force (Split-Path $file) | Out-Null
  @(
    "Tasks: new account for $e"
    ''
    "App:                 https://${name}:8443"
    "Username:            $u"
    "Temporary password:  $plain"
    ''
    'To give them (by a private channel), with the User guide (docs\Tasks-user-guide.pdf):'
    "  1. Open https://${name}:8443 and sign in with the username and temporary password."
    '  2. Install the app (User guide, section 1).'
    "  3. Change the password: open https://$name (the server's own pages), sign in, Settings."
    '     Turning on two-factor authentication there is recommended.'
    ''
    'Delete this file once you have passed the password on.'
  ) | Set-Content -Encoding utf8 $file
  $plain = $null
  Start-ScheduledTask -TaskName 'Tasks weekly safeguard' -ErrorAction SilentlyContinue
  Ok "the password goes to your Mac's Downloads as $(Split-Path $file -Leaf) (now if it is awake, else when it wakes)"
} else {
  $plain = $null
  Write-Host ''
  Write-Host "Send them:  app https://${name}:8443   -   server address https://$name   -   username $u"
  Write-Host 'They should set up: Settings (in Vikunja) > change password, and turn on two-factor authentication.'
}
Stop-Log -NoPause:($NoPause -or $Generate)
