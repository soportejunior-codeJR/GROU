@echo off
REM ============================================================
REM  Panel de Convocatoria JC - servidor local de desarrollo
REM
REM  Deja el panel en http://localhost:3000 y abre el navegador.
REM  Recarga sola cuando alguien cambia el codigo.
REM
REM  Resuelve tres cosas que ya nos tumbaron el servidor:
REM   1. Libera el puerto 3000 si quedo un proceso zombi
REM   2. Usa .next-dev, para que un "npm run build" en paralelo
REM      no le borre los chunks por debajo
REM   3. Fuerza el puerto 3000: en el 3001 el login de Google
REM      falla, porque Supabase solo autoriza localhost:3000
REM ============================================================
setlocal
cd /d "%~dp0web"

echo.
echo ===============================================
echo   Panel de Convocatoria JC - desarrollo local
echo ===============================================
echo.

REM --- 1. Liberar el puerto 3000 -------------------------------
echo [1/4] Liberando el puerto 3000...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:"LISTENING" ^| findstr ":3000 "') do (
    echo       proceso %%p usando el puerto, cerrandolo
    taskkill /F /PID %%p >nul 2>&1
)

REM --- 2. Avisar si la memoria esta justa -----------------------
echo [2/4] Revisando memoria libre...
for /f "skip=1 tokens=1" %%m in ('wmic OS get FreePhysicalMemory 2^>nul') do (
    if not "%%m"=="" (
        set /a LIBRE=%%m/1024
        goto :memoria_lista
    )
)
:memoria_lista
if defined LIBRE (
    echo       %LIBRE% MB libres
    if %LIBRE% LSS 1500 (
        echo.
        echo       AVISO: queda poca memoria. Windows puede matar el servidor.
        echo       Cierra ChatGPT o pestanas de Chrome si se cae solo.
        echo.
    )
)

REM --- 3. Dependencias -----------------------------------------
if not exist "node_modules" (
    echo [3/4] Instalando dependencias, tarda un minuto...
    call npm install --no-audit --no-fund
) else (
    echo [3/4] Dependencias ya instaladas.
)

REM --- 4. Arrancar ---------------------------------------------
echo [4/4] Arrancando el servidor...
echo.
echo       Panel:  http://localhost:3000
echo       Entrar: soportejunior@tocaunavida.org
echo.
echo       Para detenerlo: Ctrl+C, o cierra esta ventana.
echo.

start "" "http://localhost:3000"

set NEXT_DIST_DIR=.next-dev
call npm run dev

endlocal
