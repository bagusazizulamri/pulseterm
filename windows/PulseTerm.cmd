@echo off
setlocal enabledelayedexpansion

title PulseTerm Portable

set "BASE_DIR=%~dp0"
set "BASE_DIR=%BASE_DIR:~0,-1%"

echo ========================================================
echo  PulseTerm - Retro Terminal Audio Player (Portable)
echo ========================================================
echo.

:: Detect Python
set "PY_BIN="
if exist "%BASE_DIR%\runtime\python.exe" set "PY_BIN=%BASE_DIR%\runtime\python.exe"
if not defined PY_BIN if exist "%BASE_DIR%\venv\Scripts\python.exe" set "PY_BIN=%BASE_DIR%\venv\Scripts\python.exe"
if not defined PY_BIN if exist "%BASE_DIR%\python\python.exe" set "PY_BIN=%BASE_DIR%\python\python.exe"
if not defined PY_BIN (
    for /f "delims=" %%I in ('where python 2^>nul') do (
        if not defined PY_BIN set "PY_BIN=%%I"
    )
)

if not defined PY_BIN (
    echo [ERROR] Python not found! Please place a portable Python inside '%BASE_DIR%\runtime' or install Python on your system.
    pause
    exit /b 1
)

echo [OK] Using Python: %PY_BIN%
echo [INFO] Starting PulseTerm backend server on http://127.0.0.1:3000 ...

:: Launch backend in new background window or detached
start "PulseTerm Core" /min "%PY_BIN%" "%BASE_DIR%\backend\main.py"

:: Wait a brief moment for server to bind port
timeout /t 2 /nobreak >nul

:: Launch browser in dedicated app-window mode if Chromium browser exists
set "EDGE_EXE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE_EXE%" set "EDGE_EXE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"

if exist "%EDGE_EXE%" (
    start "" "%EDGE_EXE%" --app=http://127.0.0.1:3000
) else (
    start http://127.0.0.1:3000
)

echo [OK] PulseTerm launched successfully.
