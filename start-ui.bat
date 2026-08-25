@echo off
setlocal enabledelayedexpansion

REM ==============================================================================
REM  G1DM — Next-Generation Internet Download Manager
REM  Universal Launcher  ·  Windows
REM ==============================================================================

title G1DM — Internet Download Manager

REM ── ANSI colours (works in Windows Terminal and modern cmd.exe) ───────────────
for /f %%a in ('echo prompt $E ^| cmd') do set "ESC=%%a"

set "R=%ESC%[0m"
set "BOLD=%ESC%[1m"
set "DIM=%ESC%[2m"
set "UL=%ESC%[4m"

set "RED=%ESC%[91m"
set "GREEN=%ESC%[92m"
set "YELLOW=%ESC%[93m"
set "BLUE=%ESC%[94m"
set "MAGENTA=%ESC%[95m"
set "CYAN=%ESC%[96m"
set "WHITE=%ESC%[97m"
set "GRAY=%ESC%[90m"
set "BGREEN=%ESC%[92m"
set "BCYAN=%ESC%[96m"
set "BYELLOW=%ESC%[93m"
set "BMAGENTA=%ESC%[95m"
set "BBLUE=%ESC%[94m"
set "BWHITE=%ESC%[97m"

REM ── Banner ────────────────────────────────────────────────────────────────────
echo.
echo   %BMAGENTA%╭──────────────────────────────────────────────────────────────────────╮%R%
echo   %BMAGENTA%│                                                                      │%R%
echo   %BMAGENTA%│%R%                  %BCYAN%%BOLD%██████╗   ██╗  ██████╗  ███╗   ███╗%R%                 %BMAGENTA%│%R%
echo   %BMAGENTA%│%R%                 %BCYAN%%BOLD%██╔════╝  ███║  ██╔══██╗ ████╗ ████║%R%                 %BMAGENTA%│%R%
echo   %BMAGENTA%│%R%                 %BCYAN%%BOLD%██║  ███╗  ██║  ██║  ██║ ██╔████╔██║%R%                 %BMAGENTA%│%R%
echo   %BMAGENTA%│%R%                 %BCYAN%%BOLD%██║   ██║  ██║  ██║  ██║ ██║╚██╔╝██║%R%                 %BMAGENTA%│%R%
echo   %BMAGENTA%│%R%                 %BBLUE%%BOLD%╚██████╔╝  ██║  ██████╔╝ ██║ ╚═╝ ██║%R%                 %BMAGENTA%│%R%
echo   %BMAGENTA%│%R%                  %BBLUE%%BOLD%╚═════╝   ╚═╝  ╚═════╝  ╚═╝     ╚═╝%R%                 %BMAGENTA%│%R%
echo   %BMAGENTA%│                                                                      │%R%
echo   %BMAGENTA%├──────────────────────────────────────────────────────────────────────┤%R%
echo   %BMAGENTA%│%R%          %BWHITE%%BOLD%G1DM DOWNLOAD MANAGER%R%  %GRAY%·%R%  %BYELLOW%%BOLD%v4.0.0-FREE%R%  %GRAY%·%R%  %BGREEN%%BOLD%[ONLINE]%R%          %BMAGENTA%│%R%
echo   %BMAGENTA%│%R%    %GRAY%High-Performance Core Engine  ·  Multi-Threaded Turbo Pipeline%R%    %BMAGENTA%│%R%
echo   %BMAGENTA%╰──────────────────────────────────────────────────────────────────────╯%R%
echo.

REM ── Move to script directory ──────────────────────────────────────────────────
cd /d "%~dp0"

REM ════════════════════════════════════════════════════════════════════════════
REM  STEP 1 — System Prerequisites
REM ════════════════════════════════════════════════════════════════════════════
echo %BBLUE%%BOLD%┌── [1/5] System Prerequisites%R%

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo %RED%%BOLD%│  ^✖  Node.js is not installed or not in PATH.%R%
    echo %YELLOW%│     Install Node.js v18+ from https://nodejs.org%R%
    echo %RED%└── Aborted.%R%
    echo.
    pause & exit /b 1
)

where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo %RED%%BOLD%│  ^✖  npm is not installed or not in PATH.%R%
    echo %RED%└── Aborted.%R%
    echo.
    pause & exit /b 1
)

for /f "tokens=*" %%v in ('node -v 2^>nul') do set "NODE_VER=%%v"
for /f "tokens=*" %%v in ('npm  -v 2^>nul') do set "NPM_VER=%%v"

REM Check Node major version >= 18
for /f "tokens=1 delims=." %%m in ("%NODE_VER:~1%") do set "NODE_MAJOR=%%m"
if !NODE_MAJOR! lss 18 (
    echo %YELLOW%│  ^⚠   Node.js !NODE_VER! detected — v18 or newer is recommended.%R%
) else (
    echo %GREEN%│  ^✔  Node.js %BWHITE%!NODE_VER!%GREEN%   ^(npm %BWHITE%v!NPM_VER!%GREEN%^)%R%
)
echo %BBLUE%└── Done.%R%
echo.

