@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0send-to-mac.ps1" %*
