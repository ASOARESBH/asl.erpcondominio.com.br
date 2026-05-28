#!/usr/bin/env python3
"""
controlid_bridge.py - Bridge Local Control iD -> ERP Hostgator
Versao: 2.0
Autor: ASL ERP Condominios

Instale as dependencias:
  pip install requests

Edite as CONFIGURACOES abaixo e execute:
  python controlid_bridge.py

Para rodar em segundo plano no Windows, crie um arquivo .bat com:
  start /B python controlid_bridge.py > bridge_log.txt 2>&1
"""

import requests
import time
import json
import os
import sys
import logging
from datetime import datetime

# =====================================================================
# CONFIGURACOES - EDITE AQUI
# =====================================================================
CONTROLID_IP       = "http://192.168.3.150"   # IP do equipamento na rede local
CONTROLID_USER     = "admin"                   # Usuario do equipamento
CONTROLID_PASS     = "admin"                   # Senha do equipamento

ERP_URL            = "https://asl.erpcondominios.com.br/api/bridge_receiver.php"
API_KEY            = "COLOQUE_SUA_CHAVE_AQUI"  # Chave salva em configuracoes.bridge_api_key no banco
BRIDGE_ID          = "portaria-principal"       # Nome identificador desta instalacao
DISPOSITIVO_ID     = 1                          # ID do dispositivo na tabela dispositivos_controlid

INTERVALO_SEGUNDOS = 5                          # Intervalo entre verificacoes (segundos)
STATE_FILE         = "ultimo_log.txt"           # Arquivo para persistir o ultimo log lido
LOG_FILE           = "bridge_log.txt"           # Arquivo de log local
# =====================================================================

# Configurar logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.FileHandler(LOG_FILE, encoding='utf-8'),
        logging.StreamHandler(sys.stdout)
    ]
)
log = logging.getLogger(__name__)


def login_controlid():
    """Faz login na API do equipamento e retorna o token de sessao."""
    url = f"{CONTROLID_IP}/login.fcgi"
    payload = {"login": CONTROLID_USER, "password": CONTROLID_PASS}
    try:
        res = requests.post(url, json=payload, timeout=5)
        if res.status_code == 200:
            data = res.json()
            session = data.get("session")
            if session:
                return session
            log.warning(f"Login OK mas sem session: {data}")
        else:
            log.error(f"Erro de login HTTP {res.status_code}: {res.text[:200]}")
    except requests.exceptions.ConnectionError:
        log.warning(f"Equipamento inacessivel em {CONTROLID_IP}")
    except Exception as e:
        log.error(f"Excecao no login: {e}")
    return None


def logout_controlid(session):
    """Faz logout para liberar a sessao no equipamento."""
    try:
        requests.post(f"{CONTROLID_IP}/logout.fcgi?session={session}", timeout=3)
    except Exception:
        pass


def obter_ultimo_log_processado():
    """Le o ultimo ID de log processado do arquivo de estado."""
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE, "r") as f:
                return int(f.read().strip())
        except (ValueError, IOError):
            pass
    return 0


def salvar_ultimo_log_processado(log_id):
    """Persiste o ultimo ID de log processado."""
    try:
        with open(STATE_FILE, "w") as f:
            f.write(str(log_id))
    except IOError as e:
        log.error(f"Erro ao salvar estado: {e}")


def buscar_novos_acessos(session, ultimo_log):
    """
    Busca logs de acesso no equipamento com ID maior que ultimo_log.
    Retorna uma lista de dicionarios com os logs.
    """
    url = f"{CONTROLID_IP}/load_objects.fcgi?session={session}"
    payload = {
        "object": "access_logs",
        "where": {
            "access_logs": {
                "id": {">": ultimo_log}
            }
        },
        "order": "id",
        "limit": 50  # Processa ate 50 logs por vez
    }
    try:
        res = requests.post(url, json=payload, timeout=8)
        if res.status_code == 200:
            data = res.json()
            return data.get("access_logs", [])
        elif res.status_code == 401:
            log.warning("Sessao expirada no equipamento.")
        else:
            log.error(f"Erro ao buscar logs HTTP {res.status_code}: {res.text[:200]}")
    except Exception as e:
        log.error(f"Excecao ao buscar acessos: {e}")
    return []


def formatar_eventos(logs):
    """
    Converte os logs da Control iD para o formato esperado pelo bridge_receiver.php.
    
    Campos da Control iD:
      id          -> ID unico do log no equipamento
      time        -> Timestamp Unix do evento
      event       -> Tipo de evento (0=entrada, 1=saida, etc.)
      user_id     -> ID do usuario no equipamento (pode ser 0 para UHF)
      card_value  -> Numero do cartao/TAG lida
      portal_id   -> ID da porta/portal
    """
    eventos = []
    for log_item in logs:
        # Para leituras UHF, o card_value pode vir como inteiro - converter para string
        card_value = str(log_item.get("card_value", "")).strip()
        
        eventos.append({
            "id":         int(log_item.get("id", 0)),
            "time":       int(log_item.get("time", 0)),
            "event_type": int(log_item.get("event", 0)),
            "user_id":    int(log_item.get("user_id", 0)),
            "uhf_tag":    card_value,   # TAG RFID UHF lida
            "card_value": card_value,   # Compatibilidade
            "door_id":    int(log_item.get("portal_id", 0)),
        })
    return eventos