REM ════════════════════════════════════════════════════════════════════════════
REM  STEP 2 — Dependencies
REM ════════════════════════════════════════════════════════════════════════════
echo %BBLUE%%BOLD%┌── [2/5] Dependencies%R%
if not exist "node_modules\" (
    echo %YELLOW%│  ^⚡  node_modules not found — running npm install...%R%
    call npm install
    if !errorlevel! neq 0 (
        echo %RED%%BOLD%│  ^✖  npm install failed.%R%
        echo %RED%└── Aborted.%R%
        echo.
        pause & exit /b 1
    )
    echo %GREEN%│  ^✔  Dependencies installed.%R%
) else (
    echo %GREEN%│  ^✔  node_modules present ^& up to date.%R%
)
echo %BBLUE%└── Done.%R%
echo.

REM ════════════════════════════════════════════════════════════════════════════
REM  STEP 3 — Browser Extension Integrity
REM ════════════════════════════════════════════════════════════════════════════
echo %BBLUE%%BOLD%┌── [3/5] Browser Extension Integrity%R%

echo %CYAN%│  • Generating icons ^& dynamic assets...%R%
call node scripts\build\generate-extension-icons.js --quiet
if !errorlevel! neq 0 (
    echo %RED%%BOLD%│  ^✖  Failed to generate extension icons.%R%
    echo %RED%└── Aborted.%R%
    echo.
    pause & exit /b 1
)

echo %CYAN%│  • Validating manifest ^& sandbox permissions...%R%
call node scripts\build\validate-extensions.js --quiet
if !errorlevel! neq 0 (
    echo %RED%%BOLD%│  ^✖  Extension integrity check failed — inspect manifest before launching.%R%
    echo %RED%└── Aborted.%R%
    echo.
    pause & exit /b 1
)

echo %GREEN%│  ^✔  Companion extension verified ^& ready.%R%
echo %BBLUE%└── Done.%R%
echo.

REM ════════════════════════════════════════════════════════════════════════════
REM  STEP 4 — Build
REM ════════════════════════════════════════════════════════════════════════════
echo %BBLUE%%BOLD%┌── [4/5] Build  ^(TypeScript backend + Next.js frontend^)%R%

set "REBUILD_NEEDED=0"
if "%1"=="--rebuild" set "REBUILD_NEEDED=1"
if "%1"=="--build"   set "REBUILD_NEEDED=1"
if "%1"=="-b"        set "REBUILD_NEEDED=1"
if not exist "dist\main\server.js" set "REBUILD_NEEDED=1"
if not exist "src\renderer\.next\BUILD_ID" set "REBUILD_NEEDED=1"

if "!REBUILD_NEEDED!"=="1" (
    echo %GRAY%│  Compiling — this may take a moment on first run...%R%
    call npm run build
    if !errorlevel! neq 0 (
        echo %RED%%BOLD%│  ^✖  Build failed. See output above for details.%R%
        echo %RED%└── Aborted.%R%
        echo.
        pause & exit /b 1
    )
    echo %GREEN%│  ^✔  Build complete.%R%
) else (
    echo %GREEN%│  ^✔  Build artifacts up to date  %GRAY%^(pass --rebuild for clean build^)%R%
)
echo %BBLUE%└── Done.%R%
echo.

REM ── Native host setup ─────────────────────────────────────────────────────
if exist "resources\native-host\install-host.bat" (
    call resources\native-host\install-host.bat >nul 2>nul
    echo %GREEN%^⚡  Native host configured.%R%
    echo.
)

REM ════════════════════════════════════════════════════════════════════════════
REM  STEP 5 — Browser selection
REM ════════════════════════════════════════════════════════════════════════════
if "%PORT%"=="" set PORT=8055
set "URL=http://127.0.0.1:%PORT%"
set "CHROME_EXT_DIR=%~dp0resources\extensions\chrome"
set /a BROWSER_COUNT=0

REM ── Probe real Chrome binary ──────────────────────────────────────────────
set "CHROME_EXE="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    set "CHROME_EXE=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
) else if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
    set "CHROME_EXE=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
) else if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" (
    set "CHROME_EXE=%LocalAppData%\Google\Chrome\Application\chrome.exe"
)
if defined CHROME_EXE (
    set /a BROWSER_COUNT+=1
    set "BROWSER_NAME_!BROWSER_COUNT!=Google Chrome  +  G1DM Extension"
    set "BROWSER_TAG_!BROWSER_COUNT!=ext"
    set "BROWSER_CMD_!BROWSER_COUNT!="!CHROME_EXE!" --load-extension="!CHROME_EXT_DIR!""
)

