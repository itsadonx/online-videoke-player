@echo off
setlocal
cd /d "%~dp0"

echo.
echo  OVP with phone remote — keep this window open.
echo  Player:  http://localhost:8080
echo  Remote:  http://localhost:8080/remote
echo.

set "NODE_DIR=%~dp0.tools\node"
set "NODE_EXE=%NODE_DIR%\node.exe"
set "NPM_CMD=%NODE_DIR%\npm.cmd"

if exist "%ProgramFiles%\nodejs\node.exe" (
  set "PATH=%ProgramFiles%\nodejs;%PATH%"
)
if exist "%LocalAppData%\Programs\nodejs\node.exe" (
  set "PATH=%LocalAppData%\Programs\nodejs;%PATH%"
)

if not exist "%NODE_EXE%" (
  echo Downloading portable Node.js into this folder. This is a one-time step...
  echo.
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-portable-node.ps1"
)

if exist "%NODE_EXE%" set "PATH=%NODE_DIR%;%PATH%"

if not exist "%NODE_EXE%" (
  where node >nul 2>nul
  if errorlevel 1 (
    echo Could not start: Node.js is missing.
    echo Install Node.js LTS from https://nodejs.org then run this file again.
    pause
    exit /b 1
  )
  set "NODE_EXE=node"
)

if not exist "node_modules\" (
  echo Installing dependencies...
  if exist "%NPM_CMD%" (
    call "%NPM_CMD%" install
  ) else (
    call npm install
  )
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

netstat -ano | findstr /C:":8080" | findstr LISTENING >nul
if not errorlevel 1 (
  echo OVP is already running.
  echo Opening http://localhost:8080 in your browser...
  start "" "http://localhost:8080"
  pause
  exit /b 0
)

echo Starting OVP...
echo Opening http://localhost:8080 in your browser...
start "" "http://localhost:8080"
echo.
"%NODE_EXE%" server.js
if errorlevel 1 (
  echo.
  echo Server stopped with an error.
)
pause
