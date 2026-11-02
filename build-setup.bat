@echo off
setlocal
cd /d "%~dp0"

rem --- 1. Admin rights (electron-builder needs them on Windows to unpack its tools) ---
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Requesting administrator rights...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

echo ================================================
echo   Red tracker - building setup.exe
echo ================================================
echo Folder: %CD%
echo.

if not exist package.json (
  echo ERROR: package.json not found. Extract the ZIP archive first, do not run the file from inside the archive.
  pause
  exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node.js is not installed. Install the LTS version from https://nodejs.org , then run this file again.
  pause
  exit /b 1
)
node -v
npm -v
for /f "tokens=1 delims=." %%v in ('node -p "process.versions.node"') do if %%v GEQ 24 echo WARNING: Node.js %%v is not LTS. Node.js 22 LTS is recommended.
echo.

set CSC_IDENTITY_AUTO_DISCOVERY=false
set ELECTRON_BUILDER_BINARIES_MIRROR=
set npm_config_loglevel=error

echo [1/2] Installing dependencies (a few minutes)...
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo.
  echo ERROR at step 1: npm install failed. Read the message above. Check the internet connection and try again.
  pause
  exit /b 1
)

if not exist node_modules\electron\path.txt (
  echo Electron binary is missing, downloading it...
  call node node_modules\electron\install.js
)
if not exist node_modules\electron\path.txt (
  echo Retrying with mirror...
  set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
  call node node_modules\electron\install.js
)
if not exist node_modules\electron\path.txt (
  echo.
  echo ERROR: Electron could not be downloaded. Check internet/antivirus and install Node.js 22 LTS, then run again.
  pause
  exit /b 1
)

echo.
echo [2/2] Building the installer...
call npm run dist
if errorlevel 1 (
  echo.
  echo ERROR at step 2: build failed. Read the message above.
  pause
  exit /b 1
)

echo.
echo ================================================
echo   DONE: %CD%\dist\Red-tracker-setup.exe
echo ================================================
start "" "%CD%\dist"
pause
