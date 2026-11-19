@echo off
setlocal
cd /d "%~dp0"
echo Removing generated build output and release binaries...
if exist build-output rmdir /s /q build-output
if exist dist rmdir /s /q dist
if exist "release\CRYON CLIENT Setup.exe" del /q "release\CRYON CLIENT Setup.exe"
if exist "release\CRYON CLIENT Portable.exe" del /q "release\CRYON CLIENT Portable.exe"
if exist release\README.txt del /q release\README.txt
if exist release\VERSION.txt del /q release\VERSION.txt
if exist release\SHA256SUMS.txt del /q release\SHA256SUMS.txt
echo Clean complete. Source files and npm dependencies were kept.
