@echo off
title Gemini Login
echo.
echo  Gemini CLI wird gestartet.
echo  1. Waehle "Login with Google" und melde dich mit deinem Google-AI-Pro-Konto an.
echo  2. Wenn die Gemini-Eingabe erscheint, beende mit /quit.
echo  3. Im Agent Store unter Einstellungen auf "Neu pruefen" klicken.
echo.
where gemini >nul 2>nul
if errorlevel 1 (
  echo Gemini CLI fehlt - wird installiert...
  call npm install -g @google/gemini-cli
)
call gemini
pause
