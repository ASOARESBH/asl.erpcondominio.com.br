<?php
/**
 * ============================================================
 * API PWA Push Notifications — Portal do Morador
 * Gerencia tokens FCM e envio de notificações push
 * ============================================================
 */
require_once 'config.php';
require_once 'auth_helper.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }

if (!function_exists('retornar_json')) {
    function retornar_json($sucesso, $mensagem, $dados = null) {
        echo json_encode(['sucesso' => $sucesso, 'mensagem' => $mensagem, 'dados' => $dados], JSON_UNESCAPED_UNICODE);
        exit;
    }
}

$conexao = conectar_banco();
$metodo  = $_SERVER['REQUEST_METHOD'];
$action  = $_GET['action'] ?? '';

// ── Funções auxiliares ──────────────────────────────────────

/**
 * Autenticar morador via token Bearer (sessoes_portal)
 */
function autenticar_morador_pwa($conexao) {
    $headers = function_exists('getallheaders') ? getallheaders() : [];
    $auth = $headers['Authorization'] ?? $headers['authorization'] ?? '';
    if (empty($auth) && isset($_SERVER['HTTP_AUTHORIZATION'])) {
        $auth = $_SERVER['HTTP_AUTHORIZATION'];
    }
    if (!preg_match('/Bearer\s+(.+)/i', $auth, $m)) return null;
    $token = trim($m[1]);
    $stmt = $conexao->prepare("SELECT morador_id FROM sessoes_portal WHERE token = ? AND ativo = 1 AND data_expiracao > NOW()");
    $stmt->bind_param("s", $token);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    return $row ? (int)$row['morador_id'] : null;
}

/**
 * Autenticar usuário do ERP (sistema interno)
 */
function autenticar_erp($conexao) {
    if (!function_exists('verificar_autenticacao')) return null;
    return verificar_autenticacao($conexao);
}

/**
 * Obter configuração FCM do banco
 */
function obter_config_fcm($conexao) {
    $result = $conexao->query("SELECT chave, valor FROM pwa_configuracoes");
    $config = [];
    while ($row = $result->fetch_assoc()) {
        $config[$row['chave']] = $row['valor'];
    }
    return $config;
}

/**
 * Enviar push via FCM HTTP v1 API (recomendado pelo Google)
 * Usa Legacy HTTP API como fallback
 */
function enviar_push_fcm($token, $titulo, $corpo, $dados, $server_key) {
    $payload = [
        'to' => $token,
        'notification' => [
            'title' => $titulo,
            'body'  => $corpo,
            'icon'  => '/ico/icon-192x192.png',
            'badge' => '/ico/icon-72x72.png',
            'click_action' => $dados['url'] ?? '/frontend/portal_morador.html'
        ],
        'data' => $dados,
        'priority' => 'high',
        'content_available' => true
    ];

    $ch = curl_init('https://fcm.googleapis.com/fcm/send');
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => [
            'Authorization: key=' . $server_key,
            'Content-Type: application/json'
        ],
        CURLOPT_POSTFIELDS     => json_encode($payload),
        CURLOPT_TIMEOUT        => 30
    ]);

    $response = curl_exec($ch);
    $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curl_error = curl_error($ch);
    curl_close($ch);

    if ($curl_error) {
        return ['sucesso' => false, 'erro' => 'cURL: ' . $curl_error];
    }

    $resp_json = json_decode($response, true);

    if ($http_code === 200 && isset($resp_json['success']) && $resp_json['success'] > 0) {
        return ['sucesso' => true, 'message_id' => $resp_json['results'][0]['message_id'] ?? null];
    }

    $erro = $resp_json['results'][0]['error'] ?? $resp_json['error'] ?? 'Erro desconhecido';
    return ['sucesso' => false, 'erro' => $erro, 'invalido' => in_array($erro, ['InvalidRegistration', 'NotRegistered'])];
}

// ============================================================
// ACTIONS DO PORTAL DO MORADOR (autenticação via token)
// ============================================================

