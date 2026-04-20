<?php
/**
 * api_dispositivos_controlid.php — API de Dispositivos Control ID v1.0
 *
 * Gerencia leitores Control ID (IDUHF, iDAccess, etc.) e realiza
 * integração direta com a API REST dos equipamentos para:
 *   - Cadastro/edição/remoção de dispositivos
 *   - Teste de conexão (login na API do equipamento)
 *   - Sincronização de TAGs UHF dos veículos cadastrados
 *   - Coleta de logs de acesso do equipamento
 *
 * Endpoints:
 *   GET    ?acao=listar           — Lista todos os dispositivos
 *   GET    ?acao=obter&id=N       — Obtém um dispositivo
 *   POST   {acao:salvar}          — Cria ou atualiza dispositivo
 *   POST   {acao:excluir, id:N}   — Remove dispositivo
 *   POST   {acao:testar_conexao, id:N}         — Testa conexão com o equipamento
 *   POST   {acao:sincronizar_tags, id:N}       — Sincroniza TAGs dos veículos
 *   POST   {acao:coletar_logs, id:N}           — Coleta access_logs do equipamento
 *   GET    ?acao=sync_log&dispositivo_id=N     — Log de sincronizações
 *   GET    ?acao=leituras&dispositivo_id=N     — Leituras coletadas
 */

ob_start();
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/auth_helper.php';

verificarAutenticacao(true, 'admin');

$metodo = $_SERVER['REQUEST_METHOD'];
$acao   = $metodo === 'GET' ? ($_GET['acao'] ?? '') : '';

if ($metodo === 'POST') {
    $body = json_decode(file_get_contents('php://input'), true) ?? [];
    $acao = $body['acao'] ?? '';
}

$conn = conectar_banco();

// ============================================================
// ROTEAMENTO
// ============================================================
switch ($acao) {
    case 'listar':         _listar($conn);         break;
    case 'obter':          _obter($conn);           break;
    case 'salvar':         _salvar($conn, $body);   break;
    case 'excluir':        _excluir($conn, $body);  break;
    case 'testar_conexao': _testarConexao($conn, $body); break;
    case 'sincronizar_tags': _sincronizarTags($conn, $body); break;
    case 'coletar_logs':   _coletarLogs($conn, $body); break;
    case 'sync_log':       _syncLog($conn);         break;
    case 'leituras':       _leituras($conn);        break;
    default:
        retornar_json(false, 'Ação inválida ou não informada.');
}

fechar_conexao($conn);

// ============================================================
// LISTAR
// ============================================================
function _listar($conn) {
    $sql = "SELECT d.*,
                   (SELECT COUNT(*) FROM dispositivos_controlid_sync_log l WHERE l.dispositivo_id = d.id) AS total_syncs,
                   (SELECT COUNT(*) FROM dispositivos_controlid_leituras lr WHERE lr.dispositivo_id = d.id) AS total_leituras
            FROM dispositivos_controlid d
            ORDER BY d.ativo DESC, d.nome ASC";
    $res = $conn->query($sql);
    if (!$res) retornar_json(false, 'Erro ao listar dispositivos: ' . $conn->error);

    $lista = [];
    while ($row = $res->fetch_assoc()) {
        // Não expor senha
        unset($row['senha_api'], $row['session_token']);
        $lista[] = $row;
    }
    retornar_json(true, 'OK', ['dispositivos' => $lista]);
}

// ============================================================
// OBTER
// ============================================================
function _obter($conn) {
    $id = intval($_GET['id'] ?? 0);
    if (!$id) retornar_json(false, 'ID não informado.');

    $stmt = $conn->prepare("SELECT * FROM dispositivos_controlid WHERE id = ?");
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    if (!$row) retornar_json(false, 'Dispositivo não encontrado.');

    unset($row['senha_api'], $row['session_token']);
    retornar_json(true, 'OK', ['dispositivo' => $row]);
}

