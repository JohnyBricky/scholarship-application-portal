@echo off
setlocal
call "%~dp0install_dependencies.bat" check
if errorlevel 1 exit /b 1

set "PORTAL_MODE=demo"
echo [DEMO] Starting Real LIFE Portal ^(Demo Mode with sample users and applications^)...
call "%~dp0start_server.bat" nopause
echo.
echo Demo Accounts:
echo   Applicant   : applicant@reallife.ph / demo123
echo   Staff Admin : staff@reallife.ph     / staff123
echo   System Admin: sysadmin@reallife.ph  / admin123
echo.
start "" "http://127.0.0.1:8080"
pause
endlocal
