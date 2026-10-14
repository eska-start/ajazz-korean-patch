@echo off
REM AJAZZ Korean patch one-click installer (double-click to run)
REM Requests admin rights automatically via UAC.

net session >nul 2>&1
if %errorLevel% neq 0 (
    powershell -NoProfile -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

cd /d "%~dp0"
python apply_patch.py
echo.
pause
