# READ-ONLY. How this PC reaches its own public addresses (for Claude). Changes nothing.
. "$PSScriptRoot\_common.ps1"
Start-Log 'diagnose-local'
$name = Get-TsName
Step "Name: $name"
try { Resolve-DnsName $name -ErrorAction Stop | Format-Table -AutoSize | Out-String } catch { Warn "DNS: $_" }
& $Ts ip 2>&1 | ForEach-Object { "   tailscale ip: $_" }
Step 'Serve / Funnel'
& $Ts serve status 2>&1 | ForEach-Object { "   $_" }
foreach ($u in "https://${name}:8443/quick-add", "https://$name/api/v1/info", 'http://127.0.0.1:5173/quick-add', 'http://127.0.0.1:3456/api/v1/info') {
  Step $u
  & curl.exe -sS -o NUL -w "   HTTP %{http_code}  ip %{remote_ip}  ssl_verify %{ssl_verify_result}`n" --max-time 15 $u 2>&1 | ForEach-Object { "   $_" }
  & curl.exe -sS --max-time 15 $u 2>&1 | Select-Object -First 5 | ForEach-Object { "   body: $_" }
}
Step 'Proxy settings'
netsh winhttp show proxy | ForEach-Object { "   $_" }
Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' -ErrorAction SilentlyContinue | Select-Object ProxyEnable, ProxyServer, AutoConfigURL | Format-List | Out-String
Stop-Log