// ── Registrar token FCM do dispositivo ──────────────────────
if ($action === 'registrar_token' && $metodo === 'POST') {
    $morador_id = autenticar_morador_pwa($conexao);
    if (!$morador_id) retornar_json(false, 'Não autorizado');

    $dados = json_decode(file_get_contents('php://input'), true);
    $fcm_token   = trim($dados['fcm_token']   ?? '');
    $device_info = substr(trim($dados['device_info'] ?? ''), 0, 512);
    $plataforma  = in_array($dados['plataforma'] ?? 'web', ['web','android','ios']) ? $dados['plataforma'] : 'web';

    if (empty($fcm_token)) retornar_json(false, 'Token FCM é obrigatório');

    // Verificar se token já existe para este morador
    $stmt = $conexao->prepare("SELECT id FROM pwa_fcm_tokens WHERE morador_id = ? AND fcm_token = ?");
    $stmt->bind_param("is", $morador_id, $fcm_token);
    $stmt->execute();
    $existente = $stmt->get_result()->fetch_assoc();

    if ($existente) {
        // Atualizar token existente
        $stmt2 = $conexao->prepare("UPDATE pwa_fcm_tokens SET ativo = 1, device_info = ?, plataforma = ?, ultimo_uso = NOW() WHERE id = ?");
        $stmt2->bind_param("ssi", $device_info, $plataforma, $existente['id']);
        $stmt2->execute();
        retornar_json(true, 'Token atualizado com sucesso', ['token_id' => $existente['id']]);
    } else {
        // Inserir novo token
        $stmt2 = $conexao->prepare("INSERT INTO pwa_fcm_tokens (morador_id, fcm_token, device_info, plataforma, ultimo_uso) VALUES (?, ?, ?, ?, NOW())");
        $stmt2->bind_param("isss", $morador_id, $fcm_token, $device_info, $plataforma);
        $stmt2->execute();
        $token_id = $conexao->insert_id;
        retornar_json(true, 'Token registrado com sucesso', ['token_id' => $token_id]);
    }
}

// ── Remover token FCM (logout ou revogação) ─────────────────
if ($action === 'remover_token' && $metodo === 'POST') {
    $morador_id = autenticar_morador_pwa($conexao);
    if (!$morador_id) retornar_json(false, 'Não autorizado');

    $dados = json_decode(file_get_contents('php://input'), true);
    $fcm_token = trim($dados['fcm_token'] ?? '');

    if (empty($fcm_token)) {
        // Remover todos os tokens do morador
        $stmt = $conexao->prepare("UPDATE pwa_fcm_tokens SET ativo = 0 WHERE morador_id = ?");
        $stmt->bind_param("i", $morador_id);
    } else {
        $stmt = $conexao->prepare("UPDATE pwa_fcm_tokens SET ativo = 0 WHERE morador_id = ? AND fcm_token = ?");
        $stmt->bind_param("is", $morador_id, $fcm_token);
    }
    $stmt->execute();
    retornar_json(true, 'Token removido com sucesso');
}

// ── Marcar notificação como lida ─────────────────────────────
if ($action === 'marcar_lida' && $metodo === 'POST') {
    $morador_id = autenticar_morador_pwa($conexao);
    if (!$morador_id) retornar_json(false, 'Não autorizado');

    $dados = json_decode(file_get_contents('php://input'), true);
    $notif_id = (int)($dados['notificacao_id'] ?? 0);
    if (!$notif_id) retornar_json(false, 'ID da notificação inválido');

    $stmt = $conexao->prepare("UPDATE pwa_notificacoes_recebidas SET lida = 1, lida_em = NOW() WHERE notificacao_id = ? AND morador_id = ?");
    $stmt->bind_param("ii", $notif_id, $morador_id);
    $stmt->execute();
    retornar_json(true, 'Notificação marcada como lida');
}

