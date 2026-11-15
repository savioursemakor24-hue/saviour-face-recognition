@echo off
echo ============================================
echo   SAVIOUR FACE RECOGNITION - FULL SETUP
echo ============================================
echo.

set OPENBLAS_NUM_THREADS=1
set OMP_NUM_THREADS=1
set MKL_NUM_THREADS=1
set NUMEXPR_NUM_THREADS=1
set PYTHONUTF8=1

cd /d "%~dp0"

echo [1/2] Training face recognition model...
.venv\Scripts\python.exe train.py
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Training failed!
    pause
    exit /b 1
)

echo.
echo [2/2] Starting web server...
echo.
echo  Open your browser at:
echo  >>> http://localhost:5000 <<<
echo.
.venv\Scripts\python.exe app.py

pause
