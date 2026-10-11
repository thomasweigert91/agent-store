@echo off
title Antigravity Login (Gemini)
echo.
echo  Antigravity CLI (agy) wird gestartet - der Nachfolger der Gemini CLI.
echo  1. Falls gefragt: mit deinem Google-AI-Pro-Konto anmelden.
echo  2. Wenn die Eingabe erscheint, mit /exit beenden.
echo  3. Im Agent Store unter Einstellungen auf "Neu pruefen" klicken.
echo.
set "AGY=agy"
where agy >nul 2>nul
if errorlevel 1 set "AGY=%USERPROFILE%\.gemini\bin\agy.exe"
if not exist "%AGY%" if not "%AGY%"=="agy" (
  echo Antigravity CLI nicht gefunden. Bitte von https://antigravity.google installieren.
  pause
  exit /b 1
)
"%AGY%"
pause
