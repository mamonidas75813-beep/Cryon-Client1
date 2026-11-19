@echo off
setlocal EnableExtensions
cd /d "%~dp0"
if errorlevel 1 goto :folder_error

echo.
echo  CRYON CLIENT - WINDOWS EXE BUILDER
echo  ==================================
echo.

if not exist "package.json" (
  echo [ERROR] package.json was not found. Extract the full CRYON project ZIP first.
  goto :fail
)
if not exist "scripts\build-windows.js" (
  echo [ERROR] scripts\build-windows.js was not found. The project extraction is incomplete.
  goto :fail
)

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found in PATH.
  echo Install 64-bit Node.js 26 LTS, then close and reopen CMD.
  goto :fail
)
where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm was not found in PATH.
  echo Reinstall Node.js with the npm package manager option enabled.
  goto :fail
)

for /f "delims=" %%v in ('node -p "Number(process.versions.node.split('.')[0])"') do set "NODE_MAJOR=%%v"
if not defined NODE_MAJOR (
  echo [ERROR] Could not read the Node.js version.
  goto :fail
)
if %NODE_MAJOR% LSS 22 (
  echo [ERROR] Node.js 22 or newer is required. Detected major version %NODE_MAJOR%.
  goto :fail
)

for /f "delims=" %%a in ('node -p "process.arch"') do set "NODE_ARCH=%%a"
if /I not "%NODE_ARCH%"=="x64" (
  echo [ERROR] This CRYON release targets Windows x64.
  echo Detected Node architecture: %NODE_ARCH%
  echo Install 64-bit Node.js 26 LTS.
  goto :fail
)

echo [OK] Node.js:
node --version
echo [OK] npm:
npm --version
echo [OK] Architecture: %NODE_ARCH%
echo.
echo This build will:
echo   1. Install project dependencies, including devDependencies.
echo   2. Run source checks and automated tests.
echo   3. Build the NSIS installer.
echo   4. Build the portable EXE.
echo   5. Verify both EXEs and write SHA-256 checksums.
echo.
echo Full build output will be saved in the build-logs folder.
echo.

node "scripts\build-windows.js"
set "BUILD_EXIT=%ERRORLEVEL%"
if not "%BUILD_EXIT%"=="0" goto :build_failed

if not exist "release\CRYON CLIENT Setup.exe" (
  echo [ERROR] Build runner returned success, but installer EXE is missing.
  set "BUILD_EXIT=1"
  goto :build_failed
)
if not exist "release\CRYON CLIENT Portable.exe" (
  echo [ERROR] Build runner returned success, but portable EXE is missing.
  set "BUILD_EXIT=1"
  goto :build_failed
)

echo.
echo [SUCCESS] CRYON Windows EXEs are ready:
echo   release\CRYON CLIENT Setup.exe
echo   release\CRYON CLIENT Portable.exe
echo   release\SHA256SUMS.txt
echo.
pause
exit /b 0

:build_failed
echo.
echo [FAILED] CRYON build did not complete. Exit code: %BUILD_EXIT%
echo Check the newest log in the build-logs folder.
echo Do not distribute an EXE from an earlier build unless its checksum is verified.
echo.
pause
exit /b %BUILD_EXIT%

:folder_error
echo [ERROR] Could not switch to the CRYON project directory.
pause
exit /b 1

:fail
set "BUILD_EXIT=1"
goto :build_failed