// ── Listar notificações do morador ───────────────────────────
if ($action === 'listar_minhas' && $metodo === 'GET') {
    $morador_id = autenticar_morador_pwa($conexao);
    if (!$morador_id) retornar_json(false, 'Não autorizado');

    $limite = min((int)($_GET['limite'] ?? 20), 50);
    $pagina = max((int)($_GET['pagina'] ?? 1), 1);
    $offset = ($pagina - 1) * $limite;

    $stmt = $conexao->prepare("
        SELECT
            n.id, n.titulo, n.corpo, n.tipo, n.url_destino, n.criado_em,
            r.lida, r.lida_em
        FROM pwa_notificacoes_push n
        INNER JOIN pwa_notificacoes_recebidas r ON r.notificacao_id = n.id AND r.morador_id = ?
        WHERE r.status_envio = 'sucesso'
        ORDER BY n.criado_em DESC
        LIMIT ? OFFSET ?
    ");
    $stmt->bind_param("iii", $morador_id, $limite, $offset);
    $stmt->execute();
    $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);

    // Contar não lidas
    $stmt2 = $conexao->prepare("SELECT COUNT(*) as total FROM pwa_notificacoes_recebidas WHERE morador_id = ? AND lida = 0 AND status_envio = 'sucesso'");
    $stmt2->bind_param("i", $morador_id);
    $stmt2->execute();
    $nao_lidas = (int)$stmt2->get_result()->fetch_assoc()['total'];

    retornar_json(true, 'OK', ['notificacoes' => $rows, 'nao_lidas' => $nao_lidas, 'pagina' => $pagina]);
}

// ============================================================
// ACTIONS DO ERP (autenticação via sessão do sistema interno)
// ============================================================

