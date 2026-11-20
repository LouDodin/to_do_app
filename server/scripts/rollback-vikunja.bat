@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0rollback-vikunja.ps1" %*
