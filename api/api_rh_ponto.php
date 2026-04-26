<?php
// =====================================================
// API: RH — REGISTRO DE PONTO
// =====================================================
// Períodos:
//   GET  ?acao=listar_periodos&colaborador_id=N
//   GET  ?acao=obter_periodo&id=N
//   POST ?acao=criar_periodo  {colaborador_id, mes, ano}
//   POST ?acao=fechar_periodo&id=N
//   POST ?acao=reabrir_periodo&id=N
//   DELETE ?acao=excluir_periodo&id=N
//
// Lançamentos:
//   GET  ?acao=listar_lancamentos&periodo_id=N
//   POST ?acao=salvar_lancamento  {periodo_id, colaborador_id, data, hora_*, tipo_dia, obs}
//   DELETE ?acao=excluir_lancamento&id=N

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

// ── PERÍODOS ──────────────────────────────────────────────────────────────────

if ($acao === 'listar_periodos') {
    $colab_id = intval($_GET['colaborador_id'] ?? 0);
    if ($colab_id <= 0) retornar_json(false, 'colaborador_id obrigatório');

    $stmt = $conn->prepare(
        "SELECT p.*, c.nome as colaborador_nome
         FROM rh_ponto_periodo p
         JOIN rh_colaboradores c ON c.id = p.colaborador_id
         WHERE p.colaborador_id = ?
         ORDER BY p.ano DESC, p.mes DESC"
    );
    $stmt->bind_param('i', $colab_id);
    $stmt->execute();
    $list = [];
    $res = $stmt->get_result();
    while ($r = $res->fetch_assoc()) $list[] = $r;
    $stmt->close(); fechar_conexao($conn);
    retornar_json(true, 'OK', $list);
}

if ($acao === 'obter_periodo') {
    $id = intval($_GET['id'] ?? 0);
    if ($id <= 0) retornar_json(false, 'ID inválido');

    $stmt = $conn->prepare(
        "SELECT p.*, c.nome as colaborador_nome, c.cargo, c.departamento
         FROM rh_ponto_periodo p
         JOIN rh_colaboradores c ON c.id = p.colaborador_id
         WHERE p.id = ?"
    );
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$row) { fechar_conexao($conn); retornar_json(false, 'Período não encontrado'); }
    fechar_conexao($conn);
    retornar_json(true, 'OK', $row);
}

if ($acao === 'criar_periodo' && $metodo === 'POST') {
    $colab_id = intval($body['colaborador_id'] ?? 0);
    $mes      = intval($body['mes'] ?? 0);
    $ano      = intval($body['ano'] ?? 0);
    if ($colab_id <= 0 || $mes < 1 || $mes > 12 || $ano < 2000) retornar_json(false, 'Dados inválidos');

    // Verifica se já existe
    $chk = $conn->prepare("SELECT id FROM rh_ponto_periodo WHERE colaborador_id=? AND mes=? AND ano=?");
    $chk->bind_param('iii', $colab_id, $mes, $ano); $chk->execute(); $chk->store_result();
    if ($chk->num_rows > 0) { $chk->close(); fechar_conexao($conn); retornar_json(false, 'Período já existe para este colaborador'); }
    $chk->close();

    $stmt = $conn->prepare("INSERT INTO rh_ponto_periodo (colaborador_id, mes, ano) VALUES (?,?,?)");
    $stmt->bind_param('iii', $colab_id, $mes, $ano);
    if (!$stmt->execute()) { $stmt->close(); fechar_conexao($conn); retornar_json(false, 'Erro ao criar período'); }
    $novo_id = $conn->insert_id;
    $stmt->close();

    // Pré-preenche dias úteis do mês com tipo 'normal' (sem horários)
    _gerar_dias_mes($conn, $novo_id, $colab_id, $mes, $ano);

    fechar_conexao($conn);
    retornar_json(true, 'Período criado', ['id' => $novo_id]);
}

if ($acao === 'fechar_periodo' && $metodo === 'POST') {
    $id = intval($_GET['id'] ?? $body['id'] ?? 0);
    if ($id <= 0) retornar_json(false, 'ID inválido');

    // Recalcular totais antes de fechar
    _recalcular_totais($conn, $id);

    $stmt = $conn->prepare("UPDATE rh_ponto_periodo SET status='fechado' WHERE id=?");
    $stmt->bind_param('i', $id); $stmt->execute(); $stmt->close();
    fechar_conexao($conn);
    retornar_json(true, 'Período fechado');
}

