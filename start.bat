@echo off
setlocal

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [Sticky Markdown Note] Node.js was not found.
  echo Install Node.js for Windows, then run this file again.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [Sticky Markdown Note] npm was not found.
  echo Install Node.js for Windows, then run this file again.
  pause
  exit /b 1
)

where cargo >nul 2>nul
if errorlevel 1 (
  echo [Sticky Markdown Note] Rust/Cargo was not found.
  echo Install Rust for Windows, then run this file again.
  pause
  exit /b 1
)

if not exist "node_modules\.bin\tauri.cmd" (
  echo [Sticky Markdown Note] Installing Windows npm dependencies...
  npm install
  if errorlevel 1 (
    echo [Sticky Markdown Note] npm install failed.
    pause
    exit /b 1
  )
)

set PORT_PID=
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":1420 .*LISTENING"') do set PORT_PID=%%P
if defined PORT_PID (
  echo [Sticky Markdown Note] Port 1420 is already in use by PID %PORT_PID%.
  echo Close the existing Sticky Markdown Note dev app, or run:
  echo   taskkill /PID %PORT_PID% /T /F
  pause
  exit /b 1
)

if "%SMN_DRY_RUN%"=="1" (
  echo [Sticky Markdown Note] Dry run passed.
  exit /b 0
)

echo [Sticky Markdown Note] Starting Tauri dev app...
npm run tauri:dev
set EXIT_CODE=%errorlevel%

if not "%EXIT_CODE%"=="0" (
  echo [Sticky Markdown Note] App exited with code %EXIT_CODE%.
  pause
)

exit /b %EXIT_CODE%
