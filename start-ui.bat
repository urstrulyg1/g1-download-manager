@echo off
setlocal enabledelayedexpansion

REM ==============================================================================
REM G1DM — Next-Generation Production-Grade Internet Download Manager
REM Universal UI & Core Engine Launcher (Windows)
REM ==============================================================================

title G1DM — Internet Download Manager Core Service

echo ===============================================================================
echo.
echo      ⚡ G1DM — Next-Generation Internet Download Manager
echo         Universal Core Engine & High-Performance Web UI
echo.
echo ===============================================================================
echo.

cd /d "%~dp0"

REM 1. Check Node.js and npm
echo [1/4] Checking system prerequisites...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: Node.js is not installed or not in PATH.
    echo Please install Node.js (v18 or newer) from https://nodejs.org
    pause
    exit /b 1
)

where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: npm is not installed or not in PATH.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node -v') do set NODE_VER=%%v
echo [OK] Node.js detected: %NODE_VER%
echo.

REM 2. Install dependencies if node_modules is missing
echo [2/4] Verifying and installing dependencies...
if not exist "node_modules\" (
    echo node_modules missing. Running npm install...
    call npm install
    if %errorlevel% neq 0 (
        echo Error: npm install failed.
        pause
        exit /b %errorlevel%
    )
) else (
    echo [OK] Dependencies already installed.
)
echo.

REM 3. Build backend & frontend
echo [3/4] Building G1DM backend & frontend...
if not exist "dist\main\" (
    call npm run build
    if %errorlevel% neq 0 (
        echo Error: Build failed.
        pause
        exit /b %errorlevel%
    )
) else (
    call npm run build:backend
)
echo [OK] Build verified.
echo.

if exist "resources\native-host\install-host.bat" (
    call resources\native-host\install-host.bat >nul
    echo [OK] Configured native-host integration for available browsers.
)

if "%PORT%"=="" set PORT=8055
set URL=http://127.0.0.1:%PORT%
set /a BROWSER_COUNT=0

set /a BROWSER_COUNT+=1
set "BROWSER_NAME_!BROWSER_COUNT!=Default browser"
set "BROWSER_CMD_!BROWSER_COUNT!=start """

where chrome >nul 2>nul
if %errorlevel% equ 0 (
    set /a BROWSER_COUNT+=1
    set "BROWSER_NAME_!BROWSER_COUNT!=Google Chrome"
    set "BROWSER_CMD_!BROWSER_COUNT!=start "" chrome"
)
where msedge >nul 2>nul
if %errorlevel% equ 0 (
    set /a BROWSER_COUNT+=1
    set "BROWSER_NAME_!BROWSER_COUNT!=Microsoft Edge"
    set "BROWSER_CMD_!BROWSER_COUNT!=start "" msedge"
)
where firefox >nul 2>nul
if %errorlevel% equ 0 (
    set /a BROWSER_COUNT+=1
    set "BROWSER_NAME_!BROWSER_COUNT!=Firefox"
    set "BROWSER_CMD_!BROWSER_COUNT!=start "" firefox"
)

echo Detected browsers:
for /L %%i in (1,1,%BROWSER_COUNT%) do call echo   %%i^) %%BROWSER_NAME_%%i%%
set /a SKIP_OPTION=%BROWSER_COUNT%+1
echo   !SKIP_OPTION!^) Do not open a browser
set /p BROWSER_CHOICE=Choose a browser to open G1DM [!SKIP_OPTION!]:

REM 4. Start G1DM Unified Server
echo [4/4] Starting G1DM Core Service on port %PORT%...
echo The service binds to 127.0.0.1 for local-only access.
echo.
echo   ===============================================================
echo   G1DM is ready to start.
echo   Local Access:    %URL%
echo   API Endpoint:    %URL%/api/v1
echo   OpenAPI Docs:    %URL%/api/v1/openapi.json
echo   ===============================================================
echo.
if defined BROWSER_CHOICE if %BROWSER_CHOICE% geq 1 if %BROWSER_CHOICE% leq %BROWSER_COUNT% (
    call echo Opening %URL% in %%BROWSER_NAME_%BROWSER_CHOICE%%%...
    call %%BROWSER_CMD_%BROWSER_CHOICE%%% %URL%
)
echo Press Ctrl+C to stop the G1DM server.
echo.

set PORT=%PORT%
node dist\main\server.js
if %errorlevel% neq 0 (
    pause
)