if ($acao === 'reabrir_periodo' && $metodo === 'POST') {
    $id = intval($_GET['id'] ?? $body['id'] ?? 0);
    if ($id <= 0) retornar_json(false, 'ID inválido');

    $stmt = $conn->prepare("UPDATE rh_ponto_periodo SET status='aberto' WHERE id=?");
    $stmt->bind_param('i', $id); $stmt->execute(); $stmt->close();
    fechar_conexao($conn);
    retornar_json(true, 'Período reaberto');
}

if ($acao === 'excluir_periodo' && $metodo === 'DELETE') {
    $body2 = json_decode(file_get_contents('php://input'), true) ?? [];
    $id    = intval($body2['id'] ?? $_GET['id'] ?? 0);
    if ($id <= 0) retornar_json(false, 'ID inválido');

    $stmt = $conn->prepare("DELETE FROM rh_ponto_periodo WHERE id=?");
    $stmt->bind_param('i', $id);
    $ok = $stmt->execute(); $stmt->close(); fechar_conexao($conn);
    retornar_json($ok, $ok ? 'Período excluído' : 'Erro ao excluir');
}

// ── LANÇAMENTOS ───────────────────────────────────────────────────────────────

if ($acao === 'listar_lancamentos') {
    $periodo_id = intval($_GET['periodo_id'] ?? 0);
    if ($periodo_id <= 0) retornar_json(false, 'periodo_id obrigatório');

    $stmt = $conn->prepare(
        "SELECT l.*,
                TIME_FORMAT(l.hora_entrada, '%H:%i')        as he,
                TIME_FORMAT(l.hora_almoco_saida, '%H:%i')   as has,
                TIME_FORMAT(l.hora_almoco_retorno, '%H:%i') as har,
                TIME_FORMAT(l.hora_saida, '%H:%i')          as hs,
                DATE_FORMAT(l.data, '%d/%m/%Y')             as data_fmt,
                DAYNAME(l.data)                             as dia_semana
         FROM rh_ponto_lancamento l
         WHERE l.periodo_id = ?
         ORDER BY l.data ASC"
    );
    $stmt->bind_param('i', $periodo_id);
    $stmt->execute();
    $list = [];
    $res  = $stmt->get_result();
    while ($r = $res->fetch_assoc()) $list[] = $r;
    $stmt->close(); fechar_conexao($conn);
    retornar_json(true, 'OK', $list);
}

if ($acao === 'salvar_lancamento' && $metodo === 'POST') {
    $periodo_id    = intval($body['periodo_id'] ?? 0);
    $colab_id      = intval($body['colaborador_id'] ?? 0);
    $data          = $body['data'] ?? '';
    $tipo_dia      = $body['tipo_dia'] ?? 'normal';
    $he            = _hora_valida($body['hora_entrada']        ?? '');
    $has           = _hora_valida($body['hora_almoco_saida']   ?? '');
    $har           = _hora_valida($body['hora_almoco_retorno'] ?? '');
    $hs            = _hora_valida($body['hora_saida']          ?? '');
    $obs           = trim($body['observacoes'] ?? '');

    if ($periodo_id <= 0 || $colab_id <= 0 || empty($data)) retornar_json(false, 'Dados obrigatórios incompletos');

    // Buscar escala para calcular
    $escala = _buscar_escala($conn, $colab_id);
    $calc   = _calcular_minutos($he, $has, $har, $hs, $tipo_dia, $escala);

    // Verificar se já existe lançamento para esta data/período (UPSERT)
    $existe = $conn->prepare("SELECT id FROM rh_ponto_lancamento WHERE periodo_id=? AND data=?");
    $existe->bind_param('is', $periodo_id, $data); $existe->execute();
    $existe->store_result();
    $is_update = $existe->num_rows > 0;
    $existe->close();

    if ($is_update) {
        $stmt = $conn->prepare(
            "UPDATE rh_ponto_lancamento SET
             hora_entrada=?,hora_almoco_saida=?,hora_almoco_retorno=?,hora_saida=?,
             tipo_dia=?,horas_trabalhadas_min=?,horas_extras_min=?,atraso_min=?,observacoes=?
             WHERE periodo_id=? AND data=?"
        );
        $stmt->bind_param('sssssiiisis',
            $he,$has,$har,$hs,$tipo_dia,
            $calc['trabalhadas'],$calc['extras'],$calc['atraso'],$obs,
            $periodo_id,$data
        );
    } else {
        $stmt = $conn->prepare(
            "INSERT INTO rh_ponto_lancamento
             (periodo_id,colaborador_id,data,hora_entrada,hora_almoco_saida,hora_almoco_retorno,hora_saida,
              tipo_dia,horas_trabalhadas_min,horas_extras_min,atraso_min,observacoes)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?)"
        );
        $stmt->bind_param('iissssssiiis',
            $periodo_id,$colab_id,$data,$he,$has,$har,$hs,
            $tipo_dia,$calc['trabalhadas'],$calc['extras'],$calc['atraso'],$obs
        );
    }

    if (!$stmt->execute()) { $stmt->close(); fechar_conexao($conn); retornar_json(false, 'Erro ao salvar lançamento: ' . $conn->error); }
    $stmt->close();

    _recalcular_totais($conn, $periodo_id);
    fechar_conexao($conn);
    retornar_json(true, 'Lançamento salvo', $calc);
}

