@echo off
title OZEK Lamp Studio
cd /d "%~dp0"

echo ============================================
echo   OZEK Lamp Studio - Arrancando entorno 3D
echo ============================================

if not exist "node_modules" (
  echo Instalando dependencias por primera vez...
  call npm.cmd install
  if errorlevel 1 (
    echo Error instalando dependencias. Verifica que Node.js este instalado.
    pause
    exit /b 1
  )
)

echo Abriendo navegador en http://localhost:5173 ...
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:5173"

call npm.cmd run dev -- --port 5173
pause
