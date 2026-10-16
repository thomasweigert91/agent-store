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
if not "%AGY%"=="agy" if not exist "%AGY%" set "AGY=%LOCALAPPDATA%\agy\bin\agy.exe"
if not "%AGY%"=="agy" if not exist "%AGY%" set "AGY=%LOCALAPPDATA%\Antigravity\agy.exe"
if not exist "%AGY%" if not "%AGY%"=="agy" (
  echo Antigravity CLI ^(agy^) nicht gefunden - die Desktop-App allein reicht nicht.
  echo In PowerShell installieren:  irm https://antigravity.google/cli/install.ps1 ^| iex
  pause
  exit /b 1
)
"%AGY%"
pause
