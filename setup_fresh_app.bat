@echo off
setlocal
call "%~dp0install_dependencies.bat" check
if errorlevel 1 exit /b 1

set "SRC_DIR=%~dp0RLApplicationPortalBGC"
set "FRESH_DIR=%~dp0RLApplicationPortal_Fresh"

echo [FRESH] Creating clean production app in: %FRESH_DIR%
if not exist "%FRESH_DIR%" mkdir "%FRESH_DIR%"
if not exist "%FRESH_DIR%\app" mkdir "%FRESH_DIR%\app"
if not exist "%FRESH_DIR%\js\components" mkdir "%FRESH_DIR%\js\components"
if not exist "%FRESH_DIR%\css" mkdir "%FRESH_DIR%\css"
if not exist "%FRESH_DIR%\assets" mkdir "%FRESH_DIR%\assets"
if not exist "%FRESH_DIR%\logs" mkdir "%FRESH_DIR%\logs"

copy /Y "%SRC_DIR%\main.py" "%FRESH_DIR%\main.py" >nul
copy /Y "%SRC_DIR%\*.html" "%FRESH_DIR%\" >nul
xcopy /Y /I /Q "%SRC_DIR%\app\*.py" "%FRESH_DIR%\app\" >nul
copy /Y "%SRC_DIR%\js\app.js" "%FRESH_DIR%\js\app.js" >nul
xcopy /Y /I /Q "%SRC_DIR%\js\components\*.js" "%FRESH_DIR%\js\components\" >nul
xcopy /Y /I /Q "%SRC_DIR%\css\*" "%FRESH_DIR%\css\" >nul
xcopy /E /Y /I /Q "%SRC_DIR%\assets\*" "%FRESH_DIR%\assets\" >nul

echo [FRESH] Initializing clean SQLite database ^(zero demo applicants^)...
pushd "%FRESH_DIR%"
set "PORTAL_MODE=fresh"
python -c "import main; main.init_db(); print('[OK] Fresh database initialized at portal.db')"
popd

(
echo @echo off
echo set "PORTAL_MODE=fresh"
echo pushd "%%~dp0"
echo powershell -NoProfile -Command "Start-Process -FilePath 'python' -ArgumentList 'main.py' -WorkingDirectory '%%~dp0' -WindowStyle Hidden"
echo timeout /t 2 /nobreak ^>nul
echo echo [OK] Fresh Portal started at http://127.0.0.1:8080
echo echo [LOGIN] System Admin: sysadmin@reallife.ph / admin123 ^(change password after first login^)
echo start "" "http://127.0.0.1:8080"
echo popd
echo pause
) > "%FRESH_DIR%\start_fresh_server.bat"

(
echo @echo off
echo set "PID_FILE=%%~dp0logs\server.pid"
echo if exist "%%PID_FILE%%" ^(
echo     set /p PID=^<"%%PID_FILE%%"
echo     taskkill /F /PID %%PID%% ^>nul 2^>^&1
echo     del /q "%%PID_FILE%%" 2^>nul
echo ^)
echo for /f "tokens=5" %%%%a in ^('netstat -ano ^^^| findstr ":8080 " ^^^| findstr "LISTENING"'^) do taskkill /F /PID %%%%a ^>nul 2^>^&1
echo echo [OK] Fresh Portal stopped.
echo pause
) > "%FRESH_DIR%\stop_fresh_server.bat"

echo.
echo [OK] Fresh App ready in: %FRESH_DIR%
echo [OK] Default System Admin: sysadmin@reallife.ph / admin123
echo [TIP] Run "%FRESH_DIR%\start_fresh_server.bat" to launch the fresh instance.
pause
endlocal
