#!/usr/bin/env python3
"""
controlid_bridge.py - Bridge Local Control iD -> ERP HostGator
Versao: 3.0
Autor: ASL ERP Condominios

Instale as dependencias:
  pip install requests

Edite as CONFIGURACOES abaixo e execute:
  python controlid_bridge.py

Para rodar em segundo plano no Windows:
  pythonw controlid_bridge.py
  (ou use o instalar_servico_windows.bat)

IMPORTANTE — Mod_Security no HostGator:
  O servidor usa WAF (Mod_Security) que bloqueia requisicoes
  com User-Agent suspeito ou cabecalhos incomuns.
  Este script usa User-Agent de browser para evitar bloqueios.
"""

import requests
import time
import json
import os
import sys
import logging
import urllib3
from datetime import datetime

# Suprimir aviso de SSL (necessario no HostGator com certificado auto-assinado)
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# =====================================================================
# CONFIGURACOES - EDITE AQUI
# =====================================================================
CONTROLID_IP       = "http://192.168.3.150"   # IP do equipamento na rede local
CONTROLID_USER     = "admin"                   # Usuario do equipamento
CONTROLID_PASS     = "admin"                   # Senha do equipamento

ERP_URL            = "https://asl.erpcondominios.com.br/api/bridge_receiver.php"
API_KEY            = "COLOQUE_SUA_CHAVE_AQUI"  # Chave salva em configuracoes.bridge_api_key no banco
BRIDGE_ID          = "portaria-principal"       # Nome identificador desta instalacao
DISPOSITIVO_ID     = 1                          # ID do dispositivo na tabela controlid_dispositivos

INTERVALO_SEGUNDOS = 5                          # Intervalo entre verificacoes (segundos)
MAX_LOGS_POR_CICLO = 50                         # Maximo de eventos por envio
STATE_FILE         = "ultimo_log.txt"           # Arquivo para persistir o ultimo log lido
LOG_FILE           = "bridge_log.txt"           # Arquivo de log local
# =====================================================================

# ── Logging ──────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE, encoding="utf-8"),
        logging.StreamHandler(sys.stdout),
    ],
)
log = logging.getLogger(__name__)

