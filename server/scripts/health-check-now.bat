@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0health-check-now.ps1" %*