// ── Enviar notificação push ──────────────────────────────────
if ($action === 'enviar' && $metodo === 'POST') {
    $usuario = autenticar_erp($conexao);
    if (!$usuario) retornar_json(false, 'Não autorizado — faça login no ERP');

    $dados = json_decode(file_get_contents('php://input'), true);

    $titulo       = trim($dados['titulo']       ?? '');
    $corpo        = trim($dados['corpo']        ?? '');
    $tipo         = $dados['tipo']              ?? 'geral';
    $url_destino  = $dados['url_destino']       ?? '/frontend/portal_morador.html';
    $destinatario = $dados['destinatario']      ?? 'todos';
    $morador_id   = (int)($dados['morador_id']  ?? 0) ?: null;
    $unidade_id   = (int)($dados['unidade_id']  ?? 0) ?: null;
    $dados_extras = $dados['dados_extras']      ?? null;

    if (empty($titulo) || empty($corpo)) retornar_json(false, 'Título e corpo são obrigatórios');

    $config = obter_config_fcm($conexao);
    $server_key = $config['fcm_server_key'] ?? '';
    if (empty($server_key) || strpos($server_key, 'SUBSTITUA') !== false) {
        retornar_json(false, 'FCM Server Key não configurada. Configure em pwa_configuracoes.');
    }

    // Buscar tokens dos destinatários
    if ($destinatario === 'morador' && $morador_id) {
        $sql_tokens = "SELECT t.id, t.morador_id, t.fcm_token FROM pwa_fcm_tokens t WHERE t.morador_id = ? AND t.ativo = 1";
        $stmt_tok = $conexao->prepare($sql_tokens);
        $stmt_tok->bind_param("i", $morador_id);
    } elseif ($destinatario === 'unidade' && $unidade_id) {
        $sql_tokens = "SELECT t.id, t.morador_id, t.fcm_token FROM pwa_fcm_tokens t INNER JOIN moradores m ON m.id = t.morador_id WHERE m.unidade_id = ? AND t.ativo = 1";
        $stmt_tok = $conexao->prepare($sql_tokens);
        $stmt_tok->bind_param("i", $unidade_id);
    } else {
        $sql_tokens = "SELECT t.id, t.morador_id, t.fcm_token FROM pwa_fcm_tokens t WHERE t.ativo = 1";
        $stmt_tok = $conexao->prepare($sql_tokens);
    }
    $stmt_tok->execute();
    $tokens = $stmt_tok->get_result()->fetch_all(MYSQLI_ASSOC);

    if (empty($tokens)) retornar_json(false, 'Nenhum dispositivo registrado para os destinatários selecionados');

    // Registrar notificação
    $usuario_id   = $usuario['id']   ?? null;
    $usuario_nome = $usuario['nome'] ?? 'Sistema';
    $dados_json   = $dados_extras ? json_encode($dados_extras) : null;
    $total_tokens = count($tokens);

    $stmt_ins = $conexao->prepare("INSERT INTO pwa_notificacoes_push (titulo, corpo, tipo, url_destino, destinatario, morador_id, unidade_id, enviado_por, enviado_por_nome, total_tokens, status, dados_extras) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'enviando', ?)");
    $stmt_ins->bind_param("sssssiiisis", $titulo, $corpo, $tipo, $url_destino, $destinatario, $morador_id, $unidade_id, $usuario_id, $usuario_nome, $total_tokens, $dados_json);
    $stmt_ins->execute();
    $notif_id = $conexao->insert_id;

    // Enviar para cada token
    $sucesso = 0; $falha = 0;
    $payload_dados = [
        'tipo'          => $tipo,
        'url'           => $url_destino,
        'notificacao_id'=> (string)$notif_id,
        'timestamp'     => (string)time()
    ];
    if ($dados_extras) $payload_dados = array_merge($payload_dados, (array)$dados_extras);

    $stmt_rec = $conexao->prepare("INSERT INTO pwa_notificacoes_recebidas (notificacao_id, morador_id, fcm_token_id, status_envio, erro_fcm) VALUES (?, ?, ?, ?, ?)");

    foreach ($tokens as $tok) {
        $resultado = enviar_push_fcm($tok['fcm_token'], $titulo, $corpo, $payload_dados, $server_key);

        if ($resultado['sucesso']) {
            $status_env = 'sucesso'; $erro_fcm = null; $sucesso++;
        } else {
            $status_env = $resultado['invalido'] ? 'invalido' : 'falha';
            $erro_fcm   = $resultado['erro'] ?? 'Erro desconhecido';
            $falha++;
            // Desativar token inválido
            if ($resultado['invalido'] ?? false) {
                $stmt_desat = $conexao->prepare("UPDATE pwa_fcm_tokens SET ativo = 0 WHERE id = ?");
                $stmt_desat->bind_param("i", $tok['id']);
                $stmt_desat->execute();
            }
        }

        $stmt_rec->bind_param("iiiss", $notif_id, $tok['morador_id'], $tok['id'], $status_env, $erro_fcm);
        $stmt_rec->execute();
    }

    // Atualizar status da notificação
    $stmt_upd = $conexao->prepare("UPDATE pwa_notificacoes_push SET status = 'concluido', total_sucesso = ?, total_falha = ?, enviado_em = NOW() WHERE id = ?");
    $stmt_upd->bind_param("iii", $sucesso, $falha, $notif_id);
    $stmt_upd->execute();

    retornar_json(true, "Notificação enviada: {$sucesso} sucesso(s), {$falha} falha(s)", [
        'notificacao_id' => $notif_id,
        'total_tokens'   => $total_tokens,
        'sucesso'        => $sucesso,
        'falha'          => $falha
    ]);
}