if ($acao === 'excluir_lancamento' && $metodo === 'DELETE') {
    $body2      = json_decode(file_get_contents('php://input'), true) ?? [];
    $id         = intval($body2['id'] ?? $_GET['id'] ?? 0);
    if ($id <= 0) retornar_json(false, 'ID inválido');

    // Pega periodo_id antes de excluir
    $p = $conn->prepare("SELECT periodo_id FROM rh_ponto_lancamento WHERE id=?");
    $p->bind_param('i',$id); $p->execute();
    $pr = $p->get_result()->fetch_assoc(); $p->close();

    $stmt = $conn->prepare("DELETE FROM rh_ponto_lancamento WHERE id=?");
    $stmt->bind_param('i',$id); $ok = $stmt->execute(); $stmt->close();

    if ($ok && $pr) _recalcular_totais($conn, $pr['periodo_id']);
    fechar_conexao($conn);
    retornar_json($ok, $ok ? 'Lançamento excluído' : 'Erro ao excluir');
}

fechar_conexao($conn);
retornar_json(false, 'Ação não reconhecida');

// ── HELPERS ───────────────────────────────────────────────────────────────────

function _hora_valida(string $h): ?string {
    if ($h === '' || $h === null) return null;
    return preg_match('/^\d{2}:\d{2}$/', $h) ? $h . ':00' : (preg_match('/^\d{2}:\d{2}:\d{2}$/', $h) ? $h : null);
}

function _hora_em_minutos(?string $h): int {
    if (!$h) return 0;
    [$hh, $mm] = explode(':', $h);
    return intval($hh) * 60 + intval($mm);
}

function _buscar_escala($conn, int $colab_id): ?array {
    $stmt = $conn->prepare("SELECT * FROM rh_escala WHERE colaborador_id=? AND ativo=1 ORDER BY id ASC LIMIT 1");
    $stmt->bind_param('i', $colab_id); $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc(); $stmt->close();
    return $row;
}

function _calcular_minutos(?string $he, ?string $has, ?string $har, ?string $hs, string $tipo_dia, ?array $escala): array {
    $resultado = ['trabalhadas' => 0, 'extras' => 0, 'atraso' => 0];

    // Dias sem trabalho efetivo — zera tudo
    if (in_array($tipo_dia, ['folga','falta','feriado','afastamento'])) return $resultado;

    // Tipo horas_extras: o colaborador trabalhou em dia de folga/alternado
    // Trata igual a 'normal' mas garante que TUDO seja contado como extra
    $is_horas_extras = ($tipo_dia === 'horas_extras');

    if (!$he || !$hs) return $resultado;

    $mHe  = _hora_em_minutos($he);
    $mHs  = _hora_em_minutos($hs);
    $mHas = _hora_em_minutos($has ?: '12:00');
    $mHar = _hora_em_minutos($har ?: $has ?: '13:00');

    $intervalo   = max(0, $mHar - $mHas);
    $trabalhadas = max(0, ($mHs - $mHe) - $intervalo);
    $resultado['trabalhadas'] = $trabalhadas;

    // Se tipo = horas_extras, tudo que trabalhou é extra (sem carga a descontar)
    if ($is_horas_extras) {
        $resultado['extras'] = $trabalhadas;
        return $resultado;
    }

    // Para escalas com controle de jornada (inclui alternada)
    if ($escala && in_array($escala['tipo'], ['controle_jornada','alternada'])) {
        $carga      = $escala['carga_horaria_diaria_min'] ?? 480;
        $tolerancia = $escala['tolerancia_minutos'] ?? 10;
        $mEsperado  = _hora_em_minutos($escala['hora_entrada'] ?? '08:00');

        // Horas extras: trabalhou além da carga + tolerância
        if ($trabalhadas > ($carga + $tolerancia)) {
            $resultado['extras'] = $trabalhadas - $carga;
        }
        // Atraso: entrou depois do esperado + tolerância
        if ($mHe > ($mEsperado + $tolerancia)) {
            $resultado['atraso'] = $mHe - $mEsperado;
        }
    }

    return $resultado;
}

