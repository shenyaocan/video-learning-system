@echo off
title Video Learning System

echo ========================================
echo   Video Learning System Starting...
echo ========================================
echo.

echo [Step 1/4] Checking Python...
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found in PATH.
    echo.
    echo Please install Python from https://python.org
    echo Make sure to check "Add Python to PATH" during installation.
    echo.
    pause
    exit /b 1
)
echo OK - Python is available.

echo.
echo [Step 2/4] Checking Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found in PATH.
    echo.
    echo Please install Node.js from https://nodejs.org
    echo.
    pause
    exit /b 1
)
echo OK - Node.js is available.

echo.
echo [Step 3/4] Installing dependencies...
echo   - Python (flask, flask-cors)...
python -m pip install flask flask-cors -q 2>&1
if errorlevel 1 (
    echo   [WARN] pip install failed. Dependencies may already be installed.
) else (
    echo   OK
)
echo   - Frontend (npm packages)...
cd /d "%~dp0frontend"
call npm install --silent >nul 2>&1
if errorlevel 1 (
    echo   [WARN] npm install had issues. Continuing anyway...
) else (
    echo   OK
)
cd /d "%~dp0"

echo.
echo [Step 4/4] Starting servers...
echo.
echo   Backend  : http://localhost:5010
echo   Frontend : http://localhost:3000
echo.
echo ========================================
echo   Launching...
echo ========================================

start "Video-Backend" cmd /k "cd /d "%~dp0backend" && python app.py"
timeout /t 3 /nobreak >nul
start "Video-Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

timeout /t 3 /nobreak >nul
start http://localhost:3000

echo.
echo System started! 
echo Close the backend and frontend windows to stop the servers.
echo.
pause
