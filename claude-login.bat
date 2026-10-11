@echo off
title Claude Login
echo.
echo  Claude Code wird gestartet.
echo  Falls du noch nicht eingeloggt bist: mit deinem Claude-Konto (Pro/Max) anmelden.
echo  Danach mit /exit beenden.
echo.
where claude >nul 2>nul
if errorlevel 1 (
  echo Claude Code fehlt. Installation: https://claude.com/claude-code
  pause
  exit /b 1
)
call claude
pause
