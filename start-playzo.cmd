@echo off
rem PLAYZO local server: double-click to start. Serves http://localhost:5757 from this computer only.
rem Keep this window open while you play; closing it (or running stop-playzo.cmd) stops PLAYZO.
title PLAYZO server (http://localhost:5757)
cd /d "%~dp0"

where node >nul 2>nul || (echo Node.js is not installed. Install Node.js 22.5 or newer from https://nodejs.org & pause & exit /b 1)

rem Already running? Just open it.
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://localhost:5757/api/health; exit 0 } catch { exit 1 }"
if %errorlevel%==0 (
  echo PLAYZO is already running.
  start "" http://localhost:5757
  exit /b 0
)

if not exist node_modules (
  echo Installing dependencies...
  call npm install || (pause & exit /b 1)
)
if not exist dist\index.html (
  echo Building PLAYZO...
  call npm run build || (pause & exit /b 1)
)

rem Open the browser once the server answers.
start "" /min powershell -NoProfile -WindowStyle Hidden -Command "for ($i=0; $i -lt 60; $i++) { try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://localhost:5757/api/health | Out-Null; Start-Process 'http://localhost:5757'; break } catch { Start-Sleep -Milliseconds 500 } }"

echo Starting PLAYZO on http://localhost:5757 ...
echo Keep this window open while you play. Close it to stop PLAYZO.
call npm run serve:local
echo.
echo PLAYZO has stopped.
pause
