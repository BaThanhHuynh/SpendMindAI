@echo off
title Khởi động Quản Lý Chi Tiêu (Docker & Cloudflare)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "start.ps1"
echo.
echo Nhấn phím bất kỳ để đóng cửa sổ này...
pause > nul
