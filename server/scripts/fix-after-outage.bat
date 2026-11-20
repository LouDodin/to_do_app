@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0fix-after-outage.ps1" %*
