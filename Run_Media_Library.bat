@echo off
echo Starting Media Library Background Services...

:: Start the backend server minimized
start "Media Library Backend" /MIN cmd /c "cd /d "%~dp0backend" && node server.js"

:: Start the frontend server minimized
start "Media Library Frontend" /MIN cmd /c "cd /d "%~dp0frontend" && npm run dev"

:: Give Vite 3 seconds to spin up completely
timeout /t 3 /nobreak >nul

:: Open the site in the default browser!
start http://localhost:5173/

:: Close this launcher window automatically
exit
