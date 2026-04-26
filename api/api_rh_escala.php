<?php
// =====================================================
// API: RH — ESCALAS DE TRABALHO
// =====================================================
// GET  ?acao=listar&colaborador_id=N
// GET  ?acao=obter&id=N
// POST ?acao=criar   {colaborador_id, nome_escala, tipo, ...}
// POST ?acao=atualizar&id=N
// DELETE ?acao=excluir&id=N

ob_start();
require_once 'config.php';
require_once 'auth_helper.php';
require_once 'error_logger.php';
ob_end_clean();

header('Content-Type: application/json; charset=utf-8');
$allowed = ['https://asl.erpcondominios.com.br','http://asl.erpcondominios.com.br','https://erpcondominios.com.br','http://erpcondominios.com.br','http://localhost','http://127.0.0.1'];
$origin  = $_SERVER['HTTP_ORIGIN'] ?? '';
header('Access-Control-Allow-Origin: ' . (in_array($origin, $allowed) ? $origin : 'https://asl.erpcondominios.com.br'));
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Cache-Control: no-cache, must-revalidate');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }

if (!function_exists('retornar_json')) {
    function retornar_json($sucesso, $mensagem, $dados = null) {
        $r = ['sucesso' => $sucesso, 'mensagem' => $mensagem];
        if ($dados !== null) $r['dados'] = $dados;
        echo json_encode($r, JSON_UNESCAPED_UNICODE);
        exit;
    }
}

try { verificarAutenticacao(true, 'operador'); }
catch (Exception $e) { retornar_json(false, 'Não autenticado'); }

$metodo = $_SERVER['REQUEST_METHOD'];
$body   = ($metodo !== 'GET') ? (json_decode(file_get_contents('php://input'), true) ?? []) : [];
$acao   = $_GET['acao'] ?? $body['acao'] ?? '';
$conn   = conectar_banco();
if (!$conn) retornar_json(false, 'Erro ao conectar ao banco');

// ── LISTAR ────────────────────────────────────────────────────────────────────
if ($acao === 'listar') {
    $colab_id = intval($_GET['colaborador_id'] ?? 0);
    if ($colab_id <= 0) retornar_json(false, 'colaborador_id obrigatório');

    $stmt = $conn->prepare(
        "SELECT e.*, c.nome as colaborador_nome
         FROM rh_escala e
         JOIN rh_colaboradores c ON c.id = e.colaborador_id
         WHERE e.colaborador_id = ? AND e.ativo = 1
         ORDER BY e.nome_escala ASC"
    );
    $stmt->bind_param('i', $colab_id);
    $stmt->execute();
    $list = [];
    $res = $stmt->get_result();
    while ($r = $res->fetch_assoc()) $list[] = $r;
    $stmt->close(); fechar_conexao($conn);
    retornar_json(true, 'OK', $list);
}

// ── OBTER ─────────────────────────────────────────────────────────────────────
if ($acao === 'obter') {
    $id = intval($_GET['id'] ?? 0);
    if ($id <= 0) retornar_json(false, 'ID inválido');

    $stmt = $conn->prepare(
        "SELECT e.*, c.nome as colaborador_nome
         FROM rh_escala e
         JOIN rh_colaboradores c ON c.id = e.colaborador_id
         WHERE e.id = ?"
    );
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close(); fechar_conexao($conn);
    if (!$row) retornar_json(false, 'Escala não encontrada');
    retornar_json(true, 'OK', $row);
}

// ── CRIAR ─────────────────────────────────────────────────────────────────────
if ($acao === 'criar' && $metodo === 'POST') {
    $d = _extrair_escala($body);
    if ($d['colaborador_id'] <= 0) retornar_json(false, 'colaborador_id obrigatório');

    $dias_json = json_encode($d['dias_trabalho'] ?? ['seg','ter','qua','qui','sex']);

    $semA_json    = $d['alternada_semana_a']    ? json_encode($d['alternada_semana_a'])    : null;
    $semB_json    = $d['alternada_semana_b']    ? json_encode($d['alternada_semana_b'])    : null;
    $alt_ativa    = $d['alternada_ativa'];
    $alt_inicio   = $d['alternada_dia_inicio'];
    $alt_tfolga   = $d['alternada_tipo_folga'];

    $stmt = $conn->prepare(
        "INSERT INTO rh_escala
         (colaborador_id,nome_escala,tipo,carga_horaria_diaria_min,dias_trabalho,
          hora_entrada,hora_almoco_saida,hora_almoco_retorno,hora_saida,
          tolerancia_minutos,intervalo_almoco_min,
          alternada_ativa,alternada_dia_inicio,alternada_semana_a,alternada_semana_b,alternada_tipo_folga)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
    );
    // bind: i=colab_id, s=nome, s=tipo, i=carga, s=dias, s=entrada, s=alm_saida, s=alm_ret, s=saida
    //        i=toler, i=intervalo, i=alt_ativa, s=alt_inicio, s=semA, s=semB, s=alt_tfolga  (16 total)
    $stmt->bind_param('ississsssiisssssi',
        $d['colaborador_id'],$d['nome_escala'],$d['tipo'],$d['carga_horaria_diaria_min'],
        $dias_json,
        $d['hora_entrada'],$d['hora_almoco_saida'],$d['hora_almoco_retorno'],$d['hora_saida'],
        $d['tolerancia_minutos'],$d['intervalo_almoco_min'],
        $alt_ativa,$alt_inicio,$semA_json,$semB_json,$alt_tfolga
    );
    if (!$stmt->execute()) { $stmt->close(); fechar_conexao($conn); retornar_json(false, 'Erro ao criar escala: ' . $conn->error); }
    $novo_id = $conn->insert_id;
    $stmt->close(); fechar_conexao($conn);
    retornar_json(true, 'Escala criada', ['id' => $novo_id]);
}