REM ── Probe real Edge binary ────────────────────────────────────────────────
set "EDGE_EXE="
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
    set "EDGE_EXE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
) else if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
    set "EDGE_EXE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
)
if defined EDGE_EXE (
    set /a BROWSER_COUNT+=1
    set "BROWSER_NAME_!BROWSER_COUNT!=Microsoft Edge  +  G1DM Extension"
    set "BROWSER_TAG_!BROWSER_COUNT!=ext"
    set "BROWSER_CMD_!BROWSER_COUNT!="!EDGE_EXE!" --load-extension="!CHROME_EXT_DIR!""
)

REM ── Probe real Brave binary ───────────────────────────────────────────────
set "BRAVE_EXE="
if exist "%ProgramFiles%\BraveSoftware\Brave-Browser\Application\brave.exe" (
    set "BRAVE_EXE=%ProgramFiles%\BraveSoftware\Brave-Browser\Application\brave.exe"
) else if exist "%ProgramFiles(x86)%\BraveSoftware\Brave-Browser\Application\brave.exe" (
    set "BRAVE_EXE=%ProgramFiles(x86)%\BraveSoftware\Brave-Browser\Application\brave.exe"
) else if exist "%LocalAppData%\BraveSoftware\Brave-Browser\Application\brave.exe" (
    set "BRAVE_EXE=%LocalAppData%\BraveSoftware\Brave-Browser\Application\brave.exe"
)
if defined BRAVE_EXE (
    set /a BROWSER_COUNT+=1
    set "BROWSER_NAME_!BROWSER_COUNT!=Brave Browser  +  G1DM Extension"
    set "BROWSER_TAG_!BROWSER_COUNT!=ext"
    set "BROWSER_CMD_!BROWSER_COUNT!="!BRAVE_EXE!" --load-extension="!CHROME_EXT_DIR!""
)

REM ── Probe Firefox binary ──────────────────────────────────────────────────
set "FIREFOX_EXE="
if exist "%ProgramFiles%\Mozilla Firefox\firefox.exe" (
    set "FIREFOX_EXE=%ProgramFiles%\Mozilla Firefox\firefox.exe"
) else if exist "%ProgramFiles(x86)%\Mozilla Firefox\firefox.exe" (
    set "FIREFOX_EXE=%ProgramFiles(x86)%\Mozilla Firefox\firefox.exe"
)
if defined FIREFOX_EXE (
    set /a BROWSER_COUNT+=1
    set "BROWSER_NAME_!BROWSER_COUNT!=Firefox"
    set "BROWSER_TAG_!BROWSER_COUNT!=plain"
    set "BROWSER_CMD_!BROWSER_COUNT!="!FIREFOX_EXE!""
)

REM ── Fallback options ──────────────────────────────────────────────────────
set /a BROWSER_COUNT+=1
set "BROWSER_NAME_!BROWSER_COUNT!=Default system browser"
set "BROWSER_TAG_!BROWSER_COUNT!=plain"
set "BROWSER_CMD_!BROWSER_COUNT!=start "Open""

set /a BROWSER_COUNT+=1
set "BROWSER_NAME_!BROWSER_COUNT!=Headless / API-only mode ^(no browser^)"
set "BROWSER_TAG_!BROWSER_COUNT!=headless"
set "BROWSER_CMD_!BROWSER_COUNT!=__NONE__"

REM ── Print browser menu ────────────────────────────────────────────────────
echo %BCYAN%%BOLD%  🌐  SELECT LAUNCH TARGET%R%
echo   %GRAY%───────────────────────────────────────────────────────────────────────────────%R%
for /L %%i in (1,1,%BROWSER_COUNT%) do (
    set "_TAG=!BROWSER_TAG_%%i!"
    set "_NAME=!BROWSER_NAME_%%i!"
    if "!_TAG!"=="ext"      set "_BADGE=%BGREEN%%BOLD%[Extension Active]%R%"
    if "!_TAG!"=="plain"    set "_BADGE=%BCYAN%[Browser]%R%         "
    if "!_TAG!"=="headless" set "_BADGE=%GRAY%[Headless API]%R%    "
    if %%i equ 1 (
        echo   %BYELLOW%%BOLD% %%i^)%R%  %BWHITE%!_NAME!%R%  !_BADGE!  %BCYAN%★ Recommended%R%
    ) else (
        echo   %BYELLOW%%BOLD% %%i^)%R%  %BWHITE%!_NAME!%R%  !_BADGE!
    )
)

REM Default = first extension browser, else last entry
set /a DEFAULT_OPTION=%BROWSER_COUNT%
for /L %%i in (1,1,%BROWSER_COUNT%) do (
    if "!BROWSER_TAG_%%i!"=="ext" (
        set /a DEFAULT_OPTION=%%i
        goto :found_default
    )
)
:found_default

