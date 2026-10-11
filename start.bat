@echo off
title Agent Store
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js wurde nicht gefunden. Bitte von https://nodejs.org installieren.
  pause
  exit /b 1
)
if "%PORT%"=="" set PORT=4777
start "" http://localhost:%PORT%
node server\index.js
pause
