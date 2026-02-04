@echo off
setlocal enabledelayedexpansion
color 0C
title Steam Manifest Hub - CLI Edition

:: Disclaimer
cls
echo.
echo ================================
echo [DISCLAIMER]
echo ================================
echo.
echo This script is for informational purposes only.
echo We are not responsible for any consequences that may arise from using the provided data.
echo.

choice /c YN /n /m "Press Y to accept and continue, or N to exit: "
if errorlevel 2 exit /b
if errorlevel 1 goto :main

:main
color 0A
cls
echo.
echo ================================
echo Steam Manifest Hub - CLI Edition
echo ================================
echo.

:input
set "appid="
set /p "appid=Enter your desired Steam AppID: "

:: Validate input
if not defined appid goto :input
echo %appid%| findstr /r "^[0-9][0-9]*$" >nul
if errorlevel 1 (
    echo.
    echo [ERROR] Please enter numbers only.
    echo.
    timeout /t 3 /nobreak >nul
    goto :main
)

:: Check manifest
echo.
echo ^> Initiating manifest check for Steam AppID: %appid%
echo ^> Searching database...

:: GitHub API check with improved error handling
set "url=https://api.github.com/repos/SteamAutoCracks/ManifestHub/branches/%appid%"
powershell -Command "$ProgressPreference='SilentlyContinue';try{$r=Invoke-WebRequest -Uri '%url%' -UseBasicParsing -ErrorAction Stop;exit 0}catch{exit 1}" >nul 2>&1

if errorlevel 1 (
    echo ^> Manifest not found.
    echo.
    echo No manifests were found for this Steam application, at least for now...
    echo.
    pause
    goto :main
)

:: Manifest found
echo ^> Manifest found in database!
echo ^> Preparing download link...
echo ^> Ready for download.
echo.
echo Download link:
echo https://codeload.github.com/SteamAutoCracks/ManifestHub/zip/refs/heads/%appid%
echo.
echo The manifests are downloaded from the ManifestHub Database.
echo Show them support on GitHub: https://github.com/SteamAutoCracks/ManifestHub/
echo.
pause
goto :main