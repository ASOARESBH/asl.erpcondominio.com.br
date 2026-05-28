@echo off
title Bridge Control iD - ERP Condominio
echo ================================================
echo  Bridge Control iD - ERP Condominio
echo  Iniciando em segundo plano...
echo ================================================

REM Verifica se Python esta instalado
python --version >nul 2>&1
if errorlevel 1 (
    echo ERRO: Python nao encontrado. Instale em https://python.org
    pause
    exit /b 1
)

REM Instala dependencias se necessario
pip install requests --quiet

REM Inicia o bridge em segundo plano
start "Bridge ControlID" /MIN python controlid_bridge.py

echo Bridge iniciado em segundo plano.
echo Logs salvos em: bridge_log.txt
echo Para parar, feche a janela "Bridge ControlID" ou use o Gerenciador de Tarefas.
echo.
pause
