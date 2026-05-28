<?php
/**
 * api_dispositivos.php — Gerenciamento de Dispositivos Multifabricante v3.0
 *
 * Fabricantes suportados: Control iD, Intelbras, Hikvision, Genérico
 *
 * Responsabilidades:
 *   CRUD de dispositivos   listar | obter | criar | atualizar | excluir
 *   Token                  gerar_token
 *   Eventos                listar_eventos
 *   Fila de comandos       listar_fila | enfileirar_comando | cancelar_comando
 *
 * Tabelas: controlid_dispositivos, controlid_eventos_acesso, controlid_fila_comandos
 */

declare(strict_types=1);

// ob_start evita que warnings PHP corrompam o JSON de resposta
ob_start();
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/auth_helper.php';
ob_end_clean();

header('Content-Type: application/json; charset=utf-8');

// verificarAutenticacao() encerra com 401 automaticamente se não logado
$usuario = verificarAutenticacao();

$conn = conectar_banco();
if (!($conn instanceof mysqli)) {
    http_response_code(503);
    echo json_encode(['sucesso' => false, 'erro' => 'Banco de dados indisponível']);
    exit;
}

// Migration automática: adiciona colunas de comunicação se não existirem
_migration_comunicacao($conn);

$raw  = (string) file_get_contents('php://input');
$body = json_decode($raw, true) ?? [];
$acao = trim((string) ($_GET['acao'] ?? $body['acao'] ?? ''));

try {
    switch ($acao) {
        case 'listar':             responder_listar($conn);                    break;
        case 'obter':              responder_obter($conn);                     break;
        case 'criar':              responder_criar($conn, $body);              break;
        case 'atualizar':          responder_atualizar($conn, $body);          break;
        case 'excluir':            responder_excluir($conn, $body);            break;
        case 'gerar_token':        responder_gerar_token($conn, $body);        break;
        case 'listar_eventos':     responder_listar_eventos($conn);            break;
        case 'listar_fila':        responder_listar_fila($conn);               break;
        case 'enfileirar_comando': responder_enfileirar_comando($conn, $body); break;
        case 'cancelar_comando':   responder_cancelar_comando($conn, $body);   break;
        default:
            fechar_conexao($conn);
            http_response_code(400);
            echo json_encode(['sucesso' => false, 'erro' => "Ação desconhecida: {$acao}"]);
            exit;
    }
} catch (Throwable $e) {
    fechar_conexao($conn);
    http_response_code(500);
    echo json_encode(['sucesso' => false, 'erro' => 'Erro interno: ' . $e->getMessage()]);
    exit;
}

// ════════════════════════════════════════════════════════════════════════════
// CRUD — Dispositivos
// ════════════════════════════════════════════════════════════════════════════

function responder_listar(mysqli $conn): void
{
    $busca = trim((string) ($_GET['busca'] ?? ''));
    $like  = '%' . $busca . '%';

    $sql = 'SELECT id, nome_dispositivo, serial_number, descricao,
                   fabricante, modelo, tipo_leitor, area_instalacao, sentido_acesso,
                   tipo_integracao, ip_local, porta_local, usuario_api,
                   device_id_controlid, bridge_api_key,
                   ultimo_keep_alive, ativo, criado_em
            FROM controlid_dispositivos
            WHERE ativo = 1';

    if ($busca !== '') {
        $sql .= ' AND (nome_dispositivo LIKE ? OR serial_number LIKE ?)';
    }
    $sql .= ' ORDER BY nome_dispositivo ASC';

    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        _erro($conn, 'Prepare listar: ' . $conn->error);
    }
    if ($busca !== '') {
        $stmt->bind_param('ss', $like, $like);
    }
    $stmt->execute();
    $res  = $stmt->get_result();
    $rows = [];
    while ($r = $res->fetch_assoc()) {
        $r['online'] = _esta_online($r['ultimo_keep_alive']);
        $rows[]      = $r;
    }
    $stmt->close();
    fechar_conexao($conn);
    _ok(['dispositivos' => $rows]);
}

