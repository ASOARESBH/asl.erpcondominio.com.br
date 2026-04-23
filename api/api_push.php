<?php
/**
 * api_push.php — Endpoint Push Mode Control iD v2
 *
 * O dispositivo é o ÚNICO iniciador de todas as conexões.
 * Não há polling de rede, IP local, socket ou cURL para o leitor.
 *
 * Fluxo por requisição:
 *   1. Autentica via header X-ControlID-Token (ou fallback User-Agent)
 *   2. Identifica o leitor pelo campo device_id no JSON body
 *   3. Atualiza ultimo_keep_alive do dispositivo
 *   4. Registra eventos de acesso recebidos em controlid_eventos_acesso
 *   5. Busca o comando pendente mais antigo para este serial_number
 *   6. Marca como "enviado" e retorna no formato Control iD:
 *        {"verb":"POST","endpoint":"/api/...","body":{...}}
 *      Se não houver comando pendente, retorna: {}
 *
 * Tabelas utilizadas:
 *   controlid_dispositivos    — valida token e atualiza keep-alive
 *   controlid_eventos_acesso  — armazena eventos de acesso
 *   controlid_fila_comandos   — fila de comandos pendentes
 */

declare(strict_types=1);

ob_start();
require_once __DIR__ . '/config.php';
date_default_timezone_set('America/Sao_Paulo');

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

// ── CORS (aceita apenas origens do Control iD ou localhost) ─────────────────
$allowed_origins = [
    'https://asl.erpcondominios.com.br',
    'https://asl.erpcondominio.com.br',
    'http://localhost',
    'http://127.0.0.1',
];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin && in_array($origin, $allowed_origins, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
}
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-ControlID-Token, X-Bridge-Key');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    push_respond([], 200);
}

// ── Apenas POST ──────────────────────────────────────────────────────────────
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    push_respond(['erro' => 'Método não permitido'], 405);
}

// ── Lê body ──────────────────────────────────────────────────────────────────
$raw  = (string) file_get_contents('php://input');
$body = push_parse_json($raw);

// ── Identifica device_id ─────────────────────────────────────────────────────
$serial = trim((string) ($body['device_id'] ?? $body['serial_number'] ?? ''));
if ($serial === '') {
    push_log('WARN', 'device_id ausente. IP=' . push_ip());
    push_respond(['erro' => 'device_id obrigatório'], 400);
}

// ── Conecta ao banco ─────────────────────────────────────────────────────────
$conn = conectar_banco();
if (!($conn instanceof mysqli)) {
    push_respond(['erro' => 'Banco de dados indisponível'], 503);
}

// ── Autentica ────────────────────────────────────────────────────────────────
$dispositivo = push_buscar_dispositivo($conn, $serial);

if ($dispositivo === null) {
    push_log('WARN', "Dispositivo não encontrado: serial={$serial} IP=" . push_ip());
    fechar_conexao($conn);
    push_respond(['erro' => 'Dispositivo não cadastrado'], 401);
}

if (!push_autenticar($dispositivo, $body)) {
    push_log('WARN', "Falha na autenticação: serial={$serial} IP=" . push_ip());
    fechar_conexao($conn);
    push_respond(['erro' => 'Token inválido'], 401);
}

// ── Atualiza keep-alive ──────────────────────────────────────────────────────
push_atualizar_keepalive($conn, $serial);

// ── Registra eventos ─────────────────────────────────────────────────────────
$eventos = $body['events'] ?? $body['eventos'] ?? [];
if (is_array($eventos) && count($eventos) > 0) {
    push_registrar_eventos($conn, $serial, $eventos);
}

// ── Busca e entrega próximo comando ─────────────────────────────────────────
$comando = push_proximo_comando($conn, $serial);

fechar_conexao($conn);

if ($comando !== null) {
    push_log(
        'INFO',
        "Comando entregue: id={$comando['id']} serial={$serial} "
        . "endpoint={$comando['endpoint']}"
    );
    push_respond([
        'verb'     => $comando['verbo'],
        'endpoint' => $comando['endpoint'],
        'body'     => json_decode((string) ($comando['corpo_json'] ?? '{}'), true) ?? [],
    ]);
}

