@echo off
setlocal
echo [INFO] Restarting Real LIFE Portal server...
call "%~dp0stop_server.bat" nopause
timeout /t 1 /nobreak >nul
call "%~dp0start_server.bat" nopause
echo [OK] Restart complete.
pause
endlocal
