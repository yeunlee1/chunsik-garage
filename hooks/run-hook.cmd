: << 'CMDBLOCK'
@echo off
REM 춘식이 정비소의 훅 감싸개. Windows 명령 창과 bash 양쪽에서 돈다(설계 18.2)
REM cmd runs this block: it finds bash and calls the named hook script. bash skips this block.
REM When bash is missing, print nothing and exit 0.
if "%~1"=="" exit /b 0
set "HOOK_DIR=%~dp0"
if exist "C:\Program Files\Git\bin\bash.exe" (
    "C:\Program Files\Git\bin\bash.exe" "%HOOK_DIR%%~1"
    exit /b 0
)
if exist "C:\Program Files (x86)\Git\bin\bash.exe" (
    "C:\Program Files (x86)\Git\bin\bash.exe" "%HOOK_DIR%%~1"
    exit /b 0
)
where bash >nul 2>nul
if %ERRORLEVEL% equ 0 (
    bash "%HOOK_DIR%%~1"
    exit /b 0
)
exit /b 0
CMDBLOCK

# bash: run the named hook script next to this file. Always exit 0.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
[ -n "$1" ] || exit 0
bash "${SCRIPT_DIR}/$1" || true
exit 0
