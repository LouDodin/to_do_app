@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0cleanup-pc-empty.ps1" %*
