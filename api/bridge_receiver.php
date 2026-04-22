<?php
/**
 * bridge_receiver.php — Receptor de eventos do Control ID Bridge
 *
 * Este endpoint é chamado pelo executável Python (controlid_bridge.py)
 * rodando no notebook/PC local para:
 *   - Receber heartbeat com status dos dispositivos
 *   - Receber access_logs coletados dos equipamentos
 *   - Fornecer fila de comandos pendentes
 *   - Confirmar execução de comandos
 *   - Fornecer lista de TAGs para sincronização
 *
 * Autenticação: Header X-Bridge-Key (configurado em config.json do bridge)
 */

ob_start();
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/auth_helper.php';

// ─── CORS ────────────────────────────────────────────────────────────────────
$allowed_origins = [
    'https://asl.erpcondominios.com.br',
    'http://localhost:8765',
    'http://localhost:8766',
    'http://127.0.0.1:8765',
];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowed_origins)) {
    header("Access-Control-Allow-Origin: $origin");
    header("Access-Control-Allow-Credentials: true");
}
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, X-Bridge-Key, X-Bridge-ID");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ─── LOG DE DEBUG ─────────────────────────────────────────────────────────────
function log_bridge(string $nivel, string $msg): void {
    $ts = date('Y-m-d H:i:s');
    error_log("[BRIDGE][$nivel] $msg");
}

// ─── AUTENTICAÇÃO DO BRIDGE ──────────────────────────────────────────────────
function autenticar_bridge(mysqli $conn): bool {
    $key_recebida = $_SERVER['HTTP_X_BRIDGE_KEY'] ?? '';
    if (empty($key_recebida)) {
        return false;
    }

    // Buscar chave configurada no banco (tabela configuracoes)
    $stmt = $conn->prepare("SELECT valor FROM configuracoes WHERE chave = 'bridge_api_key' LIMIT 1");
    if (!$stmt) return false;
    $stmt->execute();
    $result = $stmt->get_result();
    $row    = $result->fetch_assoc();
    $stmt->close();

    if (!$row) {
        // Se não há chave configurada, aceitar qualquer bridge (modo desenvolvimento)
        log_bridge('WARN', 'bridge_api_key não configurada — aceitando sem autenticação');
        return true;
    }

    return hash_equals($row['valor'], $key_recebida);
}

// ─── CONEXÃO ─────────────────────────────────────────────────────────────────
$conn = conectar_banco();
if (!$conn) {
    http_response_code(503);
    echo json_encode(['sucesso' => false, 'erro' => 'Banco de dados indisponível']);
    exit;
}

// Verificar autenticação
if (!autenticar_bridge($conn)) {
    http_response_code(401);
    echo json_encode(['sucesso' => false, 'erro' => 'Autenticação inválida']);
    log_bridge('ERROR', 'Tentativa não autorizada de acesso ao bridge_receiver');
    exit;
}

// ─── ROTEAMENTO ──────────────────────────────────────────────────────────────
$method = $_SERVER['REQUEST_METHOD'];
$acao   = '';
$bridge_id = $_SERVER['HTTP_X_BRIDGE_ID'] ?? 'desconhecido';

if ($method === 'GET') {
    $acao = $_GET['acao'] ?? '';
} elseif ($method === 'POST') {
    $body = json_decode(file_get_contents('php://input'), true) ?? [];
    $acao = $body['acao'] ?? '';
}

log_bridge('INFO', "Ação: $acao | Bridge: $bridge_id | Método: $method");

