@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0repair-services.ps1" %*
