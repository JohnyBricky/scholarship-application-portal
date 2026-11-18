@echo off
setlocal
call "%~dp0install_dependencies.bat" check
if errorlevel 1 exit /b 1

set "APP_DIR=%~dp0RLApplicationPortalBGC"
set "LOG_DIR=%APP_DIR%\logs"
set "PID_FILE=%LOG_DIR%\server.pid"
set "LOG_FILE=%LOG_DIR%\server.log"

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

if exist "%PID_FILE%" (
    set /p EXISTING_PID=<"%PID_FILE%"
    tasklist /FI "PID eq %EXISTING_PID%" 2>nul | find "%EXISTING_PID%" >nul
    if not errorlevel 1 (
        echo [INFO] Portal server is already running ^(PID %EXISTING_PID%^).
        echo [INFO] URL: http://127.0.0.1:8080
        echo [INFO] Log: %LOG_FILE%
        if /I not "%~1"=="nopause" pause
        exit /b 0
    ) else (
        del /q "%PID_FILE%" 2>nul
    )
)

echo [INFO] Starting Real LIFE Portal server...
powershell -NoProfile -Command "Start-Process -FilePath 'python' -ArgumentList 'main.py' -WorkingDirectory '%APP_DIR%' -WindowStyle Hidden"

timeout /t 2 /nobreak >nul
if exist "%PID_FILE%" (
    set /p NEW_PID=<"%PID_FILE%"
    echo [OK] Portal server started ^(PID %NEW_PID%^).
    echo [OK] Open: http://127.0.0.1:8080
    echo [OK] Logs: %LOG_FILE%
) else (
    echo [WARN] Server launched, but PID file not created yet. Check %LOG_FILE% for details.
)

if /I not "%~1"=="nopause" pause
endlocal
