@echo off
chcp 65001 >nul
cd /d "%~dp0"
net session >nul 2>&1
if errorlevel 1 (
 powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
 exit /b
)
where py >nul 2>&1
if not errorlevel 1 (
 py -3 apply_patch.py
) else (
 python apply_patch.py
)
echo.
pause
