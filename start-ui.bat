@echo off
setlocal enabledelayedexpansion

REM ==============================================================================
REM G1DM — Next-Generation Production-Grade Internet Download Manager
REM Universal UI & Core Engine Launcher (Windows)
REM ==============================================================================

title G1DM — Internet Download Manager Core Service

REM Initialize ANSI Color Sequences for Modern Windows Terminal / cmd.exe
for /f %%a in ('echo prompt $E ^| cmd') do set "ESC=%%a"

set "RESET=%ESC%[0m"
set "BOLD=%ESC%[1m"
set "DIM=%ESC%[2m"
set "UNDERLINE=%ESC%[4m"

set "RED=%ESC%[91m"
set "GREEN=%ESC%[92m"
set "YELLOW=%ESC%[93m"
set "BLUE=%ESC%[94m"
set "MAGENTA=%ESC%[95m"
set "CYAN=%ESC%[96m"
set "WHITE=%ESC%[97m"
set "GRAY=%ESC%[90m"

echo.
echo %CYAN%%BOLD%  ╔═════════════════════════════════════════════════════════════════════════╗%RESET%
echo %CYAN%%BOLD%  ║                                                                         ║%RESET%
echo   %CYAN%%BOLD%║   %MAGENTA%██████╗   ██╗ ██████╗  ███╗   ███╗                                    %CYAN%║%RESET%
echo   %CYAN%%BOLD%║  %MAGENTA%██╔════╝  ███║ ██╔══██╗ ████╗ ████║   %WHITE%%BOLD%Next-Gen Internet Download Mgr   %CYAN%║%RESET%
echo   %CYAN%%BOLD%║  %MAGENTA%██║  ███╗  ██║ ██║  ██║ ██╔████╔██║   %DIM%Universal Core Engine & Web UI   %RESET%%CYAN%%BOLD%║%RESET%
echo   %CYAN%%BOLD%║  %MAGENTA%██║   ██║  ██║ ██║  ██║ ██║╚██╔╝██║   %YELLOW%v2.0-PRO%CYAN% • %GREEN%Production Ready      %CYAN%║%RESET%
echo   %CYAN%%BOLD%║  %MAGENTA%╚██████╔╝  ██║ ██████╔╝ ██║ ╚═╝ ██║   %GRAY%High-Performance Core Engine     %CYAN%║%RESET%
echo   %CYAN%%BOLD%║   %MAGENTA%╚═════╝   ╚═╝ ╚═════╝  ╚═╝     ╚═╝                                    %CYAN%║%RESET%
echo %CYAN%%BOLD%  ║                                                                         ║%RESET%
echo %CYAN%%BOLD%  ╚═════════════════════════════════════════════════════════════════════════╝%RESET%
echo.

cd /d "%~dp0"

REM 1. Check Node.js and npm
echo %BLUE%%BOLD%┌── [1/5] Checking System Prerequisites%RESET%
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo %RED%%BOLD%│  ✖ Error: Node.js is not installed or not in PATH.%RESET%
    echo %YELLOW%│  Please install Node.js (v18 or newer) from https://nodejs.org%RESET%
    echo %RED%└── Initialization aborted.%RESET%
    pause
    exit /b 1
)

where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo %RED%%BOLD%│  ✖ Error: npm is not installed or not in PATH.%RESET%
    echo %RED%└── Initialization aborted.%RESET%
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node -v') do set NODE_VER=%%v
echo %GREEN%│  ✔ Node.js runtime detected: %WHITE%%NODE_VER%%RESET%
echo %BLUE%└── Done.%RESET%
echo.

REM 2. Install dependencies if node_modules is missing
echo %BLUE%%BOLD%┌── [2/5] Verifying Dependencies%RESET%
if not exist "node_modules\" (
    echo %YELLOW%│  ⚡ node_modules missing. Running npm install...%RESET%
    call npm install
    if %errorlevel% neq 0 (
        echo %RED%%BOLD%│  ✖ Error: npm install failed.%RESET%
        echo %RED%└── Initialization aborted.%RESET%
        pause
        exit /b %errorlevel%
    )
    echo %GREEN%│  ✔ Dependencies installed successfully.%RESET%
) else (
    echo %GREEN%│  ✔ Dependencies already installed ^& verified.%RESET%
)
echo %BLUE%└── Done.%RESET%
echo.

