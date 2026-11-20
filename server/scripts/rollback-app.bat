@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0rollback-app.ps1" %*
