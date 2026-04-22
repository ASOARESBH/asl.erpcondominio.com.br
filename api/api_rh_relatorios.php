<?php
// =====================================================
// API: RH — RELATÓRIOS
// =====================================================
// GET ?acao=totais_horas       &mes=N&ano=N[&departamento=X]
// GET ?acao=espelho_ponto      &colaborador_id=N&mes=N&ano=N
// GET ?acao=faltas             &mes=N&ano=N[&departamento=X]
// GET ?acao=horas_extras       &mes=N&ano=N[&departamento=X]
// GET ?acao=atrasos            &mes=N&ano=N[&departamento=X]
// GET ?acao=banco_horas        &colaborador_id=N[&ate_mes=N&ate_ano=N]
// GET ?acao=aniversariantes    &mes=N

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
header('Access-Control-Allow-Methods: GET, OPTIONS');
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

if ($_SERVER['REQUEST_METHOD'] !== 'GET') retornar_json(false, 'Apenas GET permitido');

$acao  = $_GET['acao'] ?? '';
$conn  = conectar_banco();
if (!$conn) retornar_json(false, 'Erro ao conectar ao banco');

// ── Totais de horas (para contabilidade) ────────────────────────────────────
if ($acao === 'totais_horas') {
    $mes  = intval($_GET['mes'] ?? 0);
    $ano  = intval($_GET['ano'] ?? 0);
    $dept = trim($_GET['departamento'] ?? '');
    if ($mes < 1 || $mes > 12 || $ano < 2000) retornar_json(false, 'Mês/Ano inválido');

    $sql = "SELECT c.id, c.nome, c.cargo, c.departamento, c.tipo_contrato,
                   p.total_horas_trabalhadas_min,
                   p.total_horas_extras_min,
                   p.total_atraso_min,
                   p.total_faltas,
                   p.total_folgas,
                   p.status as periodo_status
            FROM rh_colaboradores c
            LEFT JOIN rh_ponto_periodo p ON p.colaborador_id = c.id AND p.mes = ? AND p.ano = ?
            WHERE c.ativo = 1";
    $params = [$mes, $ano];
    $types  = 'ii';

    if ($dept !== '') { $sql .= ' AND c.departamento = ?'; $params[] = $dept; $types .= 's'; }
    $sql .= ' ORDER BY c.departamento, c.nome';

    $stmt = $conn->prepare($sql);
    $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $list = [];
    $res  = $stmt->get_result();
    while ($r = $res->fetch_assoc()) {
        $r['total_horas_trabalhadas_fmt'] = _min_para_horas($r['total_horas_trabalhadas_min']);
        $r['total_horas_extras_fmt']      = _min_para_horas($r['total_horas_extras_min']);
        $r['total_atraso_fmt']            = _min_para_horas($r['total_atraso_min']);
        $list[] = $r;
    }
    $stmt->close(); fechar_conexao($conn);
    retornar_json(true, 'OK', $list);
}

