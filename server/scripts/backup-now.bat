@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0backup-now.ps1" %*
