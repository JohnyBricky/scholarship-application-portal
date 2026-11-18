@echo off
setlocal
set "APP_DIR=%~dp0RLApplicationPortalBGC"
set "LOG_DIR=%APP_DIR%\logs"
set "PID_FILE=%LOG_DIR%\server.pid"
set "STOPPED=0"

if exist "%PID_FILE%" (
    set /p SERVER_PID=<"%PID_FILE%"
    if not "%SERVER_PID%"=="" (
        taskkill /F /PID %SERVER_PID% >nul 2>&1
        if not errorlevel 1 (
            echo [OK] Stopped portal server ^(PID %SERVER_PID%^).
            set "STOPPED=1"
        )
    )
    del /q "%PID_FILE%" 2>nul
)

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8080 " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
    if not errorlevel 1 (
        echo [OK] Stopped process listening on port 8080 ^(PID %%a^).
        set "STOPPED=1"
    )
)

if "%STOPPED%"=="0" (
    echo [INFO] Portal server is not currently running.
)

if /I not "%~1"=="nopause" pause
endlocal