// ── Espelho de ponto ──────────────────────────────────────────────────────────
if ($acao === 'espelho_ponto') {
    $colab_id = intval($_GET['colaborador_id'] ?? 0);
    $mes      = intval($_GET['mes'] ?? 0);
    $ano      = intval($_GET['ano'] ?? 0);
    if ($colab_id <= 0 || $mes < 1 || $ano < 2000) retornar_json(false, 'Parâmetros inválidos');

    $stmt = $conn->prepare(
        "SELECT c.nome, c.cargo, c.departamento, c.cpf,
                p.mes, p.ano, p.status,
                p.total_horas_trabalhadas_min, p.total_horas_extras_min,
                p.total_atraso_min, p.total_faltas, p.total_folgas
         FROM rh_colaboradores c
         LEFT JOIN rh_ponto_periodo p ON p.colaborador_id = c.id AND p.mes=? AND p.ano=?
         WHERE c.id=?"
    );
    $stmt->bind_param('iii', $mes, $ano, $colab_id);
    $stmt->execute();
    $header = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$header) { fechar_conexao($conn); retornar_json(false, 'Colaborador não encontrado'); }

    $periodo_id = null;
    if ($header['status']) {
        $p2 = $conn->prepare("SELECT id FROM rh_ponto_periodo WHERE colaborador_id=? AND mes=? AND ano=?");
        $p2->bind_param('iii', $colab_id, $mes, $ano); $p2->execute();
        $row = $p2->get_result()->fetch_assoc(); $p2->close();
        $periodo_id = $row['id'] ?? null;
    }

    $lancamentos = [];
    if ($periodo_id) {
        $stmt2 = $conn->prepare(
            "SELECT DATE_FORMAT(data,'%d/%m/%Y') as data_fmt,
                    DAYNAME(data) as dia_semana,
                    TIME_FORMAT(hora_entrada,'%H:%i')        as he,
                    TIME_FORMAT(hora_almoco_saida,'%H:%i')   as has,
                    TIME_FORMAT(hora_almoco_retorno,'%H:%i') as har,
                    TIME_FORMAT(hora_saida,'%H:%i')          as hs,
                    tipo_dia, horas_trabalhadas_min, horas_extras_min, atraso_min, observacoes
             FROM rh_ponto_lancamento WHERE periodo_id=? ORDER BY data"
        );
        $stmt2->bind_param('i', $periodo_id); $stmt2->execute();
        $res2 = $stmt2->get_result();
        while ($r = $res2->fetch_assoc()) {
            $r['horas_trab_fmt']  = _min_para_horas($r['horas_trabalhadas_min']);
            $r['horas_extra_fmt'] = _min_para_horas($r['horas_extras_min']);
            $r['atraso_fmt']      = _min_para_horas($r['atraso_min']);
            $lancamentos[] = $r;
        }
        $stmt2->close();
    }

    if ($header) {
        $header['total_horas_trabalhadas_fmt'] = _min_para_horas($header['total_horas_trabalhadas_min']);
        $header['total_horas_extras_fmt']      = _min_para_horas($header['total_horas_extras_min']);
        $header['total_atraso_fmt']            = _min_para_horas($header['total_atraso_min']);
    }

    fechar_conexao($conn);
    retornar_json(true, 'OK', ['cabecalho' => $header, 'lancamentos' => $lancamentos]);
}

// ── Faltas ────────────────────────────────────────────────────────────────────
if ($acao === 'faltas') {
    $mes  = intval($_GET['mes'] ?? 0);
    $ano  = intval($_GET['ano'] ?? 0);
    $dept = trim($_GET['departamento'] ?? '');
    if ($mes < 1 || $mes > 12 || $ano < 2000) retornar_json(false, 'Mês/Ano inválido');

    $sql = "SELECT c.nome, c.cargo, c.departamento,
                   l.data, DATE_FORMAT(l.data,'%d/%m/%Y') as data_fmt,
                   l.tipo_dia, l.observacoes
            FROM rh_ponto_lancamento l
            JOIN rh_ponto_periodo p ON p.id = l.periodo_id
            JOIN rh_colaboradores c ON c.id = l.colaborador_id
            WHERE p.mes=? AND p.ano=? AND l.tipo_dia IN ('falta','afastamento') AND c.ativo=1";
    $params = [$mes, $ano]; $types = 'ii';
    if ($dept !== '') { $sql .= ' AND c.departamento=?'; $params[] = $dept; $types .= 's'; }
    $sql .= ' ORDER BY c.nome, l.data';

    $stmt = $conn->prepare($sql);
    $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $list = [];
    while ($r = $stmt->get_result()->fetch_assoc()) $list[] = $r;
    $stmt->close(); fechar_conexao($conn);
    retornar_json(true, 'OK', $list);
}

// ── Horas extras ─────────────────────────────────────────────────────────────
if ($acao === 'horas_extras') {
    $mes  = intval($_GET['mes'] ?? 0);
    $ano  = intval($_GET['ano'] ?? 0);
    $dept = trim($_GET['departamento'] ?? '');
    if ($mes < 1 || $mes > 12 || $ano < 2000) retornar_json(false, 'Mês/Ano inválido');

    $sql = "SELECT c.nome, c.cargo, c.departamento,
                   p.total_horas_extras_min,
                   p.total_horas_trabalhadas_min
            FROM rh_ponto_periodo p
            JOIN rh_colaboradores c ON c.id = p.colaborador_id
            WHERE p.mes=? AND p.ano=? AND p.total_horas_extras_min > 0 AND c.ativo=1";
    $params = [$mes, $ano]; $types = 'ii';
    if ($dept !== '') { $sql .= ' AND c.departamento=?'; $params[] = $dept; $types .= 's'; }
    $sql .= ' ORDER BY p.total_horas_extras_min DESC';

    $stmt = $conn->prepare($sql);
    $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $list = [];
    $res  = $stmt->get_result();
    while ($r = $res->fetch_assoc()) {
        $r['extras_fmt']     = _min_para_horas($r['total_horas_extras_min']);
        $r['trabalhadas_fmt'] = _min_para_horas($r['total_horas_trabalhadas_min']);
        $list[] = $r;
    }
    $stmt->close(); fechar_conexao($conn);
    retornar_json(true, 'OK', $list);
}

