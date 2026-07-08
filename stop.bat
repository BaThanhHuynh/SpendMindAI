@echo off
title Dừng Quản Lý Chi Tiêu (Docker & Cloudflare)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "stop.ps1"
echo.
echo Nhấn phím bất kỳ để đóng cửa sổ này...
pause > nul