# ── Headers para o ERP ───────────────────────────────────────────────
# IMPORTANTE: O Mod_Security do HostGator bloqueia User-Agents de scripts
# Python (ex: "python-requests/2.x"). Usar User-Agent de browser resolve
# o HTTP 406. O Accept: application/json tambem e necessario.
ERP_HEADERS = {
    "Content-Type":  "application/json",
    "Accept":        "application/json",
    "X-API-KEY":     API_KEY,
    "X-Bridge-ID":   BRIDGE_ID,
    # User-Agent de browser para nao ser bloqueado pelo Mod_Security
    "User-Agent":    (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
}


# ── Control iD: Login ────────────────────────────────────────────────
def login_controlid():
    """Faz login na API do equipamento e retorna o token de sessao."""
    url = f"{CONTROLID_IP}/login.fcgi"
    payload = {"login": CONTROLID_USER, "password": CONTROLID_PASS}
    try:
        res = requests.post(url, json=payload, timeout=5, verify=False)
        if res.status_code == 200:
            data = res.json()
            session = data.get("session")
            if session:
                log.info("Login no equipamento realizado com sucesso.")
                return session
            log.warning(f"Login OK mas sem session no retorno: {data}")
        else:
            log.error(f"Falha no login HTTP {res.status_code}: {res.text[:200]}")
    except requests.exceptions.ConnectionError:
        log.warning(f"Equipamento inacessivel em {CONTROLID_IP} (sem rede local?)")
    except Exception as e:
        log.error(f"Excecao no login: {e}")
    return None


# ── Control iD: Logout ───────────────────────────────────────────────
def logout_controlid(session):
    """Faz logout para liberar a sessao no equipamento."""
    try:
        requests.post(
            f"{CONTROLID_IP}/logout.fcgi?session={session}",
            timeout=3,
            verify=False,
        )
    except Exception:
        pass


# ── Estado local ─────────────────────────────────────────────────────
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


# ── Control iD: Buscar logs ──────────────────────────────────────────
def buscar_novos_acessos(session, ultimo_log):
    """
    Busca logs de acesso no equipamento com ID maior que ultimo_log.
    Retorna uma lista de dicionarios com os logs brutos.
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
        "limit": MAX_LOGS_POR_CICLO,
    }
    try:
        res = requests.post(url, json=payload, timeout=8, verify=False)
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


# ── Formatacao dos eventos ────────────────────────────────────────────
def formatar_eventos(logs):
    """
    Converte os logs brutos da Control iD para o formato esperado
    pelo bridge_receiver.php.

    Campos da Control iD:
      id          -> ID unico do log no equipamento
      time        -> Timestamp Unix do evento
      event       -> Tipo de evento (0=entrada, 1=saida, 7=liberado, 4=negado)
      user_id     -> ID do usuario no equipamento (0 para leituras UHF puras)
      card_value  -> Numero da TAG/cartao lido
      portal_id   -> ID da porta/portal
    """
    eventos = []
    for item in logs:
        card_value = str(item.get("card_value", "")).strip()
        eventos.append({
            "id":         int(item.get("id", 0)),
            "time":       int(item.get("time", 0)),
            "event_type": int(item.get("event", 0)),
            "user_id":    int(item.get("user_id", 0)),
            "uhf_tag":    card_value,
            "card_value": card_value,
            "door_id":    int(item.get("portal_id", 0)),
        })
    return eventos


# ── ERP: Enviar eventos ───────────────────────────────────────────────
def enviar_para_erp(eventos):
    """
    Envia os eventos formatados para o bridge_receiver.php no HostGator.
    Retorna True se o envio foi bem-sucedido.

    Correcoes para o Mod_Security (HTTP 406):
      1. User-Agent de browser (nao "python-requests/x.x")
      2. Header Accept: application/json
      3. Serializar o JSON manualmente e usar data= em vez de json=
         para evitar que o requests adicione headers extras que
         ativam regras do WAF.
    """
    if not eventos:
        return True

    payload = {
        "acao":           "eventos",
        "dispositivo_id": DISPOSITIVO_ID,
        "bridge_id":      BRIDGE_ID,
        "eventos":        eventos,
    }

    # Serializar manualmente — evita que requests modifique o Content-Type
    payload_str = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))

    # Reconstruir headers com a API_KEY atualizada (caso tenha mudado em runtime)
    headers = dict(ERP_HEADERS)
    headers["X-API-KEY"]       = API_KEY
    headers["Content-Length"]  = str(len(payload_str.encode("utf-8")))

    try:
        log.info(f"Enviando {len(eventos)} evento(s) para o ERP...")
        res = requests.post(
            ERP_URL,
            data=payload_str.encode("utf-8"),
            headers=headers,
            timeout=20,
            verify=False,
        )

        log.debug(f"ERP HTTP {res.status_code} | Body: {res.text[:300]}")

        if res.status_code == 200:
            try:
                data = res.json()
            except ValueError:
                log.error(f"ERP retornou HTTP 200 mas body nao e JSON: {res.text[:200]}")
                return False

            if data.get("sucesso"):
                log.info(
                    f"ERP OK: processados={data.get('processados', 0)} "
                    f"ignorados={data.get('ignorados', 0)} "
                    f"erros={data.get('erros', 0)}"
                )
                return True
            else:
                log.error(f"ERP retornou sucesso=false: {data.get('erro', 'desconhecido')}")

        elif res.status_code == 401:
            log.error(
                "API Key invalida ou nao configurada! "
                "Verifique a variavel API_KEY neste script e a chave "
                "bridge_api_key na tabela configuracoes do banco."
            )
        elif res.status_code == 406:
            log.error(
                "HTTP 406 — Mod_Security bloqueou a requisicao. "
                "Verifique se o .htaccess da API tem SecRuleEngine Off "
                "para o bridge_receiver.php."
            )
        else:
            log.error(f"Erro HTTP {res.status_code} do ERP: {res.text[:300]}")

    except requests.exceptions.SSLError as e:
        log.error(f"Erro SSL: {e}")
    except requests.exceptions.ConnectionError as e:
        log.warning(f"ERP inacessivel (sem internet?): {e}")
    except Exception as e:
        log.error(f"Excecao ao enviar para ERP: {e}")

    return False


# ── ERP: Heartbeat ────────────────────────────────────────────────────
def enviar_heartbeat():
    """
    Envia um heartbeat periodico para o ERP informando que o bridge
    esta ativo e qual dispositivo esta sendo monitorado.
    """
    payload = {
        "acao":      "heartbeat",
        "bridge_id": BRIDGE_ID,
        "versao":    "3.0",
        "dispositivos": [
            {
                "id":             DISPOSITIVO_ID,
                "online":         True,
                "ultimo_contato": datetime.now().isoformat(),
            }
        ],
    }

    payload_str = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    headers = dict(ERP_HEADERS)
    headers["X-API-KEY"]      = API_KEY
    headers["Content-Length"] = str(len(payload_str.encode("utf-8")))

    try:
        res = requests.post(
            ERP_URL,
            data=payload_str.encode("utf-8"),
            headers=headers,
            timeout=10,
            verify=False,
        )
        if res.status_code == 200:
            log.info("Heartbeat enviado com sucesso.")
        else:
            log.warning(f"Heartbeat retornou HTTP {res.status_code}: {res.text[:100]}")
    except Exception as e:
        log.warning(f"Heartbeat falhou: {e}")


# ── Loop principal ────────────────────────────────────────────────────
def loop_principal():
    log.info("=" * 60)
    log.info("Bridge Control iD -> ERP HostGator v3.0 iniciado")
    log.info(f"Equipamento : {CONTROLID_IP}")
    log.info(f"ERP         : {ERP_URL}")
    log.info(f"Dispositivo : ID={DISPOSITIVO_ID} / Bridge={BRIDGE_ID}")
    log.info("=" * 60)

    heartbeat_counter = 0

    while True:
        try:
            # Heartbeat a cada ~5 minutos (60 ciclos de 5s)
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
            ultimo_log  = obter_ultimo_log_processado()
            logs_brutos = buscar_novos_acessos(session, ultimo_log)
            logout_controlid(session)

            if not logs_brutos:
                time.sleep(INTERVALO_SEGUNDOS)
                continue

            log.info(f"Encontrados {len(logs_brutos)} novo(s) acesso(s) apos ID {ultimo_log}")

            # Formatar e enviar
            eventos = formatar_eventos(logs_brutos)
            sucesso = enviar_para_erp(eventos)

            if sucesso:
                maior_id = max(e["id"] for e in eventos)
                salvar_ultimo_log_processado(maior_id)
                log.info(f"Estado atualizado. Ultimo log ID: {maior_id}")
            else:
                log.warning("Envio falhou. Tentara novamente no proximo ciclo.")

        except KeyboardInterrupt:
            log.info("Bridge encerrado pelo usuario (Ctrl+C).")
            sys.exit(0)
        except Exception as e:
            log.error(f"Erro inesperado no loop: {e}")

        time.sleep(INTERVALO_SEGUNDOS)


if __name__ == "__main__":
    loop_principal()