// ── Atrasos ───────────────────────────────────────────────────────────────────
if ($acao === 'atrasos') {
    $mes  = intval($_GET['mes'] ?? 0);
    $ano  = intval($_GET['ano'] ?? 0);
    $dept = trim($_GET['departamento'] ?? '');
    if ($mes < 1 || $mes > 12 || $ano < 2000) retornar_json(false, 'Mês/Ano inválido');

    $sql = "SELECT c.nome, c.cargo, c.departamento,
                   l.data, DATE_FORMAT(l.data,'%d/%m/%Y') as data_fmt,
                   l.atraso_min,
                   TIME_FORMAT(l.hora_entrada,'%H:%i') as hora_entrada
            FROM rh_ponto_lancamento l
            JOIN rh_ponto_periodo p ON p.id = l.periodo_id
            JOIN rh_colaboradores c ON c.id = l.colaborador_id
            WHERE p.mes=? AND p.ano=? AND l.atraso_min > 0 AND c.ativo=1";
    $params = [$mes, $ano]; $types = 'ii';
    if ($dept !== '') { $sql .= ' AND c.departamento=?'; $params[] = $dept; $types .= 's'; }
    $sql .= ' ORDER BY c.nome, l.data';

    $stmt = $conn->prepare($sql);
    $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $list = [];
    $res  = $stmt->get_result();
    while ($r = $res->fetch_assoc()) {
        $r['atraso_fmt'] = _min_para_horas($r['atraso_min']);
        $list[] = $r;
    }
    $stmt->close(); fechar_conexao($conn);
    retornar_json(true, 'OK', $list);
}

// ── Banco de horas acumulado ──────────────────────────────────────────────────
if ($acao === 'banco_horas') {
    $colab_id = intval($_GET['colaborador_id'] ?? 0);
    if ($colab_id <= 0) retornar_json(false, 'colaborador_id obrigatório');

    $ate_mes = intval($_GET['ate_mes'] ?? date('m'));
    $ate_ano = intval($_GET['ate_ano'] ?? date('Y'));

    $stmt = $conn->prepare(
        "SELECT mes, ano, total_horas_trabalhadas_min, total_horas_extras_min, total_atraso_min
         FROM rh_ponto_periodo
         WHERE colaborador_id=?
           AND (ano < ? OR (ano=? AND mes <= ?))
         ORDER BY ano ASC, mes ASC"
    );
    $stmt->bind_param('iiii', $colab_id, $ate_ano, $ate_ano, $ate_mes);
    $stmt->execute();
    $list  = [];
    $total = 0;
    $res   = $stmt->get_result();
    while ($r = $res->fetch_assoc()) {
        $saldo = $r['total_horas_extras_min'] - $r['total_atraso_min'];
        $total += $saldo;
        $r['saldo_min']   = $saldo;
        $r['saldo_fmt']   = ($saldo < 0 ? '-' : '') . _min_para_horas(abs($saldo));
        $r['acumulado_min'] = $total;
        $r['acumulado_fmt'] = ($total < 0 ? '-' : '') . _min_para_horas(abs($total));
        $list[] = $r;
    }
    $stmt->close(); fechar_conexao($conn);
    retornar_json(true, 'OK', ['meses' => $list, 'total_acumulado_min' => $total, 'total_acumulado_fmt' => ($total < 0 ? '-' : '') . _min_para_horas(abs($total))]);
}

// ── Aniversariantes ───────────────────────────────────────────────────────────
if ($acao === 'aniversariantes') {
    $mes = intval($_GET['mes'] ?? date('m'));
    $stmt = $conn->prepare(
        "SELECT nome, cargo, departamento, data_nascimento,
                DATE_FORMAT(data_nascimento,'%d/%m') as aniversario
         FROM rh_colaboradores
         WHERE MONTH(data_nascimento) = ? AND ativo = 1
         ORDER BY DAY(data_nascimento), nome"
    );
    $stmt->bind_param('i', $mes);
    $stmt->execute();
    $list = [];
    while ($r = $stmt->get_result()->fetch_assoc()) $list[] = $r;
    $stmt->close(); fechar_conexao($conn);
    retornar_json(true, 'OK', $list);
}

fechar_conexao($conn);
retornar_json(false, 'Ação não reconhecida');

function _min_para_horas(?int $min): string {
    if (!$min || $min <= 0) return '00:00';
    $h = intdiv($min, 60);
    $m = $min % 60;
    return sprintf('%02d:%02d', $h, $m);
}
?>
