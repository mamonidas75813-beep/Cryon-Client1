@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js 22 or newer is required.& exit /b 1)
for /f "tokens=1" %%v in ('node -p "process.versions.node.split('.')[0]"') do set "NODE_MAJOR=%%v"
if %NODE_MAJOR% LSS 22 (echo Node.js 22 or newer is required.& exit /b 1)
if not exist node_modules call npm install --include=dev --no-audit --no-fund
if errorlevel 1 exit /b 1
call npm run build:portable
if errorlevel 1 exit /b 1
node scripts\collect-artifact.js portable
if errorlevel 1 exit /b 1
echo Portable executable created in release\CRYON CLIENT Portable.exe
