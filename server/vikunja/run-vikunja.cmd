@echo off
rem Starts Vikunja. Run by the scheduled task "Vikunja" (as SYSTEM, at start-up).
rem Same settings as the Mac had (docker-compose.yml), plus security hardening:
rem   - sign-ups closed (the server is reachable from the internet through Tailscale Funnel)
rem   - CORS: only the app may call the API from a browser: https://<this PC>:8443 and,
rem     for the Windows quick capture (Ctrl+Alt+T) on this PC, http://127.0.0.1:5173
rem     (it was "*": any website could have used your session)
rem   - link sharing off (not used)
rem   - the log keeps only failed requests (every request used to be logged: ~2 GB a year)
rem Keep VIKUNJA_SERVICE_SECRET: changing it signs every device out and breaks API tokens.
cd /d "%~dp0"
set VIKUNJA_SERVICE_ROOTPATH=%~dp0
set VIKUNJA_SERVICE_INTERFACE=127.0.0.1:3456
set VIKUNJA_SERVICE_SECRET=REPLACE_WITH_YOUR_SECRET
rem Sessions (19 Nov 2026): a device stays signed in as long as it is used at least once a year
rem (the default was 30 days); each use extends it.
set VIKUNJA_SERVICE_JWTTTLLONG=31536000
set VIKUNJA_SERVICE_ENABLEREGISTRATION=false
set VIKUNJA_SERVICE_ENABLELINKSHARING=false
set VIKUNJA_DATABASE_TYPE=sqlite
set VIKUNJA_DATABASE_PATH=%~dp0db\vikunja.db
set VIKUNJA_FILES_BASEPATH=%~dp0files
set VIKUNJA_CORS_ENABLE=true
set "VIKUNJA_CORS_ORIGINS=http://127.0.0.1:5173"
set VIKUNJA_LOG_HTTPLEVEL=WARNING
if exist "%~dp0publicurl.txt" set /p VIKUNJA_SERVICE_PUBLICURL=<"%~dp0publicurl.txt"
rem App origin = public address without the final "/", on port 8443.
set "PU=%VIKUNJA_SERVICE_PUBLICURL%"
if defined PU if "%PU:~-1%"=="/" set "PU=%PU:~0,-1%"
if defined PU set "VIKUNJA_CORS_ORIGINS=%PU%:8443 http://127.0.0.1:5173"
"%~dp0vikunja.exe" >> "%~dp0vikunja.log" 2>&1
