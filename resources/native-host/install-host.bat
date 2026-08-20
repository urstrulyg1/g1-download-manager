@echo off
setlocal

REM ==============================================================================
REM G1DM Native Messaging Host Installer for Windows
REM ==============================================================================

set "HOST_DIR=%~dp0"
set "HOST_EXE=%HOST_DIR%g1dm-native-host.js"
set "MANIFEST_PATH=%HOST_DIR%com.g1dm.native_host.json"

echo Registering G1DM Native Messaging Host in Windows Registry...

REM Chrome
REG ADD "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.g1dm.native_host" /ve /t REG_SZ /d "%MANIFEST_PATH%" /f

REM Edge
REG ADD "HKCU\Software\Microsoft\Edge\NativeMessagingHosts\com.g1dm.native_host" /ve /t REG_SZ /d "%MANIFEST_PATH%" /f

REM Firefox
REG ADD "HKCU\Software\Mozilla\NativeMessagingHosts\com.g1dm.native_host" /ve /t REG_SZ /d "%HOST_DIR%com.g1dm.native_host.firefox.json" /f

echo [OK] Registered G1DM Native Host in Windows Registry for Chrome, Edge, and Firefox.
pause
