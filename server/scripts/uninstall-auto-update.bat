@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall-auto-update.ps1" %*