// ============================================================
// SALVAR (criar ou atualizar)
// ============================================================
function _salvar($conn, $body) {
    $id              = intval($body['id'] ?? 0);
    $nome            = trim($body['nome'] ?? '');
    $modelo          = trim($body['modelo'] ?? '');
    $tipo            = trim($body['tipo'] ?? 'uhf');
    $ip_address      = trim($body['ip_address'] ?? '');
    $porta           = intval($body['porta'] ?? 80);
    $usuario_api     = trim($body['usuario_api'] ?? 'admin');
    $senha_api       = trim($body['senha_api'] ?? '');
    $area_instalacao = trim($body['area_instalacao'] ?? '');
    $descricao       = trim($body['descricao'] ?? '');
    $ativo           = isset($body['ativo']) ? intval($body['ativo']) : 1;

    if (!$nome || !$ip_address) {
        retornar_json(false, 'Nome e IP são obrigatórios.');
    }

    if (!in_array($tipo, ['uhf','rfid','facial','biometria','qrcode','outro'])) {
        $tipo = 'uhf';
    }

    if ($id) {
        // Atualizar — só atualiza senha se foi informada
        if ($senha_api) {
            $stmt = $conn->prepare(
                "UPDATE dispositivos_controlid SET nome=?, modelo=?, tipo=?, ip_address=?, porta=?,
                 usuario_api=?, senha_api=?, area_instalacao=?, descricao=?, ativo=?
                 WHERE id=?"
            );
            $stmt->bind_param('sssssisssii', $nome, $modelo, $tipo, $ip_address, $porta,
                $usuario_api, $senha_api, $area_instalacao, $descricao, $ativo, $id);
        } else {
            $stmt = $conn->prepare(
                "UPDATE dispositivos_controlid SET nome=?, modelo=?, tipo=?, ip_address=?, porta=?,
                 usuario_api=?, area_instalacao=?, descricao=?, ativo=?
                 WHERE id=?"
            );
            $stmt->bind_param('ssssisssii', $nome, $modelo, $tipo, $ip_address, $porta,
                $usuario_api, $area_instalacao, $descricao, $ativo, $id);
        }
        $stmt->execute();
        if ($stmt->error) retornar_json(false, 'Erro ao atualizar: ' . $stmt->error);
        retornar_json(true, 'Dispositivo atualizado com sucesso.', ['id' => $id]);
    } else {
        // Criar
        if (!$senha_api) retornar_json(false, 'Senha da API é obrigatória para novo dispositivo.');

        $stmt = $conn->prepare(
            "INSERT INTO dispositivos_controlid (nome, modelo, tipo, ip_address, porta, usuario_api,
             senha_api, area_instalacao, descricao, ativo)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        );
        $stmt->bind_param('ssssissssi', $nome, $modelo, $tipo, $ip_address, $porta,
            $usuario_api, $senha_api, $area_instalacao, $descricao, $ativo);
        $stmt->execute();
        if ($stmt->error) retornar_json(false, 'Erro ao criar: ' . $stmt->error);
        retornar_json(true, 'Dispositivo cadastrado com sucesso.', ['id' => $conn->insert_id]);
    }
}

// ============================================================
// EXCLUIR
// ============================================================
function _excluir($conn, $body) {
    $id = intval($body['id'] ?? 0);
    if (!$id) retornar_json(false, 'ID não informado.');

    $stmt = $conn->prepare("DELETE FROM dispositivos_controlid WHERE id = ?");
    $stmt->bind_param('i', $id);
    $stmt->execute();
    if ($stmt->error) retornar_json(false, 'Erro ao excluir: ' . $stmt->error);
    retornar_json(true, 'Dispositivo removido com sucesso.');
}

// ============================================================
// TESTAR CONEXÃO com o equipamento Control ID
// ============================================================
function _testarConexao($conn, $body) {
    $id = intval($body['id'] ?? 0);
    if (!$id) retornar_json(false, 'ID não informado.');

    $disp = _buscarDispositivo($conn, $id);
    if (!$disp) retornar_json(false, 'Dispositivo não encontrado.');

    $resultado = _controlid_login($disp['ip_address'], $disp['porta'], $disp['usuario_api'], $disp['senha_api']);

    if ($resultado['sucesso']) {
        // Atualizar status online e salvar token
        $stmt = $conn->prepare(
            "UPDATE dispositivos_controlid SET status_online=1, ultimo_ping=NOW(),
             session_token=?, session_expiry=DATE_ADD(NOW(), INTERVAL 30 MINUTE)
             WHERE id=?"
        );
        $stmt->bind_param('si', $resultado['session'], $id);
        $stmt->execute();

        _registrarSyncLog($conn, $id, 'testar_conexao', 'sucesso', 'Conexão bem-sucedida. Session: ' . substr($resultado['session'], 0, 8) . '...');
        retornar_json(true, 'Conexão estabelecida com sucesso!', [
            'ip'      => $disp['ip_address'],
            'porta'   => $disp['porta'],
            'session' => substr($resultado['session'], 0, 8) . '...'
        ]);
    } else {
        // Marcar offline
        $conn->query("UPDATE dispositivos_controlid SET status_online=0 WHERE id=$id");
        _registrarSyncLog($conn, $id, 'testar_conexao', 'erro', $resultado['erro']);
        retornar_json(false, 'Falha na conexão: ' . $resultado['erro']);
    }
}