def enviar_para_erp(eventos):
    """
    Envia os eventos formatados para o bridge_receiver.php no Hostgator.
    Retorna True se o envio foi bem-sucedido.
    """
    if not eventos:
        return True

    payload = {
        "acao":          "eventos",
        "dispositivo_id": DISPOSITIVO_ID,
        "bridge_id":     BRIDGE_ID,
        "eventos":       eventos
    }

    headers = {
        "X-API-KEY":    API_KEY,
        "X-Bridge-ID":  BRIDGE_ID,
        "Content-Type": "application/json",
        "User-Agent":   "ControlID-Bridge/2.0"
    }

    try:
        res = requests.post(ERP_URL, json=payload, headers=headers, timeout=15)
        if res.status_code == 200:
            data = res.json()
            if data.get("sucesso"):
                log.info(
                    f"ERP OK: processados={data.get('processados',0)} "
                    f"ignorados={data.get('ignorados',0)} "
                    f"erros={data.get('erros',0)}"
                )
                return True
            else:
                log.error(f"ERP retornou erro: {data.get('erro', 'desconhecido')}")
        elif res.status_code == 401:
            log.error("API Key invalida! Verifique a configuracao bridge_api_key no banco.")
        else:
            log.error(f"Erro HTTP {res.status_code} do ERP: {res.text[:300]}")
    except requests.exceptions.SSLError as e:
        log.error(f"Erro SSL ao conectar ao ERP: {e}")
    except requests.exceptions.ConnectionError as e:
        log.warning(f"ERP inacessivel (sem internet?): {e}")
    except Exception as e:
        log.error(f"Excecao ao enviar para ERP: {e}")
    return False


def enviar_heartbeat():
    """
    Envia um heartbeat periodico para o ERP informando que o bridge esta ativo.
    """
    payload = {
        "acao":      "heartbeat",
        "bridge_id": BRIDGE_ID,
        "versao":    "2.0",
        "dispositivos": [
            {
                "id":     DISPOSITIVO_ID,
                "online": True,
                "ultimo_contato": datetime.now().isoformat()
            }
        ]
    }
    headers = {
        "X-API-KEY":   API_KEY,
        "X-Bridge-ID": BRIDGE_ID,
        "Content-Type": "application/json"
    }
    try:
        res = requests.post(ERP_URL, json=payload, headers=headers, timeout=10)
        if res.status_code == 200:
            log.info("Heartbeat enviado com sucesso.")
        else:
            log.warning(f"Heartbeat retornou HTTP {res.status_code}")
    except Exception as e:
        log.warning(f"Heartbeat falhou: {e}")


def loop_principal():
    log.info("=" * 60)
    log.info("Bridge Control iD -> ERP Hostgator iniciado")
    log.info(f"Equipamento: {CONTROLID_IP}")
    log.info(f"ERP: {ERP_URL}")
    log.info(f"Dispositivo ID: {DISPOSITIVO_ID}")
    log.info("=" * 60)

    heartbeat_counter = 0

    while True:
        try:
            # Enviar heartbeat a cada 60 ciclos (~5 min)
            heartbeat_counter += 1
            if heartbeat_counter >= 60:
                enviar_heartbeat()
                heartbeat_counter = 0

            # Login no equipamento
            session = login_controlid()
            if not session:
                log.warning("Sem sessao. Aguardando proxima tentativa...")
                time.sleep(INTERVALO_SEGUNDOS)
                continue

            # Buscar novos logs
            ultimo_log = obter_ultimo_log_processado()
            logs_brutos = buscar_novos_acessos(session, ultimo_log)
            logout_controlid(session)

            if not logs_brutos:
                # Nenhum novo log - aguarda normalmente
                time.sleep(INTERVALO_SEGUNDOS)
                continue

            log.info(f"Encontrados {len(logs_brutos)} novos acessos (apos ID {ultimo_log})")

            # Formatar e enviar para o ERP
            eventos = formatar_eventos(logs_brutos)
            sucesso = enviar_para_erp(eventos)

            if sucesso:
                maior_id = max(e["id"] for e in eventos)
                salvar_ultimo_log_processado(maior_id)
                log.info(f"Estado atualizado. Ultimo log ID: {maior_id}")
            else:
                log.warning("Envio falhou. Tentara novamente no proximo ciclo.")

        except KeyboardInterrupt:
            log.info("Bridge encerrado pelo usuario.")
            sys.exit(0)
        except Exception as e:
            log.error(f"Erro inesperado no loop: {e}")

        time.sleep(INTERVALO_SEGUNDOS)


if __name__ == "__main__":
    loop_principal()