// Sem comandos pendentes — resposta vazia conforme protocolo Control iD
push_respond([]);

// ════════════════════════════════════════════════════════════════════════════
// Funções auxiliares
// ════════════════════════════════════════════════════════════════════════════

/**
 * Encerra a execução com resposta JSON.
 * Resposta vazia ({}) quando $payload está vazio — protocolo Control iD.
 */
function push_respond(array $payload, int $status = 200): void
{
    while (ob_get_level() > 0) {
        ob_end_clean();
    }
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(
        empty($payload) ? new stdClass() : $payload,
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    );
    exit;
}

function push_log(string $nivel, string $msg): void
{
    error_log('[PUSH][' . $nivel . '] ' . $msg);
}

function push_ip(): string
{
    return $_SERVER['REMOTE_ADDR'] ?? 'desconhecido';
}

function push_parse_json(string $raw): array
{
    if ($raw === '') {
        return [];
    }
    $decoded = json_decode($raw, true);
    if (json_last_error() !== JSON_ERROR_NONE || !is_array($decoded)) {
        push_log('WARN', 'JSON inválido: ' . json_last_error_msg());
        return [];
    }
    return $decoded;
}

function push_header(string $name): string
{
    $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
    if (isset($_SERVER[$key])) {
        return trim((string) $_SERVER[$key]);
    }
    if (function_exists('getallheaders')) {
        foreach (getallheaders() as $h => $v) {
            if (strcasecmp($h, $name) === 0) {
                return trim((string) $v);
            }
        }
    }
    return '';
}

/**
 * Retorna o dispositivo ativo ou null.
 */
function push_buscar_dispositivo(mysqli $conn, string $serial): ?array
{
    $stmt = $conn->prepare(
        'SELECT id, serial_number, token_autenticacao
         FROM controlid_dispositivos
         WHERE serial_number = ? AND ativo = 1
         LIMIT 1'
    );
    if (!$stmt) {
        push_log('ERROR', 'Prepare buscar dispositivo: ' . $conn->error);
        return null;
    }
    $stmt->bind_param('s', $serial);
    $stmt->execute();
    $res  = $stmt->get_result();
    $row  = $res ? $res->fetch_assoc() : null;
    $stmt->close();
    return $row ?: null;
}

/**
 * Valida o token enviado pelo dispositivo.
 *
 * Ordem de busca do token recebido:
 *   1. Header X-ControlID-Token
 *   2. Header X-Bridge-Key (legado)
 *   3. Campo "token" no body JSON
 *
 * Fallback por User-Agent: dispositivos Control iD identificam-se com
 * "ControlID" no User-Agent — aceitamos sem token quando o cadastro
 * tem token vazio (modo sem autenticação, não recomendado para produção).
 */
function push_autenticar(array $dispositivo, array $body): bool
{
    $token_recebido = push_header('X-ControlID-Token');

    if ($token_recebido === '') {
        $token_recebido = push_header('X-Bridge-Key');
    }
    if ($token_recebido === '') {
        $token_recebido = trim((string) ($body['token'] ?? ''));
    }

    $token_cadastrado = (string) ($dispositivo['token_autenticacao'] ?? '');

    // Se o dispositivo não tem token cadastrado, aceita qualquer requisição
    // que venha com User-Agent Control iD (modo desenvolvimento).
    if ($token_cadastrado === '') {
        $ua = push_header('User-Agent');
        return stripos($ua, 'ControlID') !== false || $token_recebido === '';
    }

    if ($token_recebido === '') {
        return false;
    }

    return hash_equals($token_cadastrado, $token_recebido);
}

/**
 * Atualiza ultimo_keep_alive para NOW().
 */