// ============================================================
// SINCRONIZAR TAGs dos veículos com o Control ID
// ============================================================
function _sincronizarTags($conn, $body) {
    $id          = intval($body['id'] ?? 0);
    $apenas_novos = isset($body['apenas_novos']) ? (bool)$body['apenas_novos'] : true;

    if (!$id) retornar_json(false, 'ID não informado.');

    $disp = _buscarDispositivo($conn, $id);
    if (!$disp) retornar_json(false, 'Dispositivo não encontrado.');

    // Fazer login no equipamento
    $login = _controlid_login($disp['ip_address'], $disp['porta'], $disp['usuario_api'], $disp['senha_api']);
    if (!$login['sucesso']) {
        retornar_json(false, 'Falha ao conectar ao dispositivo: ' . $login['erro']);
    }

    $session  = $login['session'];
    $base_url = "http://{$disp['ip_address']}:{$disp['porta']}";

    // Buscar veículos para sincronizar
    $where = $apenas_novos ? "WHERE v.ativo = 1 AND (v.controlid_sincronizado = 0 OR v.controlid_sincronizado IS NULL)" : "WHERE v.ativo = 1";
    $sql = "SELECT v.id, v.placa, v.modelo, v.cor, v.tag, v.morador_id,
                   v.controlid_user_id, v.controlid_tag_id, v.controlid_sincronizado,
                   m.nome AS morador_nome
            FROM veiculos v
            LEFT JOIN moradores m ON m.id = v.morador_id
            $where
            ORDER BY v.id ASC";
    $res = $conn->query($sql);
    if (!$res) retornar_json(false, 'Erro ao buscar veículos: ' . $conn->error);

    $veiculos     = $res->fetch_all(MYSQLI_ASSOC);
    $total        = count($veiculos);
    $enviados     = 0;
    $erros        = 0;
    $detalhes     = [];

    foreach ($veiculos as $v) {
        if (empty($v['tag'])) {
            $detalhes[] = ['veiculo_id' => $v['id'], 'placa' => $v['placa'], 'status' => 'ignorado', 'motivo' => 'TAG vazia'];
            continue;
        }

        // Matricula única para o usuário no Control ID
        $registration = 'ERP_V' . $v['id'];
        $nome_usuario = ($v['morador_nome'] ?? 'Morador') . ' - ' . $v['placa'];

        // 1) Criar ou atualizar usuário no Control ID
        $user_id = $v['controlid_user_id'];
        if (!$user_id) {
            // Criar usuário
            $user_payload = [
                'object' => 'users',
                'values' => [[
                    'id'           => 0,
                    'registration' => $registration,
                    'name'         => $nome_usuario
                ]]
            ];
            $resp_user = _controlid_post($base_url . '/create_objects.fcgi?session=' . $user_id, $user_payload, $session);
            if (!empty($resp_user['ids'][0])) {
                $user_id = $resp_user['ids'][0];
            } else {
                // Tentar buscar usuário existente pela matrícula
                $load_payload = ['object' => 'users', 'where' => ['registration' => ['like' => $registration]]];
                $resp_load = _controlid_post($base_url . '/load_objects.fcgi?session=' . $session, $load_payload, $session);
                $user_id = $resp_load['users'][0]['id'] ?? null;
            }
        }

        if (!$user_id) {
            $erros++;
            $detalhes[] = ['veiculo_id' => $v['id'], 'placa' => $v['placa'], 'status' => 'erro', 'motivo' => 'Falha ao criar usuário no Control ID'];
            continue;
        }

        // 2) Criar TAG UHF no Control ID (objeto uhf_tags — modo extended)
        // Tentar primeiro como uhf_tags (modo extended), depois como cards (modo standard)
        $tag_id = $v['controlid_tag_id'];
        if (!$tag_id) {
            // Modo extended (IDUHF padrão)
            $tag_payload = [
                'object' => 'uhf_tags',
                'values' => [[
                    'id'      => 0,
                    'value'   => strtoupper($v['tag']),
                    'user_id' => $user_id
                ]]
            ];
            $resp_tag = _controlid_post($base_url . '/create_objects.fcgi?session=' . $session, $tag_payload, $session);
            $tag_id = $resp_tag['ids'][0] ?? null;

            // Se falhar, tentar como cards (modo standard — valor numérico)
            if (!$tag_id && is_numeric($v['tag'])) {
                $card_payload = [
                    'object' => 'cards',
                    'values' => [[
                        'id'      => 0,
                        'value'   => intval($v['tag']),
                        'user_id' => $user_id
                    ]]
                ];
                $resp_card = _controlid_post($base_url . '/create_objects.fcgi?session=' . $session, $card_payload, $session);
                $tag_id = $resp_card['ids'][0] ?? null;
            }
        }

        // 3) Vincular usuário ao grupo de acesso padrão (grupo ID 1 — acesso liberado)
        _controlid_post($base_url . '/create_objects.fcgi?session=' . $session, [
            'object' => 'user_groups',
            'values' => [['user_id' => $user_id, 'group_id' => 1]]
        ], $session);

        // 4) Atualizar ERP com os IDs do Control ID
        $sincronizado = $tag_id ? 1 : 0;
        $stmt = $conn->prepare(
            "UPDATE veiculos SET controlid_user_id=?, controlid_tag_id=?,
             controlid_sincronizado=?, controlid_sync_data=NOW() WHERE id=?"
        );
        $stmt->bind_param('iiii', $user_id, $tag_id, $sincronizado, $v['id']);
        $stmt->execute();

        if ($sincronizado) {
            $enviados++;
            $detalhes[] = ['veiculo_id' => $v['id'], 'placa' => $v['placa'], 'tag' => $v['tag'],
                           'status' => 'sucesso', 'controlid_user_id' => $user_id, 'controlid_tag_id' => $tag_id];
        } else {
            $erros++;
            $detalhes[] = ['veiculo_id' => $v['id'], 'placa' => $v['placa'], 'tag' => $v['tag'],
                           'status' => 'parcial', 'motivo' => 'Usuário criado mas TAG não sincronizada', 'controlid_user_id' => $user_id];
        }
    }

    // Fazer logout
    _controlid_post($base_url . '/logout.fcgi?session=' . $session, [], $session);

    // Atualizar status online
    $conn->query("UPDATE dispositivos_controlid SET status_online=1, ultimo_ping=NOW() WHERE id=$id");

    $status_sync = $erros === 0 ? 'sucesso' : ($enviados > 0 ? 'parcial' : 'erro');
    _registrarSyncLog($conn, $id, 'sincronizar_tags', $status_sync,
        json_encode(['total' => $total, 'enviados' => $enviados, 'erros' => $erros, 'detalhes' => $detalhes]),
        $enviados, $erros);

    retornar_json(true, "Sincronização concluída: $enviados enviados, $erros erros de $total veículos.", [
        'total'    => $total,
        'enviados' => $enviados,
        'erros'    => $erros,
        'detalhes' => $detalhes
    ]);
}

