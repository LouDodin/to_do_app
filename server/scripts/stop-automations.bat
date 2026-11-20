@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop-automations.ps1" %*
