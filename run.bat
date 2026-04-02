@echo off
setlocal

cd /d "%~dp0"

python tools\build_bundle.py
if errorlevel 1 (
  echo Failed to build app.bundle.js
  pause
  exit /b 1
)

start "F1 Local Server" cmd /k python -m http.server 8000
timeout /t 2 /nobreak >nul
start "" http://127.0.0.1:8000/index.html
