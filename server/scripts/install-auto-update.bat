@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-auto-update.ps1" %*
