# What runs on the PC (12 Nov 2026, Lou: "check that nothing useless opens or stays open, for the
# to-do or its upkeep, but let the PC work normally: updates and so on"). Run by healthcheck.py
# every hour (as SYSTEM); prints one JSON object. Read-only, except with -StopStuck, which stops:
#   - a run of one of the server's own scripts that has been going far too long (stuck);
#   - a second copy of one of the server's own listeners (it would act twice).
# It never stops anything that is not the server's own (Windows, updates, antivirus, your apps).
param([switch]$StopStuck)
$ErrorActionPreference = 'SilentlyContinue'
$Root = Split-Path -Parent $PSScriptRoot
$now = Get-Date
$self = $PID
$parent = (Get-CimInstance Win32_Process -Filter "ProcessId=$self").ParentProcessId

# The server's programs that run all the time (one copy each).
$Long = [ordered]@{ 'vikunja.exe' = 'Vikunja'; 'serve_app.py' = 'app server'; 'run_poller.py' = 'automations'; 'ntfy-listen.ps1' = 'phone alerts listener'; 'notify.ps1' = 'Windows notifier' }
# Also always running, one copy per account (started by run_poller.py): never stuck, never twice.
$PerAccount = @('webhook_listener.py')
# How long a run of the other scripts may last before it counts as stuck (minutes).
$Limit = @{ 'auto-update.ps1' = 45; 'healthcheck.py' = 30 }
$DefaultLimit = 180

$all = @(Get-CimInstance Win32_Process)
$ours = @()
foreach ($p in $all) {
  if ($p.ProcessId -in $self, $parent) { continue }
  $cl = [string]$p.CommandLine; $exe = [string]$p.ExecutablePath
  # Only the server's own: a program inside todo-server (vikunja.exe), or a script interpreter
  # (PowerShell, Python, cmd, wscript) running a script of todo-server. An editor or Notepad with a
  # todo-server file open is the user's, never counted, never stopped.
  $script = ''
  if ($exe -and $exe.StartsWith($Root, [StringComparison]::OrdinalIgnoreCase)) { $script = Split-Path -Leaf $exe }
  elseif ($p.Name -match '^(powershell|pwsh|python[w0-9.]*|py|cmd|wscript)\.exe$' -and $cl) {
    $m = [regex]::Match($cl, [regex]::Escape($Root) + '\\[^"]*?([^\\/"]+\.(ps1|py|bat|vbs))', 'IgnoreCase')
    if ($m.Success) { $script = $m.Groups[1].Value }
    # hidden.vbs only starts a listener and ends: the listener is what counts.
    if ($script -ieq 'hidden.vbs') { $script = '' }
  }
  if (-not $script) { continue }
  $ours += [pscustomobject]@{ Id = $p.ProcessId; Name = $p.Name; Script = $script; Start = $p.CreationDate; Mb = [math]::Round($p.WorkingSetSize / 1MB) }
}

$stopped = @(); $dups = @(); $stuck = @()
# Second copies of a listener: the oldest one stays (it is the one its scheduled task started).
foreach ($k in $Long.Keys) {
  $copies = @($ours | Where-Object { $_.Script -ieq $k -and $_.Name -notmatch '^(cmd|wscript)\.exe$' } | Sort-Object Start)
  if ($copies.Count -gt 1) {
    $extra = $copies | Select-Object -Skip 1
    $dups += "$($Long[$k]) x$($copies.Count)"
    # Vikunja and the app server hold a port: a second copy cannot start serving, it is left alone.
    if ($StopStuck -and $k -notin 'vikunja.exe', 'serve_app.py') {
      foreach ($x in $extra) { Stop-Process -Id $x.Id -Force; if ($?) { $stopped += "a second $($Long[$k])" } }
    }
  }
}
foreach ($o in $ours) {
  if ($Long.Contains($o.Script) -or $o.Script -in $PerAccount) { continue }
  $lim = if ($Limit.ContainsKey($o.Script)) { $Limit[$o.Script] } else { $DefaultLimit }
  $mins = ($now - $o.Start).TotalMinutes
  if ($mins -gt $lim) {
    $stuck += "$($o.Script) ($([math]::Round($mins)) min)"
    if ($StopStuck) { Stop-Process -Id $o.Id -Force; if ($?) { $stopped += "$($o.Script) (stuck for $([math]::Round($mins)) min)" } }
  }
}