// ============================================================
// COLETAR LOGS de acesso do equipamento
// ============================================================
function _coletarLogs($conn, $body) {
    $id = intval($body['id'] ?? 0);
    if (!$id) retornar_json(false, 'ID não informado.');

    $disp = _buscarDispositivo($conn, $id);
    if (!$disp) retornar_json(false, 'Dispositivo não encontrado.');

    $login = _controlid_login($disp['ip_address'], $disp['porta'], $disp['usuario_api'], $disp['senha_api']);
    if (!$login['sucesso']) {
        retornar_json(false, 'Falha ao conectar: ' . $login['erro']);
    }

    $session  = $login['session'];
    $base_url = "http://{$disp['ip_address']}:{$disp['porta']}";

    // Buscar último log importado para pegar apenas os novos
    $ultimo = $conn->query("SELECT MAX(controlid_log_id) AS ultimo FROM dispositivos_controlid_leituras WHERE dispositivo_id = $id")->fetch_assoc();
    $ultimo_id = intval($ultimo['ultimo'] ?? 0);

    $payload = ['object' => 'access_logs'];
    if ($ultimo_id > 0) {
        $payload['where'] = ['id' => ['gt' => $ultimo_id]];
    }
    $payload['order_by'] = ['id' => 'asc'];
    $payload['limit']    = 500;

    $resp = _controlid_post($base_url . '/load_objects.fcgi?session=' . $session, $payload, $session);
    $logs = $resp['access_logs'] ?? [];

    $importados = 0;
    foreach ($logs as $log) {
        $log_id     = intval($log['id'] ?? 0);
        $ts         = intval($log['time'] ?? 0);
        $data_hora  = $ts > 0 ? date('Y-m-d H:i:s', $ts) : date('Y-m-d H:i:s');
        $evento     = intval($log['event'] ?? 0);
        $tag_value  = $log['uhf_tag'] ?? null;
        $card_value = isset($log['card_value']) ? intval($log['card_value']) : null;
        $cid_user   = isset($log['user_id']) ? intval($log['user_id']) : null;
        $liberado   = ($evento === 6) ? 1 : 0; // 6 = Acesso concedido

        // Identificar veículo pelo tag ou card_value
        $veiculo_id  = null;
        $morador_id  = null;

        if ($tag_value) {
            $r = $conn->query("SELECT id, morador_id FROM veiculos WHERE UPPER(tag) = UPPER('" . $conn->real_escape_string($tag_value) . "') LIMIT 1");
            if ($r && $row = $r->fetch_assoc()) {
                $veiculo_id = $row['id'];
                $morador_id = $row['morador_id'];
            }
        }

        // Inserir leitura
        $stmt = $conn->prepare(
            "INSERT IGNORE INTO dispositivos_controlid_leituras
             (dispositivo_id, controlid_log_id, data_hora, tipo_evento, tag_value, card_value,
              controlid_user_id, veiculo_id, morador_id, acesso_liberado)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        );
        $stmt->bind_param('iisiisiiii', $id, $log_id, $data_hora, $evento,
            $tag_value, $card_value, $cid_user, $veiculo_id, $morador_id, $liberado);
        $stmt->execute();
        if (!$stmt->error) $importados++;

        // Se acesso liberado e veículo identificado, registrar em registros_acesso
        if ($liberado && $veiculo_id) {
            _registrarAcessoERP($conn, $veiculo_id, $morador_id, $data_hora, $tag_value, $id);
        }
    }

    _controlid_post($base_url . '/logout.fcgi?session=' . $session, [], $session);
    $conn->query("UPDATE dispositivos_controlid SET status_online=1, ultimo_ping=NOW() WHERE id=$id");

    _registrarSyncLog($conn, $id, 'coletar_logs', 'sucesso',
        json_encode(['total_logs' => count($logs), 'importados' => $importados]),
        $importados, 0);

    retornar_json(true, "Logs coletados: $importados novos registros importados.", [
        'total_logs' => count($logs),
        'importados' => $importados
    ]);
}

