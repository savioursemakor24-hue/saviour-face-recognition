@echo off
echo ========================================================
echo   PUSH SAVIOUR FACE RECOGNITION TO GITHUB
echo ========================================================
echo Target: https://github.com/savioursemakor24-hue/saviour-face-recognition
echo.
echo NOTE: Make sure you created the empty repository on GitHub first:
echo       1. Go to: https://github.com/new
echo       2. Repository name: saviour-face-recognition
echo       3. Click "Create repository"
echo.
pause
echo.
echo Pushing code and 451 face vectors to GitHub...
cd /d "%~dp0"
git push -u origin main
echo.
if %ERRORLEVEL% EQU 0 (
    echo ========================================================
    echo   SUCCESS! PUSH COMPLETED TO GITHUB!
    echo ========================================================
    echo Now you can deploy to Vercel and Render in 1 click!
) else (
    echo ========================================================
    echo   Push failed or requested login credentials.
    echo ========================================================
)
pause