# Other programs: processor over 10 seconds and memory, grouped by program. Windows itself,
# updates, the antivirus, the search index and the drivers are normal work: never reported.
$Normal = '^(Idle|System|Registry|Memory Compression|smss|csrss|wininit|winlogon|services|lsass|svchost|dwm|fontdrvhost|sihost|ctfmon|explorer|' +
  'MsMpEng|MpDefenderCoreService|NisSrv|MsSense|SecurityHealthService|SecurityHealthSystray|smartscreen|' +
  'TiWorker|TrustedInstaller|wuauclt|usocoreworker|MoUsoCoreWorker|WaaSMedicAgent|SIHClient|UsoClient|MicrosoftEdgeUpdate|GoogleUpdate|OfficeClickToRun|' +
  'SearchIndexer|SearchProtocolHost|SearchFilterHost|SearchHost|CompatTelRunner|WmiPrvSE|dllhost|audiodg|RuntimeBroker|backgroundTaskHost|taskhostw|' +
  'Taskmgr|tailscaled|tailscale-ipn|tailscale|spoolsv|SgrmBroker|WUDFHost|conhost|ShellExperienceHost|StartMenuExperienceHost|TextInputHost|LockApp|' +
  'NVDisplay\.Container|nvcontainer|igfxEM|RtkAudUService64|IntelCpHDCPSvc|IntelCpHeciSvc|OneDrive|vikunja|python|pythonw|powershell|pwsh|wscript)$'
$a = @{}; foreach ($p in Get-Process) { $a[$p.Id] = $p.CPU }
Start-Sleep -Seconds 10
$cores = [Environment]::ProcessorCount
$groups = @{}
foreach ($p in Get-Process) {
  $cpu = 0; if ($a.ContainsKey($p.Id) -and $p.CPU -ne $null -and $a[$p.Id] -ne $null) { $cpu = ($p.CPU - $a[$p.Id]) / 10 / $cores * 100 }
  $g = $groups[$p.ProcessName]; if (-not $g) { $g = @{ Cpu = 0.0; Mb = 0.0; N = 0 }; $groups[$p.ProcessName] = $g }
  $g.Cpu += [math]::Max(0, $cpu); $g.Mb += $p.WorkingSet64 / 1MB; $g.N++
}
$heavy = @()
foreach ($k in $groups.Keys) {
  if ($k -match $Normal) { continue }
  $g = $groups[$k]
  if ($g.Cpu -ge 15 -or $g.Mb -ge 1536) { $heavy += [pscustomobject]@{ name = $k; cpu = [math]::Round($g.Cpu); mb = [math]::Round($g.Mb) } }
}
$os = Get-CimInstance Win32_OperatingSystem
$memUsed = [math]::Round(100 - $os.FreePhysicalMemory / $os.TotalVisibleMemorySize * 100)
$oursMb = ($ours | Measure-Object Mb -Sum).Sum

# Programs that start with Windows and are switched on (Task Manager > Startup apps).
$startup = @()
foreach ($s in Get-CimInstance Win32_StartupCommand) {
  $on = $true
  $keys = @()
  $sid = $s.UserSID
  $loc = [string]$s.Location
  $sub = if ($loc -match 'Startup$|Démarrage$|Startup\b') { 'StartupFolder' } elseif ($loc -match 'Run') { if ($loc -match 'Wow6432') { 'Run32' } else { 'Run' } } else { '' }
  if ($sub) {
    if ($loc -match '^HKLM|^HKEY_LOCAL_MACHINE|Common Startup') { $keys += "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\$sub" }
    else { if ($sid) { $keys += "Registry::HKEY_USERS\$sid\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\$sub" } }
  }
  foreach ($k in $keys) {
    $v = (Get-ItemProperty -Path $k -Name $s.Name -ErrorAction SilentlyContinue).($s.Name)
    if (-not $v -and $sub -eq 'StartupFolder') { $v = (Get-ItemProperty -Path $k -Name ($s.Caption + '.lnk') -ErrorAction SilentlyContinue).($s.Caption + '.lnk') }
    if ($v -and ($v[0] % 2) -eq 1) { $on = $false }
  }
  if ($on) { $startup += [string]$s.Caption }
}

[pscustomobject]@{
  ours = @($ours | ForEach-Object { $_.Script } | Sort-Object -Unique)
  ours_mb = [int]$oursMb
  duplicates = $dups
  stuck = $stuck
  stopped = $stopped
  heavy = @($heavy | Sort-Object cpu -Descending)
  memory_used = $memUsed
  startup = @($startup | Sort-Object -Unique)
} | ConvertTo-Json -Depth 4 -Compress