echo.
set /p BROWSER_CHOICE="%BYELLOW%%BOLD%  ➤  Choose an option [%BWHITE%!DEFAULT_OPTION!%BYELLOW%]: %R%"
if "%BROWSER_CHOICE%"=="" set "BROWSER_CHOICE=!DEFAULT_OPTION!"

REM ════════════════════════════════════════════════════════════════════════════
REM  STEP 5 — Start G1DM server
REM ════════════════════════════════════════════════════════════════════════════
echo.
echo %BBLUE%%BOLD%┌── [5/5] Starting G1DM Core Service%R%
REM ── Reclaim port if occupied ─────────────────────────────────────────────
for /f "tokens=5" %%p in ('netstat -ano 2^>nul ^| findstr /r /c:":%PORT% .*LISTENING"') do (
    if not "%%p"=="" if not "%%p"=="0" (
        echo %YELLOW%│  ^⚠  Reclaiming port %PORT% from previous instance ^(PID %%p^)...%R%
        taskkill /F /PID %%p >nul 2>nul
        timeout /t 1 /nobreak >nul
    )
)

REM Start server in background; logs go to g1dm-server.log
set NODE_ENV=production
start /b "" cmd /c "node dist\main\server.js > g1dm-server.log 2>&1"

REM ── Readiness probe ───────────────────────────────────────────────────────
echo %CYAN%│  • Waiting for server...%R%
set /a RETRY=0
set "READY=0"
:probe_loop
    if !RETRY! geq 60 goto :probe_done
    curl -s -o nul -w "%%{http_code}" "http://127.0.0.1:%PORT%/api/browser/health" 2>nul | findstr /x "200" >nul 2>nul
    if !errorlevel! equ 0 ( set "READY=1" & goto :probe_done )
    timeout /t 1 /nobreak >nul
    set /a RETRY+=1
    goto :probe_loop
:probe_done
if "!READY!"=="1" (
    echo %GREEN%│  ^✔  Server online  %GRAY%^(HTTP 200 on /api/browser/health^)%R%
) else (
    echo %BYELLOW%│  ^⚠   Readiness timeout — proceeding. Check g1dm-server.log if UI fails to load.%R%
)
echo %BBLUE%└── Initialized.%R%
echo.

REM ── Status dashboard ──────────────────────────────────────────────────────
echo %BGREEN%┌── %BWHITE%%BOLD%🚀 G1DM Core Service Active%R% %GRAY%─────────────────────────────────────────%R%
echo %BGREEN%│%R%
echo %BGREEN%│%R%  %BCYAN%%BOLD%🌐 Web Dashboard%R%    ➜  %BWHITE%%BOLD%%UL%%URL%%R%
echo %BGREEN%│%R%  %BBLUE%%BOLD%⚡ REST API v1%R%      ➜  %BWHITE%%URL%/api/v1%R%
echo %BGREEN%│%R%  %BMAGENTA%%BOLD%📋 OpenAPI Spec%R%     ➜  %BWHITE%%URL%/api/v1/openapi.json%R%
echo %BGREEN%│%R%  %BYELLOW%%BOLD%🧩 Companion Ext%R%    ➜  %GRAY%%CHROME_EXT_DIR%%R%
echo %BGREEN%│%R%  %BGREEN%%BOLD%🛡️  Security Mode%R%    ➜  %BGREEN%Loopback Only (127.0.0.1) · Zero-Leakage%R%
echo %BGREEN%│%R%
echo %BGREEN%└── %BGREEN%%BOLD%ONLINE%R% %GRAY%──────────────────────────────────────────────────────────────%R%
echo.

REM ── Launch browser ────────────────────────────────────────────────────────
if defined BROWSER_CHOICE (
    if !BROWSER_CHOICE! geq 1 if !BROWSER_CHOICE! leq !BROWSER_COUNT! (
        set "_BCMD=!BROWSER_CMD_%BROWSER_CHOICE%!"
        set "_BNAME=!BROWSER_NAME_%BROWSER_CHOICE%!"
        if not "!_BCMD!"=="__NONE__" (
            echo %BCYAN%  ^✨  Launching %BWHITE%%BOLD%!_BNAME!%R%%BCYAN%...%R%
            start /b "" cmd /c "!_BCMD! "%URL%""
        )
    )
)

echo %GRAY%  ────────────────────────────────────────────────────────────────────────%R%
echo   %BYELLOW%%BOLD%^💡%R%  %GRAY%Press %BWHITE%Ctrl + C%GRAY% to stop the server gracefully.%R%
echo.

REM ── Stream server logs until user presses Ctrl+C ─────────────────────────
if exist "%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" (
    powershell -NoProfile -Command "Get-Content -Path 'g1dm-server.log' -Wait -Tail 10" 2>nul
) else (
    pause
)