// ============================================================
// LOG DE SINCRONIZAÇÕES
// ============================================================
function _syncLog($conn) {
    $disp_id = intval($_GET['dispositivo_id'] ?? 0);
    $limit   = intval($_GET['limit'] ?? 50);

    $where = $disp_id ? "WHERE l.dispositivo_id = $disp_id" : '';
    $sql = "SELECT l.*, d.nome AS dispositivo_nome
            FROM dispositivos_controlid_sync_log l
            LEFT JOIN dispositivos_controlid d ON d.id = l.dispositivo_id
            $where
            ORDER BY l.data_hora DESC
            LIMIT $limit";
    $res = $conn->query($sql);
    $logs = [];
    while ($row = $res->fetch_assoc()) $logs[] = $row;
    retornar_json(true, 'OK', ['logs' => $logs]);
}

// ============================================================
// LEITURAS COLETADAS
// ============================================================
function _leituras($conn) {
    $disp_id = intval($_GET['dispositivo_id'] ?? 0);
    $limit   = intval($_GET['limit'] ?? 100);

    $where = $disp_id ? "WHERE lr.dispositivo_id = $disp_id" : '';
    $sql = "SELECT lr.*, d.nome AS dispositivo_nome,
                   v.placa, v.modelo, v.cor,
                   m.nome AS morador_nome, m.unidade
            FROM dispositivos_controlid_leituras lr
            LEFT JOIN dispositivos_controlid d ON d.id = lr.dispositivo_id
            LEFT JOIN veiculos v ON v.id = lr.veiculo_id
            LEFT JOIN moradores m ON m.id = lr.morador_id
            $where
            ORDER BY lr.data_hora DESC
            LIMIT $limit";
    $res = $conn->query($sql);
    $leituras = [];
    while ($row = $res->fetch_assoc()) $leituras[] = $row;
    retornar_json(true, 'OK', ['leituras' => $leituras]);
}

