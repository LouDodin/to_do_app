@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0diagnose-power.ps1" %*
