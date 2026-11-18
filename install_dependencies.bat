@echo off
setlocal EnableDelayedExpansion
echo [CHECK] Verifying Python 3 runtime...

set "PY_CMD="
where python >nul 2>&1 && (
    python -c "import sys; assert sys.version_info >= (3, 10)" >nul 2>&1 && set "PY_CMD=python"
)
if "%PY_CMD%"=="" (
    where py >nul 2>&1 && (
        py -3 -c "import sys; assert sys.version_info >= (3, 10)" >nul 2>&1 && set "PY_CMD=py -3"
    )
)

if "%PY_CMD%"=="" (
    echo [WARN] Python 3.10+ not found on this machine.
    where winget >nul 2>&1
    if not errorlevel 1 (
        echo [INSTALL] Installing Python 3.12 via winget...
        winget install -e --id Python.Python.3.12 --accept-package-agreements --accept-source-agreements
        for /f "tokens=*" %%P in ('powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')"') do set "PATH=%%P;%PATH%"
        where python >nul 2>&1 && set "PY_CMD=python"
    ) else (
        echo [ERROR] winget is not available to auto-install Python.
        echo [ACTION] Please install Python 3.12 from https://www.python.org/downloads/ and check "Add python.exe to PATH".
        start https://www.python.org/downloads/
        pause
        exit /b 1
    )
)

if "%PY_CMD%"=="" (
    echo [ERROR] Python installation completed, but a terminal restart may be needed to refresh PATH.
    pause
    exit /b 1
)

echo [CHECK] Verifying built-in Python modules ^(sqlite3, http.server, smtplib^)...
%PY_CMD% -c "import sqlite3, http.server, smtplib, logging, hmac, hashlib; print('[OK] Python runtime and all portal dependencies ready:', __import__('sys').version.split()[0])"
if errorlevel 1 (
    echo [ERROR] Required Python standard library modules failed verification.
    pause
    exit /b 1
)

if /I not "%~1"=="check" pause
endlocal