// ============================================================
// HELPERS — Control ID API
// ============================================================

/**
 * Realiza login na API do equipamento Control ID.
 * Retorna ['sucesso' => bool, 'session' => string, 'erro' => string]
 */
function _controlid_login($ip, $porta, $usuario, $senha) {
    $url     = "http://{$ip}:{$porta}/login.fcgi";
    $payload = json_encode(['login' => $usuario, 'password' => $senha]);

    $resp = _http_post($url, $payload);
    if (!$resp['ok']) {
        return ['sucesso' => false, 'session' => null, 'erro' => 'Sem resposta do equipamento: ' . $resp['erro']];
    }

    $data = json_decode($resp['body'], true);
    if (empty($data['session'])) {
        return ['sucesso' => false, 'session' => null, 'erro' => 'Login recusado pelo equipamento (credenciais inválidas?)'];
    }

    return ['sucesso' => true, 'session' => $data['session'], 'erro' => null];
}

/**
 * Envia requisição POST para a API do Control ID com sessão ativa.
 */
function _controlid_post($url, $payload, $session) {
    $json = json_encode($payload);
    $resp = _http_post($url, $json, ['Cookie: session=' . $session]);
    if (!$resp['ok']) return [];
    return json_decode($resp['body'], true) ?? [];
}

/**
 * HTTP POST via cURL.
 */
function _http_post($url, $body, $extra_headers = []) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $body,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 10,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_HTTPHEADER     => array_merge(['Content-Type: application/json'], $extra_headers),
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false,
    ]);
    $response = curl_exec($ch);
    $err      = curl_error($ch);
    $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($err || $response === false) {
        return ['ok' => false, 'body' => null, 'erro' => $err ?: 'cURL falhou'];
    }
    return ['ok' => true, 'body' => $response, 'http_code' => $http_code, 'erro' => null];
}

// ============================================================
// HELPERS — Banco de dados
// ============================================================

function _buscarDispositivo($conn, $id) {
    $stmt = $conn->prepare("SELECT * FROM dispositivos_controlid WHERE id = ?");
    $stmt->bind_param('i', $id);
    $stmt->execute();
    return $stmt->get_result()->fetch_assoc();
}

function _registrarSyncLog($conn, $disp_id, $acao, $status, $detalhes = '', $enviados = 0, $erros = 0) {
    $stmt = $conn->prepare(
        "INSERT INTO dispositivos_controlid_sync_log
         (dispositivo_id, acao, status, detalhes, total_enviados, total_erros)
         VALUES (?, ?, ?, ?, ?, ?)"
    );
    $stmt->bind_param('isssii', $disp_id, $acao, $status, $detalhes, $enviados, $erros);
    $stmt->execute();
}

function _registrarAcessoERP($conn, $veiculo_id, $morador_id, $data_hora, $tag, $disp_id) {
    // Buscar dados do veículo
    $r = $conn->query("SELECT v.placa, v.modelo, v.cor, m.nome AS morador_nome, m.unidade
                       FROM veiculos v LEFT JOIN moradores m ON m.id = v.morador_id
                       WHERE v.id = $veiculo_id LIMIT 1");
    if (!$r || !($row = $r->fetch_assoc())) return;

    $status = '✅ Acesso liberado via Control ID - ' . ($row['morador_nome'] ?? 'Morador');
    $obs    = "Leitura automática via dispositivo #$disp_id | TAG: $tag";

    $stmt = $conn->prepare(
        "INSERT INTO registros_acesso (data_hora, placa, modelo, cor, tag, tipo, morador_id, status, liberado, observacao)
         VALUES (?, ?, ?, ?, ?, 'Morador', ?, ?, 1, ?)"
    );
    $stmt->bind_param('sssssiss', $data_hora, $row['placa'], $row['modelo'], $row['cor'],
        $tag, $morador_id, $status, $obs);
    $stmt->execute();
}
