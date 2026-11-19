@echo off
setlocal
cd /d "%~dp0.."
node scripts\verify-build.js
exit /b %errorlevel%