// ── Listar notificações enviadas (ERP) ───────────────────────
if ($action === 'listar_enviadas' && $metodo === 'GET') {
    $usuario = autenticar_erp($conexao);
    if (!$usuario) retornar_json(false, 'Não autorizado');

    $limite = min((int)($_GET['limite'] ?? 20), 100);
    $pagina = max((int)($_GET['pagina'] ?? 1), 1);
    $offset = ($pagina - 1) * $limite;

    $rows = $conexao->query("
        SELECT id, titulo, corpo, tipo, destinatario, total_tokens, total_sucesso, total_falha, status, enviado_por_nome, criado_em, enviado_em
        FROM pwa_notificacoes_push
        ORDER BY criado_em DESC
        LIMIT {$limite} OFFSET {$offset}
    ")->fetch_all(MYSQLI_ASSOC);

    retornar_json(true, 'OK', $rows);
}

// ── Obter/salvar configurações FCM (ERP) ─────────────────────
if ($action === 'obter_config' && $metodo === 'GET') {
    $usuario = autenticar_erp($conexao);
    if (!$usuario) retornar_json(false, 'Não autorizado');
    retornar_json(true, 'OK', obter_config_fcm($conexao));
}

if ($action === 'salvar_config' && $metodo === 'POST') {
    $usuario = autenticar_erp($conexao);
    if (!$usuario) retornar_json(false, 'Não autorizado');

    $dados = json_decode(file_get_contents('php://input'), true);
    $chaves_permitidas = ['fcm_server_key','fcm_project_id','fcm_api_key','fcm_auth_domain','fcm_messaging_sender_id','fcm_app_id','fcm_vapid_key','pwa_ativo','push_visitante_ativo','push_inadimplencia_ativo','push_comunicado_ativo','push_os_ativo'];

    $stmt = $conexao->prepare("INSERT INTO pwa_configuracoes (chave, valor) VALUES (?, ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)");
    foreach ($dados as $chave => $valor) {
        if (in_array($chave, $chaves_permitidas)) {
            $stmt->bind_param("ss", $chave, $valor);
            $stmt->execute();
        }
    }
    retornar_json(true, 'Configurações salvas com sucesso');
}

// ── Estatísticas de tokens ───────────────────────────────────
if ($action === 'estatisticas' && $metodo === 'GET') {
    $usuario = autenticar_erp($conexao);
    if (!$usuario) retornar_json(false, 'Não autorizado');

    $stats = [
        'total_tokens_ativos'   => (int)$conexao->query("SELECT COUNT(*) c FROM pwa_fcm_tokens WHERE ativo = 1")->fetch_assoc()['c'],
        'total_moradores_pwa'   => (int)$conexao->query("SELECT COUNT(DISTINCT morador_id) c FROM pwa_fcm_tokens WHERE ativo = 1")->fetch_assoc()['c'],
        'total_notificacoes'    => (int)$conexao->query("SELECT COUNT(*) c FROM pwa_notificacoes_push")->fetch_assoc()['c'],
        'notificacoes_hoje'     => (int)$conexao->query("SELECT COUNT(*) c FROM pwa_notificacoes_push WHERE DATE(criado_em) = CURDATE()")->fetch_assoc()['c'],
        'por_plataforma'        => $conexao->query("SELECT plataforma, COUNT(*) total FROM pwa_fcm_tokens WHERE ativo = 1 GROUP BY plataforma")->fetch_all(MYSQLI_ASSOC)
    ];
    retornar_json(true, 'OK', $stats);
}

// ── Envio automático por evento do sistema ──────────────────
// Chamado internamente por outras APIs (visitante, OS, inadimplência)
if ($action === 'envio_automatico' && $metodo === 'POST') {
    // Verificar se é chamada interna (IP local ou chave interna)
    $ip = $_SERVER['REMOTE_ADDR'] ?? '';
    $chave_interna = $_SERVER['HTTP_X_INTERNAL_KEY'] ?? '';
    $chave_esperada = defined('INTERNAL_API_KEY') ? INTERNAL_API_KEY : 'serra_lib_internal_2024';

    if ($ip !== '127.0.0.1' && $ip !== '::1' && $chave_interna !== $chave_esperada) {
        retornar_json(false, 'Acesso não autorizado');
    }

    $dados = json_decode(file_get_contents('php://input'), true);
    $config = obter_config_fcm($conexao);
    $server_key = $config['fcm_server_key'] ?? '';

    if (empty($server_key) || strpos($server_key, 'SUBSTITUA') !== false) {
        retornar_json(false, 'FCM não configurado');
    }

    $tipo         = $dados['tipo']         ?? 'geral';
    $titulo       = $dados['titulo']       ?? 'Portal do Morador';
    $corpo        = $dados['corpo']        ?? 'Você tem uma nova notificação.';
    $morador_id   = (int)($dados['morador_id'] ?? 0) ?: null;
    $url_destino  = $dados['url']          ?? '/frontend/portal_morador.html';
    $dados_extras = $dados['dados']        ?? [];

    // Verificar se o tipo de push está ativo
    $config_key = "push_{$tipo}_ativo";
    if (isset($config[$config_key]) && $config[$config_key] === '0') {
        retornar_json(false, "Push do tipo '{$tipo}' está desativado nas configurações");
    }

    // Buscar tokens
    if ($morador_id) {
        $stmt_tok = $conexao->prepare("SELECT id, morador_id, fcm_token FROM pwa_fcm_tokens WHERE morador_id = ? AND ativo = 1");
        $stmt_tok->bind_param("i", $morador_id);
    } else {
        $stmt_tok = $conexao->prepare("SELECT id, morador_id, fcm_token FROM pwa_fcm_tokens WHERE ativo = 1");
    }
    $stmt_tok->execute();
    $tokens = $stmt_tok->get_result()->fetch_all(MYSQLI_ASSOC);

    if (empty($tokens)) retornar_json(false, 'Sem tokens para enviar');

    // Registrar notificação
    $total_tokens = count($tokens);
    $dest = $morador_id ? 'morador' : 'todos';
    $dados_json = !empty($dados_extras) ? json_encode($dados_extras) : null;
    $stmt_ins = $conexao->prepare("INSERT INTO pwa_notificacoes_push (titulo, corpo, tipo, url_destino, destinatario, morador_id, enviado_por_nome, total_tokens, status, dados_extras) VALUES (?, ?, ?, ?, ?, ?, 'Sistema Automático', ?, 'enviando', ?)");
    $stmt_ins->bind_param("ssssssis", $titulo, $corpo, $tipo, $url_destino, $dest, $morador_id, $total_tokens, $dados_json);
    $stmt_ins->execute();
    $notif_id = $conexao->insert_id;

    $sucesso = 0; $falha = 0;
    $payload_dados = array_merge(['tipo' => $tipo, 'url' => $url_destino, 'notificacao_id' => (string)$notif_id], $dados_extras);

    $stmt_rec = $conexao->prepare("INSERT INTO pwa_notificacoes_recebidas (notificacao_id, morador_id, fcm_token_id, status_envio, erro_fcm) VALUES (?, ?, ?, ?, ?)");
    foreach ($tokens as $tok) {
        $res = enviar_push_fcm($tok['fcm_token'], $titulo, $corpo, $payload_dados, $server_key);
        $status_env = $res['sucesso'] ? 'sucesso' : ($res['invalido'] ? 'invalido' : 'falha');
        $erro_fcm   = $res['sucesso'] ? null : ($res['erro'] ?? 'Erro');
        if ($res['sucesso']) $sucesso++; else $falha++;
        if ($res['invalido'] ?? false) {
            $conexao->query("UPDATE pwa_fcm_tokens SET ativo = 0 WHERE id = {$tok['id']}");
        }
        $stmt_rec->bind_param("iiiss", $notif_id, $tok['morador_id'], $tok['id'], $status_env, $erro_fcm);
        $stmt_rec->execute();
    }

    $stmt_upd = $conexao->prepare("UPDATE pwa_notificacoes_push SET status = 'concluido', total_sucesso = ?, total_falha = ?, enviado_em = NOW() WHERE id = ?");
    $stmt_upd->bind_param("iii", $sucesso, $falha, $notif_id);
    $stmt_upd->execute();

    retornar_json(true, "Enviado: {$sucesso}/{$total_tokens}", ['notificacao_id' => $notif_id, 'sucesso' => $sucesso, 'falha' => $falha]);
}

retornar_json(false, 'Ação não encontrada: ' . $action);