// ── ATUALIZAR ─────────────────────────────────────────────────────────────────
if ($acao === 'atualizar' && $metodo === 'POST') {
    $id = intval($_GET['id'] ?? $body['id'] ?? 0);
    if ($id <= 0) retornar_json(false, 'ID inválido');

    $d = _extrair_escala($body);
    $dias_json2  = json_encode($d['dias_trabalho'] ?? ['seg','ter','qua','qui','sex']);
    $semA_json2  = $d['alternada_semana_a']    ? json_encode($d['alternada_semana_a'])    : null;
    $semB_json2  = $d['alternada_semana_b']    ? json_encode($d['alternada_semana_b'])    : null;
    $alt_ativa2  = $d['alternada_ativa'];
    $alt_inicio2 = $d['alternada_dia_inicio'];
    $alt_tfolga2 = $d['alternada_tipo_folga'];

    $stmt = $conn->prepare(
        "UPDATE rh_escala SET
         nome_escala=?,tipo=?,carga_horaria_diaria_min=?,dias_trabalho=?,
         hora_entrada=?,hora_almoco_saida=?,hora_almoco_retorno=?,hora_saida=?,
         tolerancia_minutos=?,intervalo_almoco_min=?,
         alternada_ativa=?,alternada_dia_inicio=?,alternada_semana_a=?,alternada_semana_b=?,alternada_tipo_folga=?
         WHERE id=?"
    );
    // bind: s=nome, s=tipo, i=carga, s=dias, s=entrada, s=alm_saida, s=alm_ret, s=saida
    //        i=toler, i=intervalo, i=alt_ativa, s=alt_inicio, s=semA, s=semB, s=alt_tfolga, i=id (16 total)
    $stmt->bind_param('ssisssssiisissssi',
        $d['nome_escala'],$d['tipo'],$d['carga_horaria_diaria_min'],$dias_json2,
        $d['hora_entrada'],$d['hora_almoco_saida'],$d['hora_almoco_retorno'],$d['hora_saida'],
        $d['tolerancia_minutos'],$d['intervalo_almoco_min'],
        $alt_ativa2,$alt_inicio2,$semA_json2,$semB_json2,$alt_tfolga2,
        $id
    );
    if (!$stmt->execute()) { $stmt->close(); fechar_conexao($conn); retornar_json(false, 'Erro ao atualizar escala: ' . $conn->error); }
    $stmt->close(); fechar_conexao($conn);
    retornar_json(true, 'Escala atualizada');
}

// ── EXCLUIR (soft delete) ─────────────────────────────────────────────────────
if ($metodo === 'DELETE') {
    $body2 = json_decode(file_get_contents('php://input'), true) ?? [];
    $id    = intval($body2['id'] ?? $_GET['id'] ?? 0);
    if ($id <= 0) retornar_json(false, 'ID inválido');

    $stmt = $conn->prepare("UPDATE rh_escala SET ativo=0 WHERE id=?");
    $stmt->bind_param('i', $id);
    $ok = $stmt->execute(); $stmt->close(); fechar_conexao($conn);
    retornar_json($ok, $ok ? 'Escala removida' : 'Erro ao remover');
}

fechar_conexao($conn);
retornar_json(false, 'Ação não reconhecida');

function _extrair_escala(array $b): array {
    $n = fn($k, $def=null) => isset($b[$k]) && $b[$k] !== '' ? $b[$k] : $def;

    $tipo = $n('tipo', 'livre');
    $isAlternada = ($tipo === 'alternada');

    // Semana A e B podem vir como array ou JSON string
    $semA = $n('alternada_semana_a', null);
    $semB = $n('alternada_semana_b', null);
    if (is_string($semA)) $semA = json_decode($semA, true);
    if (is_string($semB)) $semB = json_decode($semB, true);

    return [
        'colaborador_id'           => intval($n('colaborador_id', 0)),
        'nome_escala'              => trim($n('nome_escala', 'Principal')),
        'tipo'                     => $tipo,
        'carga_horaria_diaria_min' => intval($n('carga_horaria_diaria_min', 480)),
        'dias_trabalho'            => $n('dias_trabalho', ['seg','ter','qua','qui','sex']),
        'hora_entrada'             => $n('hora_entrada', '08:00:00'),
        'hora_almoco_saida'        => $n('hora_almoco_saida', '12:00:00'),
        'hora_almoco_retorno'      => $n('hora_almoco_retorno', '13:00:00'),
        'hora_saida'               => $n('hora_saida', '17:00:00'),
        'tolerancia_minutos'       => intval($n('tolerancia_minutos', 10)),
        'intervalo_almoco_min'     => intval($n('intervalo_almoco_min', 60)),
        // Escala alternada
        'alternada_ativa'          => $isAlternada ? 1 : 0,
        'alternada_dia_inicio'     => $isAlternada ? ($n('alternada_dia_inicio', null)) : null,
        'alternada_semana_a'       => $isAlternada ? $semA : null,
        'alternada_semana_b'       => $isAlternada ? $semB : null,
        'alternada_tipo_folga'     => $isAlternada ? ($n('alternada_tipo_folga', 'folga')) : 'folga',
    ];
}
?>
