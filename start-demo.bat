@echo off
rem CipherCam - double-click me to start the demo (Windows).
cd /d "%~dp0"
title CipherCam server - keep this window open
where node >nul 2>nul
if errorlevel 1 goto nonode
if exist node_modules goto run
echo.
echo   First start: installing CipherCam. This needs internet once, about 1 minute...
echo.
call npm install
if errorlevel 1 goto installfail
:run
call npm run demo
echo.
echo   CipherCam has stopped.
pause
exit /b 0
:nonode
echo.
echo   Node.js was not found on this computer.
echo   Install Node.js LTS from nodejs.org, then double-click start-demo.bat again.
echo.
pause
exit /b 1
:installfail
echo.
echo   npm install failed. Check the internet connection and try again.
echo.
pause
exit /b 1