function _recalcular_totais($conn, int $periodo_id): void {
    $res = $conn->query(
        "SELECT
            SUM(horas_trabalhadas_min)  as total_trab,
            SUM(horas_extras_min)       as total_ext,
            SUM(atraso_min)             as total_atr,
            SUM(tipo_dia = 'falta')     as total_falt,
            SUM(tipo_dia = 'folga')     as total_folg
         FROM rh_ponto_lancamento WHERE periodo_id = $periodo_id"
    );
    $t = $res->fetch_assoc();
    $stmt = $conn->prepare(
        "UPDATE rh_ponto_periodo SET
         total_horas_trabalhadas_min=?, total_horas_extras_min=?,
         total_atraso_min=?, total_faltas=?, total_folgas=?
         WHERE id=?"
    );
    $v = [intval($t['total_trab']), intval($t['total_ext']), intval($t['total_atr']), intval($t['total_falt']), intval($t['total_folg']), $periodo_id];
    $stmt->bind_param('iiiiii', ...$v);
    $stmt->execute(); $stmt->close();
}

function _gerar_dias_mes($conn, int $periodo_id, int $colab_id, int $mes, int $ano): void {
    $dias   = cal_days_in_month(CAL_GREGORIAN, $mes, $ano);
    $escala = _buscar_escala($conn, $colab_id);

    // Mapa de dia da semana PHP (0=Dom..6=Sab) para chaves do sistema
    $mapDia = [0=>'dom',1=>'seg',2=>'ter',3=>'qua',4=>'qui',5=>'sex',6=>'sab'];

    // Dias fixos de trabalho (escala normal/controle_jornada)
    $diasTrabalho = [];
    if ($escala && !empty($escala['dias_trabalho'])) {
        $diasTrabalho = json_decode($escala['dias_trabalho'], true) ?? [];
    }

    // Configuração de escala alternada
    $isAlternada    = $escala && ($escala['tipo'] === 'alternada' || !empty($escala['alternada_ativa']));
    $semanaA        = [];
    $semanaB        = [];
    $diaInicioTs    = null;
    $tipoFolga      = 'folga';
    if ($isAlternada) {
        $semanaA     = json_decode($escala['alternada_semana_a'] ?? '[]', true) ?? [];
        $semanaB     = json_decode($escala['alternada_semana_b'] ?? '[]', true) ?? [];
        $tipoFolga   = $escala['alternada_tipo_folga'] ?? 'folga';
        if (!empty($escala['alternada_dia_inicio'])) {
            $diaInicioTs = strtotime($escala['alternada_dia_inicio']);
        }
    }

    $stmt = $conn->prepare(
        "INSERT IGNORE INTO rh_ponto_lancamento (periodo_id, colaborador_id, data, tipo_dia)
         VALUES (?, ?, ?, ?)"
    );

    for ($d = 1; $d <= $dias; $d++) {
        $data    = sprintf('%04d-%02d-%02d', $ano, $mes, $d);
        $dataTs  = strtotime($data);
        $diaSem  = $mapDia[intval(date('w', $dataTs))]; // seg, ter, ...
        $tipoDia = 'normal';

        if ($isAlternada && !empty($semanaA) && !empty($semanaB)) {
            // Calcula qual semana (A ou B) corresponde a esta data
            // Usa segunda-feira da semana como referência
            $refTs   = $diaInicioTs ?? strtotime('monday this week', $dataTs);
            // Número de semanas desde o dia de início
            $diffSec = $dataTs - $refTs;
            $diffSem = intval(floor($diffSec / (7 * 86400)));
            // Semanas negativas: ajustar para ciclo positivo
            if ($diffSem < 0) $diffSem = (abs($diffSem) % 2 === 0) ? 0 : 1;
            $isSemanaA = ($diffSem % 2 === 0);
            $diasAtivos = $isSemanaA ? $semanaA : $semanaB;

            if (in_array($diaSem, $diasAtivos)) {
                $tipoDia = 'normal';
            } else {
                $tipoDia = $tipoFolga; // folga, falta ou feriado conforme configurado
            }
        } elseif (!empty($diasTrabalho)) {
            // Escala normal: dias não listados são folga
            $tipoDia = in_array($diaSem, $diasTrabalho) ? 'normal' : 'folga';
        }

        $stmt->bind_param('iiss', $periodo_id, $colab_id, $data, $tipoDia);
        $stmt->execute();
    }
    $stmt->close();
}
?>