switch ($acao) {

    // ─── HEARTBEAT ────────────────────────────────────────────────────────────
    case 'heartbeat':
        $dispositivos = $body['dispositivos'] ?? [];
        $versao       = $body['versao'] ?? '';
        $timestamp    = $body['timestamp'] ?? date('c');

        foreach ($dispositivos as $d) {
            $disp_id = (int)($d['id'] ?? 0);
            $online  = $d['online'] ? 1 : 0;
            $ultimo  = $d['ultimo_contato'] ?? null;
            $erros   = (int)($d['erros_consecutivos'] ?? 0);

            // Atualizar status na tabela dispositivos_controlid
            $stmt = $conn->prepare(
                "UPDATE dispositivos_controlid
                 SET online = ?, ultimo_contato = ?, erros_consecutivos = ?,
                     bridge_id = ?, bridge_versao = ?, updated_at = NOW()
                 WHERE id = ?"
            );
            if ($stmt) {
                $stmt->bind_param("isiisi", $online, $ultimo, $erros, $bridge_id, $versao, $disp_id);
                $stmt->execute();
                $stmt->close();
            }
        }

        ob_end_clean();
        echo json_encode([
            'sucesso'   => true,
            'timestamp' => date('c'),
            'mensagem'  => 'Heartbeat registrado'
        ]);
        break;

    // ─── RECEBER EVENTOS (access_logs) ────────────────────────────────────────
    case 'eventos':
        $disp_id = (int)($body['dispositivo_id'] ?? 0);
        $eventos = $body['eventos'] ?? [];

        if (empty($eventos)) {
            ob_end_clean();
            echo json_encode(['sucesso' => true, 'processados' => 0]);
            break;
        }

        $processados = 0;
        $erros_ev    = 0;

        foreach ($eventos as $ev) {
            $log_id_ext  = (int)($ev['id'] ?? 0);
            $user_id     = (int)($ev['user_id'] ?? 0);
            $card_value  = $conn->real_escape_string($ev['card_value'] ?? $ev['uhf_tag'] ?? '');
            $event_type  = (int)($ev['event_type'] ?? 0);
            $event_time  = $ev['time'] ?? date('Y-m-d H:i:s');
            $door_id     = (int)($ev['door_id'] ?? 0);

            // Normalizar timestamp
            if (is_numeric($event_time)) {
                $event_time = date('Y-m-d H:i:s', (int)$event_time);
            }

            // Verificar se já foi processado
            $stmt = $conn->prepare(
                "SELECT id FROM bridge_eventos_log
                 WHERE dispositivo_id = ? AND log_id_externo = ?
                 LIMIT 1"
            );
            if ($stmt) {
                $stmt->bind_param("ii", $disp_id, $log_id_ext);
                $stmt->execute();
                $r = $stmt->get_result();
                if ($r->num_rows > 0) {
                    $stmt->close();
                    continue; // Já processado
                }
                $stmt->close();
            }

            // Buscar veículo pela TAG
            $veiculo_id  = null;
            $morador_id  = null;
            $morador_nome = null;
            $placa       = null;

            if (!empty($card_value)) {
                $stmt = $conn->prepare(
                    "SELECT v.id, v.placa, v.morador_id, m.nome
                     FROM veiculos v
                     LEFT JOIN moradores m ON m.id = v.morador_id
                     WHERE v.tag = ? AND v.ativo = 1
                     LIMIT 1"
                );
                if ($stmt) {
                    $stmt->bind_param("s", $card_value);
                    $stmt->execute();
                    $rv = $stmt->get_result()->fetch_assoc();
                    $stmt->close();
                    if ($rv) {
                        $veiculo_id   = $rv['id'];
                        $morador_id   = $rv['morador_id'];
                        $morador_nome = $rv['nome'];
                        $placa        = $rv['placa'];
                    }
                }
            }

            // Registrar no log de eventos do bridge
            $stmt = $conn->prepare(
                "INSERT INTO bridge_eventos_log
                 (dispositivo_id, log_id_externo, user_id_controlid, card_value,
                  event_type, event_time, door_id, veiculo_id, morador_id, processado)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)"
            );
            if ($stmt) {
                $stmt->bind_param(
                    "iiisisiis",
                    $disp_id, $log_id_ext, $user_id, $card_value,
                    $event_type, $event_time, $door_id, $veiculo_id, $morador_id
                );
                // Corrigir: morador_id pode ser null
                $stmt->bind_param(
                    "iiisisiii",
                    $disp_id, $log_id_ext, $user_id, $card_value,
                    $event_type, $event_time, $door_id, $veiculo_id, $morador_id
                );
                $stmt->execute();
                $stmt->close();
            }

            // Registrar no controle de acesso principal
            if ($veiculo_id && $morador_id) {
                $tipo_acesso = ($event_type === 0) ? 'entrada' : 'saida';
                $obs = "TAG UHF: $card_value | Dispositivo ID: $disp_id";

                $stmt = $conn->prepare(
                    "INSERT INTO registros_acesso
                     (morador_id, veiculo_id, tipo, data_hora, observacao, origem)
                     VALUES (?, ?, ?, ?, ?, 'controlid')"
                );
                if ($stmt) {
                    $stmt->bind_param("iisss", $morador_id, $veiculo_id, $tipo_acesso, $event_time, $obs);
                    $stmt->execute();
                    $stmt->close();
                }

                log_bridge('INFO', "Acesso registrado: Morador=$morador_nome Placa=$placa Tipo=$tipo_acesso");
            }

            $processados++;
        }

        // Atualizar ultimo_log_id no dispositivo
        if ($processados > 0) {
            $ultimo_log = max(array_column($eventos, 'id'));
            $stmt = $conn->prepare(
                "UPDATE dispositivos_controlid SET ultimo_log_id = ? WHERE id = ?"
            );
            if ($stmt) {
                $stmt->bind_param("ii", $ultimo_log, $disp_id);
                $stmt->execute();
                $stmt->close();
            }
        }

        ob_end_clean();
        echo json_encode([
            'sucesso'     => true,
            'processados' => $processados,
            'erros'       => $erros_ev
        ]);
        break;

    // ─── FILA DE COMANDOS ─────────────────────────────────────────────────────
    case 'fila_comandos':
        $disp_id = (int)($_GET['dispositivo_id'] ?? 0);

        $stmt = $conn->prepare(
            "SELECT id, endpoint, verb, body
             FROM bridge_fila_comandos
             WHERE dispositivo_id = ? AND status = 'pendente'
             ORDER BY created_at ASC
             LIMIT 10"
        );

        $comandos = [];
        if ($stmt) {
            $stmt->bind_param("i", $disp_id);
            $stmt->execute();
            $res = $stmt->get_result();
            while ($row = $res->fetch_assoc()) {
                $row['body'] = json_decode($row['body'] ?? '{}', true);
                $comandos[]  = $row;
            }
            $stmt->close();
        }

        ob_end_clean();
        echo json_encode(['sucesso' => true, 'comandos' => $comandos]);
        break;

    // ─── CONFIRMAR COMANDO ────────────────────────────────────────────────────
    case 'confirmar_comando':
        $cmd_id    = (int)($body['cmd_id'] ?? 0);
        $status    = $conn->real_escape_string($body['status'] ?? 'executado');
        $resultado = json_encode($body['resultado'] ?? []);

        $stmt = $conn->prepare(
            "UPDATE bridge_fila_comandos
             SET status = ?, resultado = ?, executado_em = NOW()
             WHERE id = ?"
        );
        if ($stmt) {
            $stmt->bind_param("ssi", $status, $resultado, $cmd_id);
            $stmt->execute();
            $stmt->close();
        }

        ob_end_clean();
        echo json_encode(['sucesso' => true]);
        break;

    // ─── TAGS PARA SINCRONIZAÇÃO ──────────────────────────────────────────────
    case 'tags_para_sync':
        $disp_id = (int)($_GET['dispositivo_id'] ?? 0);

        // Buscar veículos ativos com TAG preenchida
        $stmt = $conn->prepare(
            "SELECT v.id AS veiculo_id, v.placa, v.modelo, v.tag,
                    v.morador_id,
                    COALESCE(m.nome, d.nome_completo, 'Desconhecido') AS nome
             FROM veiculos v
             LEFT JOIN moradores m ON m.id = v.morador_id
             LEFT JOIN dependentes d ON d.id = v.dependente_id
             WHERE v.ativo = 1 AND v.tag IS NOT NULL AND v.tag != ''
             ORDER BY v.id"
        );

        $tags = [];
        if ($stmt) {
            $stmt->execute();
            $res = $stmt->get_result();
            while ($row = $res->fetch_assoc()) {
                $tags[] = $row;
            }
            $stmt->close();
        }

        ob_end_clean();
        echo json_encode(['sucesso' => true, 'tags' => $tags, 'total' => count($tags)]);
        break;

    // ─── ENFILEIRAR COMANDO (chamado pelo módulo de dispositivos do ERP) ───────
    case 'enfileirar_comando':
        // Requer autenticação de admin (chamada interna do ERP)
        $disp_id  = (int)($body['dispositivo_id'] ?? 0);
        $endpoint = $conn->real_escape_string($body['endpoint'] ?? '');
        $verb     = $conn->real_escape_string(strtoupper($body['verb'] ?? 'POST'));
        $cmd_body = json_encode($body['body'] ?? []);

        if (!$disp_id || !$endpoint) {
            ob_end_clean();
            http_response_code(400);
            echo json_encode(['sucesso' => false, 'erro' => 'dispositivo_id e endpoint são obrigatórios']);
            break;
        }

        $stmt = $conn->prepare(
            "INSERT INTO bridge_fila_comandos
             (dispositivo_id, endpoint, verb, body, status, created_at)
             VALUES (?, ?, ?, ?, 'pendente', NOW())"
        );
        if ($stmt) {
            $stmt->bind_param("isss", $disp_id, $endpoint, $verb, $cmd_body);
            $stmt->execute();
            $new_id = $conn->insert_id;
            $stmt->close();
            ob_end_clean();
            echo json_encode(['sucesso' => true, 'cmd_id' => $new_id]);
        } else {
            ob_end_clean();
            http_response_code(500);
            echo json_encode(['sucesso' => false, 'erro' => 'Erro ao enfileirar comando']);
        }
        break;

    default:
        ob_end_clean();
        http_response_code(400);
        echo json_encode(['sucesso' => false, 'erro' => "Ação desconhecida: $acao"]);
        break;
}

$conn->close();
