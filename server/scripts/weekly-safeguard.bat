@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0weekly-safeguard.ps1" %*
