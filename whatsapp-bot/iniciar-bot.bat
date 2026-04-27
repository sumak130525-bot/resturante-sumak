@echo off
title Sumak WhatsApp Bot
color 0A
echo.
echo  ===================================
echo    SUMAK WHATSAPP BOT
echo    Restaurante Sumak - Mendoza
echo  ===================================
echo.
echo  Iniciando el bot...
echo.

cd /d "C:\Users\titos\Projects\restaurante\whatsapp-bot"

:: Verificar si existe node_modules
if not exist "node_modules" (
    echo  Instalando dependencias por primera vez...
    echo  Esto puede tardar unos minutos.
    echo.
    npm install
    echo.
)

:: Verificar si existe .env
if not exist ".env" (
    echo  ADVERTENCIA: No se encontro el archivo .env
    echo  Copiando desde env.txt...
    copy env.txt .env
    echo.
)

:: Intentar con ts-node primero, si falla compilar y ejecutar
if exist "node_modules\.bin\ts-node.cmd" (
    echo  Iniciando con ts-node...
    echo.
    npx ts-node src/index.ts
) else (
    echo  Compilando TypeScript...
    npm run build
    echo.
    echo  Ejecutando bot compilado...
    echo.
    node dist/index.js
)

echo.
echo  El bot se detuvo. Presiona cualquier tecla para cerrar.
pause > nul