function push_atualizar_keepalive(mysqli $conn, string $serial): void
{
    $stmt = $conn->prepare(
        'UPDATE controlid_dispositivos
         SET ultimo_keep_alive = NOW()
         WHERE serial_number = ?'
    );
    if (!$stmt) {
        push_log('ERROR', 'Prepare keep-alive: ' . $conn->error);
        return;
    }
    $stmt->bind_param('s', $serial);
    if (!$stmt->execute()) {
        push_log('ERROR', 'Keep-alive execute: ' . $stmt->error);
    }
    $stmt->close();
}

/**
 * Insere eventos de acesso recebidos no payload.
 *
 * Campos esperados por evento (Control iD Push Mode):
 *   id         — ID do evento no dispositivo (para idempotência)
 *   user_id    — ID do usuário no Control iD
 *   time       — data/hora do evento (string ISO ou timestamp)
 *   event      — código do evento (7 = acesso liberado, 4 = negado, etc.)
 */
function push_registrar_eventos(mysqli $conn, string $serial, array $eventos): void
{
    $stmt = $conn->prepare(
        'INSERT IGNORE INTO controlid_eventos_acesso
         (serial_number, user_id, data_hora, tipo_evento, raw_payload)
         VALUES (?, ?, ?, ?, ?)'
    );
    if (!$stmt) {
        push_log('ERROR', 'Prepare insert evento: ' . $conn->error);
        return;
    }

    foreach ($eventos as $ev) {
        if (!is_array($ev)) {
            continue;
        }

        $user_id     = (int) ($ev['user_id'] ?? 0);
        $tipo        = (int) ($ev['event']   ?? $ev['event_type'] ?? 0);
        $data_hora   = push_normalizar_datetime($ev['time'] ?? $ev['data_hora'] ?? null);
        $raw         = json_encode($ev, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        $stmt->bind_param('siiss', $serial, $user_id, $data_hora, $tipo, $raw);
        if (!$stmt->execute()) {
            push_log('WARN', 'Erro inserir evento: ' . $stmt->error);
        }
    }

    $stmt->close();
}

/**
 * Busca o próximo comando pendente e atomicamente o marca como "enviado".
 * Retorna o array do comando ou null se não houver nada.
 */
function push_proximo_comando(mysqli $conn, string $serial): ?array
{
    $conn->begin_transaction();

    // FOR UPDATE garante exclusividade em ambiente concorrente
    $stmt = $conn->prepare(
        'SELECT id, verbo, endpoint, corpo_json
         FROM controlid_fila_comandos
         WHERE serial_number = ? AND status = "pendente"
         ORDER BY criado_em ASC
         LIMIT 1
         FOR UPDATE'
    );
    if (!$stmt) {
        push_log('ERROR', 'Prepare select comando: ' . $conn->error);
        $conn->rollback();
        return null;
    }

    $stmt->bind_param('s', $serial);
    $stmt->execute();
    $res     = $stmt->get_result();
    $comando = $res ? $res->fetch_assoc() : null;
    $stmt->close();

    if ($comando === null) {
        $conn->rollback();
        return null;
    }

    $id = (int) $comando['id'];
    $upd = $conn->prepare(
        'UPDATE controlid_fila_comandos
         SET status = "enviado", enviado_em = NOW()
         WHERE id = ?'
    );
    if (!$upd) {
        push_log('ERROR', 'Prepare update comando: ' . $conn->error);
        $conn->rollback();
        return null;
    }

    $upd->bind_param('i', $id);
    $ok = $upd->execute();
    $upd->close();

    if (!$ok) {
        push_log('ERROR', 'Update comando falhou: ' . $conn->error);
        $conn->rollback();
        return null;
    }

    $conn->commit();
    return $comando;
}

function push_normalizar_datetime($value): string
{
    if ($value === null || $value === '') {
        return date('Y-m-d H:i:s');
    }
    if (is_numeric($value)) {
        return date('Y-m-d H:i:s', (int) $value);
    }
    $ts = strtotime((string) $value);
    return $ts !== false ? date('Y-m-d H:i:s', $ts) : date('Y-m-d H:i:s');
}
