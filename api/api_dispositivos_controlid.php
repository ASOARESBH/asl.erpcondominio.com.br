<?php
/**
 * api_dispositivos_controlid.php — API de Dispositivos Control ID v2.0
 *
 * Gerencia leitores Control ID (IDUHF, iDAccess, etc.) e realiza
 * integração direta com a API REST dos equipamentos.
 *
 * Endpoints originais (PULL mode):
 *   GET    ?acao=listar           — Lista todos os dispositivos
 *   GET    ?acao=obter&id=N       — Obtém um dispositivo
 *   POST   {acao:salvar}          — Cria ou atualiza dispositivo
 *   POST   {acao:excluir, id:N}   — Remove dispositivo
 *   POST   {acao:testar_conexao, id:N}         — Testa conexão com o equipamento
 *   POST   {acao:sincronizar_tags, id:N}       — Sincroniza TAGs dos veículos
 *   POST   {acao:coletar_logs, id:N}           — Coleta access_logs do equipamento
 *   GET    ?acao=sync_log&dispositivo_id=N     — Log de sincronizações
 *   GET    ?acao=leituras&dispositivo_id=N     — Leituras coletadas
 *
 * Novos endpoints (Push / Online Mode):
 *   POST   {acao:configurar_push, id:N, push_url:..., periodo:10}  — Configura push mode no equipamento
 *   POST   {acao:configurar_online, id:N, server_url:..., modo:pro} — Configura online mode no equipamento
 *   POST   {acao:enviar_comando, id:N, endpoint:..., body:{...}}   — Enfileira comando push
 *   GET    ?acao=status_push&id=N              — Status push + eventos recentes
 *   GET    ?acao=eventos&dispositivo_id=N      — Eventos push/online recebidos
 *   GET    ?acao=fila_push&dispositivo_id=N    — Fila de comandos push
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
    case 'listar':            _listar($conn);                    break;
    case 'obter':             _obter($conn);                     break;
    case 'salvar':            _salvar($conn, $body);             break;
    case 'excluir':           _excluir($conn, $body);            break;
    case 'testar_conexao':    _testarConexao($conn, $body);      break;
    case 'sincronizar_tags':  _sincronizarTags($conn, $body);    break;
    case 'coletar_logs':      _coletarLogs($conn, $body);        break;
    case 'sync_log':          _syncLog($conn);                   break;
    case 'leituras':          _leituras($conn);                  break;
    // Push / Online Mode
    case 'configurar_push':   _configurarPush($conn, $body);     break;
    case 'configurar_online': _configurarOnline($conn, $body);   break;
    case 'enviar_comando':    _enviarComando($conn, $body);       break;
    case 'status_push':       _statusPush($conn);                break;
    case 'eventos':           _eventos($conn);                   break;
    case 'fila_push':         _filaPush($conn);                  break;
    // Bridge / API Key
    case 'gerar_api_key':     _gerarApiKey($conn);               break;
    case 'revogar_api_key':   _revogarApiKey($conn);             break;
    case 'obter_api_key':     _obterApiKey($conn);               break;
    case 'status_bridge':     _statusBridge($conn);              break;
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
// CONFIGURAR PUSH MODE no equipamento
// ============================================================
function _configurarPush($conn, $body) {
    $id         = intval($body['id']       ?? 0);
    $push_url   = trim($body['push_url']   ?? '');
    $periodo    = intval($body['periodo']  ?? 10);
    $timeout_ms = intval($body['timeout']  ?? 30000);

    if (!$id) retornar_json(false, 'ID não informado.');
    if (!$push_url) {
        // URL padrão do próprio servidor
        $host = $_SERVER['HTTP_HOST'] ?? 'asl.erpcondominio.com.br';
        $push_url = 'https://' . $host . '/api/controlid';
    }

    $disp = _buscarDispositivo($conn, $id);
    if (!$disp) retornar_json(false, 'Dispositivo não encontrado.');

    $login = _controlid_login($disp['ip_address'], $disp['porta'], $disp['usuario_api'], $disp['senha_api']);
    if (!$login['sucesso']) retornar_json(false, 'Falha ao conectar ao dispositivo: ' . $login['erro']);

    $session  = $login['session'];
    $base_url = "http://{$disp['ip_address']}:{$disp['porta']}";

    $config_payload = [
        'push_server' => [
            'push_remote_address'  => $push_url,
            'push_request_timeout' => (string)$timeout_ms,
            'push_request_period'  => (string)$periodo
        ]
    ];

    $resp = _controlid_post(
        $base_url . '/set_configuration.fcgi?session=' . $session,
        $config_payload, $session
    );

    _controlid_post($base_url . '/logout.fcgi?session=' . $session, [], $session);

    // Atualizar banco com modo e URL push
    $stmt = $conn->prepare(
        "UPDATE dispositivos_controlid
         SET modo_operacao='push', push_ativo=1, push_server_url=?, status_online=1, ultimo_ping=NOW()
         WHERE id=?"
    );
    $stmt->bind_param('si', $push_url, $id);
    $stmt->execute();

    _registrarSyncLog($conn, $id, 'configurar_push', 'sucesso',
        json_encode(['push_url' => $push_url, 'periodo' => $periodo, 'resposta' => $resp]));

    retornar_json(true, 'Push mode configurado com sucesso!', [
        'push_url' => $push_url,
        'periodo'  => $periodo,
        'resposta_equipamento' => $resp
    ]);
}

// ============================================================
// CONFIGURAR ONLINE MODE no equipamento
// ============================================================
function _configurarOnline($conn, $body) {
    $id         = intval($body['id']         ?? 0);
    $server_url = trim($body['server_url']   ?? '');
    $modo       = trim($body['modo']         ?? 'pro'); // pro | enterprise
    $acao_acesso = trim($body['acao_acesso']  ?? 'door');
    $acao_params = trim($body['acao_params']  ?? 'door=1');

    if (!$id) retornar_json(false, 'ID não informado.');

    $disp = _buscarDispositivo($conn, $id);
    if (!$disp) retornar_json(false, 'Dispositivo não encontrado.');

    if (!$server_url) {
        $host = $_SERVER['HTTP_HOST'] ?? 'asl.erpcondominio.com.br';
        $server_url = $host;
    }

    // Extrair host e porta da URL
    $parsed   = parse_url('http://' . ltrim($server_url, 'http://https://'));
    $srv_host = $parsed['host'] ?? $server_url;
    $srv_port = $parsed['port'] ?? 80;

    $login = _controlid_login($disp['ip_address'], $disp['porta'], $disp['usuario_api'], $disp['senha_api']);
    if (!$login['sucesso']) retornar_json(false, 'Falha ao conectar ao dispositivo: ' . $login['erro']);

    $session  = $login['session'];
    $base_url = "http://{$disp['ip_address']}:{$disp['porta']}";

    // Configurar modo online (connection_type: 1=standalone, 2=online_pro, 3=enterprise)
    $conn_type = ($modo === 'enterprise') ? 3 : 2;
    $config_payload = [
        'network_device' => [
            'server_address'  => $srv_host,
            'server_port'     => $srv_port,
            'connection_type' => $conn_type
        ]
    ];

    $resp = _controlid_post(
        $base_url . '/set_configuration.fcgi?session=' . $session,
        $config_payload, $session
    );

    _controlid_post($base_url . '/logout.fcgi?session=' . $session, [], $session);

    $modo_operacao = $modo === 'enterprise' ? 'online_enterprise' : 'online_pro';

    $stmt = $conn->prepare(
        "UPDATE dispositivos_controlid
         SET modo_operacao=?, online_server_url=?, acao_acesso=?, acao_acesso_params=?,
             status_online=1, ultimo_ping=NOW()
         WHERE id=?"
    );
    $stmt->bind_param('ssssi', $modo_operacao, $server_url, $acao_acesso, $acao_params, $id);
    $stmt->execute();

    _registrarSyncLog($conn, $id, 'configurar_online', 'sucesso',
        json_encode(['modo' => $modo, 'server' => $srv_host . ':' . $srv_port, 'resposta' => $resp]));

    retornar_json(true, "Online mode ($modo) configurado com sucesso!", [
        'modo'    => $modo,
        'servidor' => $srv_host . ':' . $srv_port,
        'resposta_equipamento' => $resp
    ]);
}

// ============================================================
// ENFILEIRAR COMANDO PUSH para o equipamento
// ============================================================
function _enviarComando($conn, $body) {
    $id       = intval($body['id']       ?? 0);
    $endpoint = trim($body['endpoint']   ?? 'load_objects');
    $verb     = strtoupper(trim($body['verb'] ?? 'POST'));
    $cmd_body = $body['body']            ?? [];

    if (!$id) retornar_json(false, 'ID não informado.');
    if (!in_array($verb, ['GET', 'POST'])) $verb = 'POST';

    $disp = _buscarDispositivo($conn, $id);
    if (!$disp) retornar_json(false, 'Dispositivo não encontrado.');

    $body_json = json_encode($cmd_body);
    $stmt = $conn->prepare(
        "INSERT INTO controlid_push_queue (dispositivo_id, device_id, endpoint, verb, body)
         VALUES (?, ?, ?, ?, ?)"
    );
    $stmt->bind_param('iisss', $id, $disp['push_device_id'], $endpoint, $verb, $body_json);
    $stmt->execute();

    if ($stmt->error) retornar_json(false, 'Erro ao enfileirar comando: ' . $stmt->error);

    _registrarSyncLog($conn, $id, 'enviar_comando', 'sucesso',
        json_encode(['endpoint' => $endpoint, 'queue_id' => $conn->insert_id]));

    retornar_json(true, 'Comando enfileirado. Será enviado no próximo ciclo de polling.', [
        'queue_id' => $conn->insert_id,
        'endpoint' => $endpoint,
        'aguarda_push_periodo' => 'O equipamento buscará em até ' . ($disp['push_request_period'] ?? '10') . 's'
    ]);
}

// ============================================================
// STATUS PUSH — situação do push mode e eventos recentes
// ============================================================
function _statusPush($conn) {
    $id = intval($_GET['id'] ?? 0);
    if (!$id) retornar_json(false, 'ID não informado.');

    $disp = _buscarDispositivo($conn, $id);
    if (!$disp) retornar_json(false, 'Dispositivo não encontrado.');

    // Fila pendente
    $fila_pend = $conn->query(
        "SELECT COUNT(*) AS total FROM controlid_push_queue WHERE dispositivo_id=$id AND status='pendente'"
    )->fetch_assoc()['total'];

    // Total de eventos
    $total_ev = $conn->query(
        "SELECT COUNT(*) AS total FROM controlid_push_eventos WHERE dispositivo_id=$id"
    )->fetch_assoc()['total'];

    // Últimos 5 eventos
    $res = $conn->query(
        "SELECT tipo_evento, acesso_liberado, tag_value, card_value, qrcode_value,
                veiculo_id, data_evento, data_recebimento
         FROM controlid_push_eventos WHERE dispositivo_id=$id
         ORDER BY id DESC LIMIT 5"
    );
    $ultimos = [];
    while ($row = $res->fetch_assoc()) $ultimos[] = $row;

    retornar_json(true, 'OK', [
        'modo_operacao'     => $disp['modo_operacao'],
        'push_ativo'        => (bool)$disp['push_ativo'],
        'push_device_id'    => $disp['push_device_id'],
        'push_ultimo_contato' => $disp['push_ultimo_contato'],
        'push_server_url'   => $disp['push_server_url'],
        'online_server_url' => $disp['online_server_url'],
        'status_online'     => (bool)$disp['status_online'],
        'fila_pendente'     => intval($fila_pend),
        'total_eventos'     => intval($total_ev),
        'ultimos_eventos'   => $ultimos
    ]);
}

// ============================================================
// EVENTOS PUSH/ONLINE recebidos
// ============================================================
function _eventos($conn) {
    $disp_id = intval($_GET['dispositivo_id'] ?? 0);
    $tipo    = trim($_GET['tipo']    ?? '');
    $limit   = min(200, intval($_GET['limit'] ?? 100));

    $where = [];
    if ($disp_id) $where[] = "e.dispositivo_id = $disp_id";
    if ($tipo)    $where[] = "e.tipo_evento = '" . $conn->real_escape_string($tipo) . "'";
    $sql_where = $where ? 'WHERE ' . implode(' AND ', $where) : '';

    $sql = "SELECT e.*, d.nome AS dispositivo_nome,
                   v.placa, v.modelo AS veiculo_modelo, v.cor,
                   m.nome AS morador_nome, m.unidade
            FROM controlid_push_eventos e
            LEFT JOIN dispositivos_controlid d ON d.id = e.dispositivo_id
            LEFT JOIN veiculos v ON v.id = e.veiculo_id
            LEFT JOIN moradores m ON m.id = e.morador_id
            $sql_where
            ORDER BY e.id DESC
            LIMIT $limit";

    $res = $conn->query($sql);
    if (!$res) retornar_json(false, 'Erro: ' . $conn->error);

    $eventos = [];
    while ($row = $res->fetch_assoc()) {
        unset($row['payload'], $row['resposta_enviada']); // omitir raw
        $eventos[] = $row;
    }
    retornar_json(true, 'OK', ['eventos' => $eventos]);
}

// ============================================================
// FILA DE COMANDOS PUSH
// ============================================================
function _filaPush($conn) {
    $disp_id = intval($_GET['dispositivo_id'] ?? 0);
    $status  = trim($_GET['status'] ?? '');
    $limit   = min(100, intval($_GET['limit'] ?? 50));

    $where = [];
    if ($disp_id) $where[] = "q.dispositivo_id = $disp_id";
    if ($status)  $where[] = "q.status = '" . $conn->real_escape_string($status) . "'";
    $sql_where = $where ? 'WHERE ' . implode(' AND ', $where) : '';

    $sql = "SELECT q.id, q.dispositivo_id, q.endpoint, q.verb, q.status,
                   q.tentativas, q.criado_em, q.enviado_em, q.executado_em,
                   d.nome AS dispositivo_nome
            FROM controlid_push_queue q
            LEFT JOIN dispositivos_controlid d ON d.id = q.dispositivo_id
            $sql_where
            ORDER BY q.id DESC
            LIMIT $limit";

    $res = $conn->query($sql);
    $fila = [];
    while ($row = $res->fetch_assoc()) $fila[] = $row;
    retornar_json(true, 'OK', ['fila' => $fila]);
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

// ============================================================
// BRIDGE — Gerar API Key
// ============================================================
function _gerarApiKey($conn) {
    // Gerar chave segura de 64 caracteres hex
    $chave = bin2hex(random_bytes(32));
    $hash  = hash('sha256', $chave); // armazenar hash no banco

    // Salvar na tabela configuracoes (cria se não existir)
    $conn->query("CREATE TABLE IF NOT EXISTS configuracoes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        chave VARCHAR(100) NOT NULL UNIQUE,
        valor TEXT,
        descricao VARCHAR(255),
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Upsert da chave
    $stmt = $conn->prepare(
        "INSERT INTO configuracoes (chave, valor, descricao)
         VALUES ('bridge_api_key', ?, 'Chave de autenticação do Bridge Control ID')
         ON DUPLICATE KEY UPDATE valor = VALUES(valor), atualizado_em = NOW()"
    );
    $stmt->bind_param('s', $chave);
    $stmt->execute();
    if ($stmt->error) retornar_json(false, 'Erro ao salvar chave: ' . $stmt->error);

    // Registrar data de geração
    $stmt2 = $conn->prepare(
        "INSERT INTO configuracoes (chave, valor, descricao)
         VALUES ('bridge_api_key_gerada_em', NOW(), 'Data de geração da API Key do Bridge')
         ON DUPLICATE KEY UPDATE valor = NOW(), atualizado_em = NOW()"
    );
    $stmt2->execute();

    retornar_json(true, 'Nova chave gerada com sucesso.', [
        'api_key'    => $chave,
        'gerada_em'  => date('Y-m-d H:i:s')
    ]);
}

// ============================================================
// BRIDGE — Revogar API Key
// ============================================================
function _revogarApiKey($conn) {
    $stmt = $conn->prepare(
        "UPDATE configuracoes SET valor = '' WHERE chave = 'bridge_api_key'"
    );
    $stmt->execute();
    retornar_json(true, 'Chave revogada com sucesso. O Bridge será desconectado na próxima verificação.');
}

// ============================================================
// BRIDGE — Obter API Key atual (mascarada)
// ============================================================
function _obterApiKey($conn) {
    $res = $conn->query("SELECT valor FROM configuracoes WHERE chave = 'bridge_api_key' LIMIT 1");
    if (!$res || !($row = $res->fetch_assoc())) {
        retornar_json(true, 'Nenhuma chave configurada.', ['api_key' => '', 'tem_chave' => false]);
    }
    $chave = $row['valor'] ?? '';
    retornar_json(true, 'OK', [
        'api_key'   => $chave,
        'tem_chave' => !empty($chave)
    ]);
}

// ============================================================
// BRIDGE — Status do Bridge (heartbeat + dispositivos)
// ============================================================
function _statusBridge($conn) {
    // Verificar tabela bridge_status
    $conn->query("CREATE TABLE IF NOT EXISTS bridge_status (
        id INT AUTO_INCREMENT PRIMARY KEY,
        bridge_id VARCHAR(64),
        versao VARCHAR(20),
        ip_local VARCHAR(45),
        ultimo_contato TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        online TINYINT(1) DEFAULT 0,
        dispositivos_total INT DEFAULT 0,
        dispositivos_online INT DEFAULT 0,
        dados_json TEXT,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $res = $conn->query("SELECT * FROM bridge_status ORDER BY ultimo_contato DESC LIMIT 1");
    if (!$res || !($row = $res->fetch_assoc())) {
        retornar_json(true, 'Nenhum bridge conectado ainda.', [
            'online'              => false,
            'versao'              => null,
            'ultimo_contato'      => null,
            'dispositivos_total'  => 0,
            'dispositivos_online' => 0,
            'dispositivos_lista'  => []
        ]);
    }

    // Considerar offline se último contato > 2 minutos
    $ultimo = strtotime($row['ultimo_contato']);
    $online = (time() - $ultimo) < 120;

    $lista = [];
    if (!empty($row['dados_json'])) {
        $dados = json_decode($row['dados_json'], true);
        $lista = $dados['dispositivos'] ?? [];
    }

    retornar_json(true, 'OK', [
        'online'              => $online,
        'versao'              => $row['versao'],
        'ip_local'            => $row['ip_local'],
        'ultimo_contato'      => $row['ultimo_contato'],
        'dispositivos_total'  => intval($row['dispositivos_total']),
        'dispositivos_online' => intval($row['dispositivos_online']),
        'dispositivos_lista'  => $lista
    ]);
}
