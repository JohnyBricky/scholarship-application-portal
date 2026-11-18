@echo off
setlocal
set "LOG_FILE=%~dp0RLApplicationPortalBGC\logs\server.log"

if not exist "%LOG_FILE%" (
    echo [INFO] Log file does not exist yet: %LOG_FILE%
    echo [INFO] Start the server first using start_server.bat.
    pause
    exit /b 0
)

echo ========================================================
echo  Real LIFE Portal - Live Server Logs ^(Ctrl+C to exit^)
echo  File: %LOG_FILE%
echo ========================================================
powershell -NoProfile -Command "Get-Content -Path '%LOG_FILE%' -Tail 50 -Wait"
endlocal