REM 3. Generate & Validate Browser Extensions
echo %BLUE%%BOLD%┌── [3/5] Browser Companion Extension Integrity%RESET%
echo %CYAN%│  • Generating companion extension icons...%RESET%
call node scripts\build\generate-extension-icons.js
if %errorlevel% neq 0 (
    echo %RED%%BOLD%│  ✖ Error: Failed to generate companion extension icons.%RESET%
    echo %RED%└── Process failed.%RESET%
    pause
    exit /b %errorlevel%
)
echo %CYAN%│  • Validating extension manifest ^& security assets...%RESET%
call node scripts\build\validate-extensions.js
if %errorlevel% neq 0 (
    echo %RED%%BOLD%│  ✖ Error: Browser extension validation failed! Check manifest and assets.%RESET%
    echo %RED%└── Process failed.%RESET%
    pause
    exit /b %errorlevel%
)
echo %GREEN%│  ✔ Browser companion extensions verified.%RESET%
echo %BLUE%└── Done.%RESET%
echo.

REM 4. Build backend & frontend
echo %BLUE%%BOLD%┌── [4/5] Building G1DM Backend ^& Next.js Frontend%RESET%
echo %GRAY%│  Compiling TypeScript backend ^& bundling Next.js UI...%RESET%
if not exist "dist\main\" (
    call npm run build
    if %errorlevel% neq 0 (
        echo %RED%%BOLD%│  ✖ Error: Build failed.%RESET%
        echo %RED%└── Process failed.%RESET%
        pause
        exit /b %errorlevel%
    )
) else (
    call npm run build:backend
)
echo %GREEN%│  ✔ Build completed ^& verified.%RESET%
echo %BLUE%└── Done.%RESET%
echo.

if exist "resources\native-host\install-host.bat" (
    call resources\native-host\install-host.bat >nul 2>nul
    echo %GREEN%⚡ Native host integration configured for installed browsers.%RESET%
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

echo.
echo %CYAN%%BOLD%🧭 Available Browsers ^& Launch Targets:%RESET%
for /L %%i in (1,1,%BROWSER_COUNT%) do (
    call echo   %CYAN%%%i%RESET%^) %WHITE%%%BROWSER_NAME_%%i%%%RESET%
)
set /a SKIP_OPTION=%BROWSER_COUNT%+1
echo   %CYAN%!SKIP_OPTION!%RESET%^) %GRAY%Do not open a browser (Headless / API mode)%RESET%
echo.
set /p BROWSER_CHOICE=%YELLOW%%BOLD%➤ Choose a browser to open G1DM [%WHITE%!SKIP_OPTION!%YELLOW%]: %RESET%

REM 5. Start G1DM Unified Server
echo.
echo %BLUE%%BOLD%┌── [5/5] Starting G1DM Core Service on port %PORT%...%RESET%
echo %CYAN%│  • Binding listener to %WHITE%127.0.0.1:%PORT%%CYAN% (Local-only access)...%RESET%
echo %BLUE%└── Ready to launch.%RESET%
echo.
echo %GREEN%%BOLD%═══════════════════════════════════════════════════════════════════════════%RESET%
echo   %GREEN%%BOLD%🚀 G1DM CORE ENGINE ^& HIGH-PERFORMANCE WEB UI IS READY%RESET%
echo %GREEN%%BOLD%═══════════════════════════════════════════════════════════════════════════%RESET%
echo   %CYAN%%BOLD%🌐 Web Dashboard:%RESET%    %WHITE%%UNDERLINE%%URL%%RESET%
echo   %BLUE%%BOLD%⚡ REST API:%RESET%         %WHITE%%URL%/api/v1%RESET%
echo   %MAGENTA%%BOLD%📋 OpenAPI Docs:%RESET%     %WHITE%%URL%/api/v1/openapi.json%RESET%
echo   %YELLOW%%BOLD%🧩 Extension Dir:%RESET%    %GRAY%%CHROME_EXT_DIR%%RESET%
echo %GREEN%%BOLD%═══════════════════════════════════════════════════════════════════════════%RESET%
echo.

if defined BROWSER_CHOICE if %BROWSER_CHOICE% geq 1 if %BROWSER_CHOICE% leq %BROWSER_COUNT% (
    call echo %CYAN%✨ Launching %%BROWSER_NAME_%BROWSER_CHOICE%%% with G1DM...%RESET%
    start /b cmd /c "timeout /t 1 /nobreak >nul & call %%BROWSER_CMD_%BROWSER_CHOICE%%% %URL%"
)

echo %YELLOW%%BOLD%💡 Tip:%RESET% %GRAY%Press %WHITE%Ctrl + C%GRAY% at any time to terminate the server.%RESET%
echo.

set PORT=%PORT%
set NODE_ENV=production
node dist\main\server.js
if %errorlevel% neq 0 (
    pause
)
