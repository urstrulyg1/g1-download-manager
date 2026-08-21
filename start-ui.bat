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
echo [2/5] Verifying dependencies...
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

REM 3. Generate & Validate Browser Extensions
echo [3/5] Verifying and validating browser companion extensions...
call node scripts\build\generate-extension-icons.js
if %errorlevel% neq 0 (
    echo Error: Failed to generate companion extension icons.
    pause
    exit /b %errorlevel%
)
call node scripts\build\validate-extensions.js
if %errorlevel% neq 0 (
    echo Error: Browser extension validation failed! Check manifest and assets.
    pause
    exit /b %errorlevel%
)

REM 4. Build backend & frontend
echo [4/5] Building G1DM backend & frontend...
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
    call resources\native-host\install-host.bat >nul 2>nul
    echo [OK] Configured native-host integration for available browsers.
)

if "%PORT%"=="" set PORT=8055
set URL=http://127.0.0.1:%PORT%
set CHROME_EXT_DIR=%~dp0resources\extensions\chrome
set /a BROWSER_COUNT=0

set /a BROWSER_COUNT+=1
set "BROWSER_NAME_!BROWSER_COUNT!=Default browser"
set "BROWSER_CMD_!BROWSER_COUNT!=start """

where chrome >nul 2>nul
if %errorlevel% equ 0 (
    set /a BROWSER_COUNT+=1
    set "BROWSER_NAME_!BROWSER_COUNT!=Google Chrome (with G1DM Extension)"
    set "BROWSER_CMD_!BROWSER_COUNT!=start "" chrome --load-extension="%CHROME_EXT_DIR%""
)
where msedge >nul 2>nul
if %errorlevel% equ 0 (
    set /a BROWSER_COUNT+=1
    set "BROWSER_NAME_!BROWSER_COUNT!=Microsoft Edge (with G1DM Extension)"
    set "BROWSER_CMD_!BROWSER_COUNT!=start "" msedge --load-extension="%CHROME_EXT_DIR%""
)
where brave >nul 2>nul
if %errorlevel% equ 0 (
    set /a BROWSER_COUNT+=1
    set "BROWSER_NAME_!BROWSER_COUNT!=Brave Browser (with G1DM Extension)"
    set "BROWSER_CMD_!BROWSER_COUNT!=start "" brave --load-extension="%CHROME_EXT_DIR%""
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

REM 5. Start G1DM Unified Server
echo [5/5] Starting G1DM Core Service on port %PORT%...
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
    call echo Opening %URL% in %%BROWSER_NAME_%BROWSER_CHOICE%%% once ready...
    start /b cmd /c "timeout /t 1 /nobreak >nul & call %%BROWSER_CMD_%BROWSER_CHOICE%%% %URL%"
)
echo Press Ctrl+C to stop the G1DM server.
echo.

set PORT=%PORT%
set NODE_ENV=production
node dist\main\server.js
if %errorlevel% neq 0 (
    pause
)
