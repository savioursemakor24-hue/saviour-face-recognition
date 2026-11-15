@echo off
echo ============================================
echo   SAVIOUR FACE RECOGNITION - WEB APP
echo ============================================
echo.

set OPENBLAS_NUM_THREADS=1
set OMP_NUM_THREADS=1
set MKL_NUM_THREADS=1
set NUMEXPR_NUM_THREADS=1
set PYTHONUTF8=1

echo Starting web server...
echo.
echo  Open your browser at:
echo  >>> http://localhost:5000 <<<
echo.

cd /d "%~dp0"
.venv\Scripts\python.exe app.py

pause