function responder_obter(mysqli $conn): void
{
    $id = (int) ($_GET['id'] ?? 0);
    if ($id <= 0) {
        _erro($conn, 'id obrigatório', 400);
    }

    $stmt = $conn->prepare(
        'SELECT id, nome_dispositivo, serial_number, descricao,
                fabricante, modelo, tipo_leitor, area_instalacao, sentido_acesso,
                tipo_integracao, ip_local, porta_local, usuario_api,
                device_id_controlid, bridge_api_key,
                ultimo_keep_alive, token_autenticacao, ativo, criado_em
         FROM controlid_dispositivos
         WHERE id = ? LIMIT 1'
    );
    if (!$stmt) {
        _erro($conn, 'Prepare obter: ' . $conn->error);
    }
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $res = $stmt->get_result();
    $row = $res ? $res->fetch_assoc() : null;
    $stmt->close();

    if (!$row) {
        fechar_conexao($conn);
        http_response_code(404);
        echo json_encode(['sucesso' => false, 'erro' => 'Dispositivo não encontrado']);
        exit;
    }

    $row['online'] = _esta_online($row['ultimo_keep_alive']);
    fechar_conexao($conn);
    _ok(['dispositivo' => $row]);
}

function responder_criar(mysqli $conn, array $body): void
{
    $nome        = trim((string) ($body['nome_dispositivo']    ?? ''));
    $serial      = trim((string) ($body['serial_number']       ?? ''));
    $desc        = trim((string) ($body['descricao']           ?? ''));
    $fabricante  = trim((string) ($body['fabricante']          ?? 'controlid'));
    $modelo      = trim((string) ($body['modelo']              ?? ''));
    $tipo_leitor = trim((string) ($body['tipo_leitor']         ?? 'uhf'));
    $area        = trim((string) ($body['area_instalacao']     ?? ''));
    $sentido     = trim((string) ($body['sentido_acesso']      ?? 'ambos'));
    $tipo_int    = trim((string) ($body['tipo_integracao']     ?? 'bridge_local'));
    $ip          = trim((string) ($body['ip_local']            ?? ''));
    $porta       = max(1, min(65535, (int) ($body['porta_local'] ?? 80)));
    $usuario     = trim((string) ($body['usuario_api']         ?? 'admin'));
    $senha       = trim((string) ($body['senha_api']           ?? ''));
    $device_id   = (int) ($body['device_id_controlid']         ?? 0);
    $bridge_key  = trim((string) ($body['bridge_api_key']      ?? ''));

    if ($nome === '' || $serial === '') {
        _erro($conn, 'nome_dispositivo e serial_number são obrigatórios', 400);
    }

    // Gera bridge_api_key se não informada
    if ($bridge_key === '') {
        $bridge_key = 'bk_' . bin2hex(random_bytes(16));
    }

    $existente = _buscar_dispositivo_por_serial($conn, $serial);
    if ($existente && (int) ($existente['ativo'] ?? 0) === 1) {
        fechar_conexao($conn);
        http_response_code(409);
        echo json_encode([
            'sucesso' => false,
            'erro' => 'Este Serial Number / Device ID ja esta cadastrado. Use editar ou exclua o cadastro existente antes de criar outro.',
            'id' => (int) $existente['id'],
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    $token = '';

    if ($existente) {
        $stmt = $conn->prepare(
            'UPDATE controlid_dispositivos
             SET nome_dispositivo=?, descricao=?, token_autenticacao=?, ativo=1,
                 fabricante=?, modelo=?, tipo_leitor=?, area_instalacao=?, sentido_acesso=?,
                 tipo_integracao=?, ip_local=?, porta_local=?, usuario_api=?,
                 device_id_controlid=?, bridge_api_key=?
             WHERE id=?'
        );
        if (!$stmt) {
            _erro($conn, 'Prepare reativar: ' . $conn->error);
        }
        $id = (int) $existente['id'];
        $stmt->bind_param('ssssssssssiisii',
            $nome, $desc, $token, $fabricante, $modelo, $tipo_leitor, $area, $sentido,
            $tipo_int, $ip, $porta, $usuario, $device_id, $bridge_key, $id
        );
        if (!$stmt->execute()) {
            $err = $stmt->error;
            $stmt->close();
            _erro($conn, 'Erro ao reativar dispositivo: ' . $err);
        }
        $stmt->close();
        fechar_conexao($conn);
        _ok(['id' => $id, 'token_autenticacao' => $token, 'bridge_api_key' => $bridge_key, 'reativado' => true]);
    }

    $stmt = $conn->prepare(
        'INSERT INTO controlid_dispositivos
         (nome_dispositivo, serial_number, descricao, token_autenticacao,
          fabricante, modelo, tipo_leitor, area_instalacao, sentido_acesso,
          tipo_integracao, ip_local, porta_local, usuario_api,
          device_id_controlid, bridge_api_key)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    if (!$stmt) {
        _erro($conn, 'Prepare criar: ' . $conn->error);
    }
    $stmt->bind_param('ssssssssssisisi',
        $nome, $serial, $desc, $token, $fabricante, $modelo, $tipo_leitor, $area, $sentido,
        $tipo_int, $ip, $porta, $usuario, $device_id, $bridge_key
    );

    if (!$stmt->execute()) {
        $err = $stmt->error;
        $stmt->close();
        if (strpos($err, 'Duplicate') !== false) {
            fechar_conexao($conn);
            http_response_code(409);
            echo json_encode(['sucesso' => false, 'erro' => 'serial_number já cadastrado']);
            exit;
        }
        _erro($conn, 'Erro ao criar: ' . $err);
    }

    $id = $conn->insert_id;
    $stmt->close();
    fechar_conexao($conn);
    _ok(['id' => $id, 'token_autenticacao' => $token, 'bridge_api_key' => $bridge_key]);
}

function responder_atualizar(mysqli $conn, array $body): void
{
    $id          = (int) ($body['id']                  ?? 0);
    $nome        = trim((string) ($body['nome_dispositivo']    ?? ''));
    $desc        = trim((string) ($body['descricao']           ?? ''));
    $fabricante  = trim((string) ($body['fabricante']          ?? 'controlid'));
    $modelo      = trim((string) ($body['modelo']              ?? ''));
    $tipo_leitor = trim((string) ($body['tipo_leitor']         ?? 'uhf'));
    $area        = trim((string) ($body['area_instalacao']     ?? ''));
    $sentido     = trim((string) ($body['sentido_acesso']      ?? 'ambos'));
    $tipo_int    = trim((string) ($body['tipo_integracao']     ?? 'bridge_local'));
    $ip          = trim((string) ($body['ip_local']            ?? ''));
    $porta       = max(1, min(65535, (int) ($body['porta_local'] ?? 80)));
    $usuario     = trim((string) ($body['usuario_api']         ?? 'admin'));
    $senha       = trim((string) ($body['senha_api']           ?? ''));
    $device_id   = (int) ($body['device_id_controlid']         ?? 0);
    $bridge_key  = trim((string) ($body['bridge_api_key']      ?? ''));

    if ($id <= 0 || $nome === '') {
        _erro($conn, 'id e nome_dispositivo são obrigatórios', 400);
    }

    // Monta SET dinâmico para senha (só atualiza se informada)
    $set_senha = '';
    $params = [$nome, $desc, $fabricante, $modelo, $tipo_leitor, $area, $sentido,
               $tipo_int, $ip, $porta, $usuario, $device_id, $bridge_key];
    $types  = 'sssssssssiisi';

    if ($senha !== '') {
        $set_senha = ', senha_api = ?';
        $params[]  = $senha;
        $types    .= 's';
    }

    $params[] = $id;
    $types   .= 'i';

    $stmt = $conn->prepare(
        "UPDATE controlid_dispositivos
         SET nome_dispositivo=?, descricao=?, fabricante=?, modelo=?, tipo_leitor=?,
             area_instalacao=?, sentido_acesso=?, tipo_integracao=?,
             ip_local=?, porta_local=?, usuario_api=?,
             device_id_controlid=?, bridge_api_key=?
             {$set_senha}
         WHERE id=?"
    );
    if (!$stmt) {
        _erro($conn, 'Prepare atualizar: ' . $conn->error);
    }
    $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $stmt->close();
    fechar_conexao($conn);
    _ok(['mensagem' => 'Dispositivo atualizado']);
}

function responder_excluir(mysqli $conn, array $body): void
{
    $id = (int) ($body['id'] ?? 0);
    if ($id <= 0) {
        _erro($conn, 'id obrigatório', 400);
    }
    $stmt = $conn->prepare(
        'UPDATE controlid_dispositivos SET ativo = 0 WHERE id = ?'
    );
    if (!$stmt) {
        _erro($conn, 'Prepare excluir: ' . $conn->error);
    }
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $stmt->close();
    fechar_conexao($conn);
    _ok(['mensagem' => 'Dispositivo desativado']);
}

function responder_gerar_token(mysqli $conn, array $body): void
{
    $id = (int) ($body['id'] ?? 0);
    if ($id <= 0) {
        _erro($conn, 'id obrigatório', 400);
    }

    $token = _gerar_token();

    $stmt = $conn->prepare(
        'UPDATE controlid_dispositivos
         SET token_autenticacao = ?
         WHERE id = ?'
    );
    if (!$stmt) {
        _erro($conn, 'Prepare gerar_token: ' . $conn->error);
    }
    $stmt->bind_param('si', $token, $id);
    $stmt->execute();
    $stmt->close();
    fechar_conexao($conn);
    _ok(['token_autenticacao' => $token]);
}

// ════════════════════════════════════════════════════════════════════════════
// Eventos de Acesso
// ════════════════════════════════════════════════════════════════════════════

function responder_listar_eventos(mysqli $conn): void
{
    $serial    = trim((string) ($_GET['serial_number'] ?? ''));
    $tipo      = trim((string) ($_GET['tipo_evento']   ?? ''));
    $data_de   = trim((string) ($_GET['data_de']       ?? ''));
    $data_ate  = trim((string) ($_GET['data_ate']      ?? ''));
    $pagina    = max(1, (int) ($_GET['pagina']         ?? 1));
    $pp        = 50;
    $offset    = ($pagina - 1) * $pp;

    $where = []; $params = []; $types = '';

    if ($serial !== '') { $where[] = 'serial_number = ?'; $params[] = $serial;         $types .= 's'; }
    if ($tipo   !== '') { $where[] = 'tipo_evento = ?';   $params[] = (int) $tipo;     $types .= 'i'; }
    if ($data_de  !== '') { $where[] = 'data_hora >= ?';  $params[] = $data_de  . ' 00:00:00'; $types .= 's'; }
    if ($data_ate !== '') { $where[] = 'data_hora <= ?';  $params[] = $data_ate . ' 23:59:59'; $types .= 's'; }

    $cond = $where ? 'WHERE ' . implode(' AND ', $where) : '';

    // Total
    $cnt = $conn->prepare("SELECT COUNT(*) FROM controlid_eventos_acesso {$cond}");
    if (!$cnt) {
        _erro($conn, 'Prepare count: ' . $conn->error);
    }
    if ($types !== '') {
        $cnt->bind_param($types, ...$params);
    }
    $cnt->execute();
    $cnt->bind_result($total);
    $cnt->fetch();
    $cnt->close();

    // Dados
    $stmt = $conn->prepare(
        "SELECT id, serial_number, user_id, data_hora, tipo_evento, criado_em
         FROM controlid_eventos_acesso
         {$cond}
         ORDER BY data_hora DESC
         LIMIT ? OFFSET ?"
    );
    if (!$stmt) {
        _erro($conn, 'Prepare list: ' . $conn->error);
    }
    $stmt->bind_param($types . 'ii', ...array_merge($params, [$pp, $offset]));
    $stmt->execute();
    $res = $stmt->get_result();
    $rows = [];
    while ($r = $res->fetch_assoc()) {
        $rows[] = $r;
    }
    $stmt->close();
    fechar_conexao($conn);

    _ok([
        'eventos'    => $rows,
        'total'      => (int) $total,
        'pagina'     => $pagina,
        'por_pagina' => $pp,
        'paginas'    => (int) ceil($total / $pp),
    ]);
}

// ════════════════════════════════════════════════════════════════════════════
// Fila de Comandos
// ════════════════════════════════════════════════════════════════════════════

function responder_listar_fila(mysqli $conn): void
{
    $serial = trim((string) ($_GET['serial_number'] ?? ''));
    $status = trim((string) ($_GET['status']        ?? ''));
    $pagina = max(1, (int) ($_GET['pagina']         ?? 1));
    $offset = ($pagina - 1) * 30;

    $where = []; $params = []; $types = '';

    if ($serial !== '') {
        $where[] = 'serial_number = ?';
        $params[] = $serial;
        $types .= 's';
    }
    if (in_array($status, ['pendente', 'enviado', 'cancelado'], true)) {
        $where[] = 'status = ?';
        $params[] = $status;
        $types .= 's';
    }

    $cond = $where ? 'WHERE ' . implode(' AND ', $where) : '';

    $stmt = $conn->prepare(
        "SELECT id, serial_number, verbo, endpoint, corpo_json, status, criado_em, enviado_em
         FROM controlid_fila_comandos
         {$cond}
         ORDER BY criado_em DESC
         LIMIT ? OFFSET ?"
    );
    if (!$stmt) {
        _erro($conn, 'Prepare fila: ' . $conn->error);
    }
    $stmt->bind_param($types . 'ii', ...array_merge($params, [30, $offset]));
    $stmt->execute();
    $res = $stmt->get_result();
    $rows = [];
    while ($r = $res->fetch_assoc()) {
        $r['corpo_json'] = json_decode((string) ($r['corpo_json'] ?? '{}'), true) ?? [];
        $rows[] = $r;
    }
    $stmt->close();
    fechar_conexao($conn);
    _ok(['comandos' => $rows]);
}

function responder_enfileirar_comando(mysqli $conn, array $body): void
{
    $serial   = trim((string) ($body['serial_number'] ?? ''));
    $verbo    = strtoupper(trim((string) ($body['verbo']    ?? 'POST')));
    $endpoint = trim((string) ($body['endpoint']            ?? ''));
    $corpo    = $body['corpo_json'] ?? $body['body']         ?? [];

    if ($serial === '' || $endpoint === '') {
        _erro($conn, 'serial_number e endpoint são obrigatórios', 400);
    }
    if (!in_array($verbo, ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'], true)) {
        $verbo = 'POST';
    }

    $corpo_str = json_encode(
        is_array($corpo) ? $corpo : [],
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    );

    // Confirma que o serial existe
    $chk = $conn->prepare(
        'SELECT id FROM controlid_dispositivos
         WHERE serial_number = ? AND ativo = 1 LIMIT 1'
    );
    if (!$chk) {
        _erro($conn, 'Prepare check: ' . $conn->error);
    }
    $chk->bind_param('s', $serial);
    $chk->execute();
    $chk->store_result();
    $existe = $chk->num_rows > 0;
    $chk->close();

    if (!$existe) {
        fechar_conexao($conn);
        http_response_code(404);
        echo json_encode(['sucesso' => false, 'erro' => 'Dispositivo não encontrado']);
        exit;
    }

    $stmt = $conn->prepare(
        'INSERT INTO controlid_fila_comandos
         (serial_number, verbo, endpoint, corpo_json)
         VALUES (?, ?, ?, ?)'
    );
    if (!$stmt) {
        _erro($conn, 'Prepare insert fila: ' . $conn->error);
    }
    $stmt->bind_param('ssss', $serial, $verbo, $endpoint, $corpo_str);
    $stmt->execute();
    $cid = $conn->insert_id;
    $stmt->close();
    fechar_conexao($conn);
    _ok(['id' => $cid, 'mensagem' => 'Comando enfileirado com sucesso']);
}

function responder_cancelar_comando(mysqli $conn, array $body): void
{
    $id = (int) ($body['id'] ?? 0);
    if ($id <= 0) {
        _erro($conn, 'id obrigatório', 400);
    }

    $stmt = $conn->prepare(
        'UPDATE controlid_fila_comandos
         SET status = "cancelado"
         WHERE id = ? AND status = "pendente"'
    );
    if (!$stmt) {
        _erro($conn, 'Prepare cancelar: ' . $conn->error);
    }
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $afetados = $stmt->affected_rows;
    $stmt->close();
    fechar_conexao($conn);

    if ($afetados === 0) {
        http_response_code(409);
        echo json_encode(['sucesso' => false, 'erro' => 'Comando não encontrado ou já enviado/cancelado']);
        exit;
    }
    _ok(['mensagem' => 'Comando cancelado']);
}

// ════════════════════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════════════════════

function _ok(array $data): void
{
    echo json_encode(
        array_merge(['sucesso' => true], $data),
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    );
    exit;
}

function _erro(mysqli $conn, string $msg, int $code = 500): void
{
    fechar_conexao($conn);
    http_response_code($code);
    echo json_encode(['sucesso' => false, 'erro' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}

function _gerar_token(): string
{
    return bin2hex(random_bytes(32));
}

function _buscar_dispositivo_por_serial(mysqli $conn, string $serial): ?array
{
    $stmt = $conn->prepare(
        'SELECT id, serial_number, ativo
         FROM controlid_dispositivos
         WHERE serial_number = ?
         LIMIT 1'
    );
    if (!$stmt) {
        _erro($conn, 'Prepare buscar serial: ' . $conn->error);
    }
    $stmt->bind_param('s', $serial);
    $stmt->execute();
    $res = $stmt->get_result();
    $row = $res ? $res->fetch_assoc() : null;
    $stmt->close();
    return $row ?: null;
}

function _esta_online(?string $ultimo_keep_alive): bool
{
    if ($ultimo_keep_alive === null || $ultimo_keep_alive === '') {
        return false;
    }
    return (time() - (int) strtotime($ultimo_keep_alive)) < 300;
}

/**
 * Adiciona colunas de comunicação à tabela controlid_dispositivos se não existirem.
 * Executado uma vez por request — o MySQL ignora silenciosamente se a coluna já existe.
 */
function _migration_comunicacao(mysqli $conn): void
{
    $cols = [
        ['fabricante',          "VARCHAR(50) NOT NULL DEFAULT 'controlid'"],
        ['tipo_integracao',     "ENUM('bridge_local','monitor_nativo','manual') NOT NULL DEFAULT 'bridge_local'"],
        ['modelo',              "VARCHAR(100) NOT NULL DEFAULT ''"],
        ['tipo_leitor',         "ENUM('uhf','rfid','facial','biometria','qrcode','outro') NOT NULL DEFAULT 'uhf'"],
        ['area_instalacao',     "VARCHAR(150) NOT NULL DEFAULT ''"],
        ['sentido_acesso',      "ENUM('ambos','entrada','saida') NOT NULL DEFAULT 'ambos'"],
        ['ip_local',            "VARCHAR(45)  NOT NULL DEFAULT ''"],
        ['porta_local',         "SMALLINT UNSIGNED NOT NULL DEFAULT 80"],
        ['usuario_api',         "VARCHAR(80)  NOT NULL DEFAULT 'admin'"],
        ['senha_api',           "VARCHAR(255) NOT NULL DEFAULT ''"],
        ['device_id_controlid', "INT UNSIGNED NOT NULL DEFAULT 0"],
        ['bridge_api_key',      "VARCHAR(100) NOT NULL DEFAULT ''"]
    ];

    foreach ($cols as $col) {
        $col_name = $col[0];
        $col_def = $col[1];
        
        $stmt = $conn->prepare("SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'controlid_dispositivos' AND COLUMN_NAME = ?");
        if ($stmt) {
            $stmt->bind_param('s', $col_name);
            $stmt->execute();
            $stmt->store_result();
            $exists = $stmt->num_rows > 0;
            $stmt->close();
            
            if (!$exists) {
                $conn->query("ALTER TABLE controlid_dispositivos ADD COLUMN `{$col_name}` {$col_def}");
            }
        }
    }
}
