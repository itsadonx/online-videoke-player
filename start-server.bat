@echo off
cd /d "%~dp0"
echo.
echo  OVP with phone remote — keep this window open.
echo  Player:  http://localhost:8080
echo  Remote:  http://localhost:8080/remote
echo.
where npm >nul 2>nul
if errorlevel 1 (
  echo npm not found. Install Node.js from https://nodejs.org then run: npm install ^&^& npm start
  pause
  exit /b 1
)
if not exist "node_modules\" (
  echo Installing dependencies...
  call npm install
)
call npm start
pause
