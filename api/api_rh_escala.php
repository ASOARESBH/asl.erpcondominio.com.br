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

// ── Log dedicado ao módulo RH ─────────────────────────────────────────────────
function rh_log(string $nivel, string $msg, array $ctx = []): void {
    $dir  = __DIR__ . '/../logs';
    if (!is_dir($dir)) @mkdir($dir, 0755, true);
    $file = $dir . '/recursoshumanos.txt';
    $ts   = date('Y-m-d H:i:s');
    $ctxStr = $ctx ? ' | ' . json_encode($ctx, JSON_UNESCAPED_UNICODE) : '';
    $line = "[{$ts}] [{$nivel}] {$msg}{$ctxStr}" . PHP_EOL;
    // Rotação: se > 2MB, apaga e recria
    if (file_exists($file) && filesize($file) > 2 * 1024 * 1024) {
        @unlink($file);
    }
    @file_put_contents($file, $line, FILE_APPEND | LOCK_EX);
}

if (!function_exists('retornar_json')) {
    function retornar_json($sucesso, $mensagem, $dados = null) {
        $r = ['sucesso' => $sucesso, 'mensagem' => $mensagem];
        if ($dados !== null) $r['dados'] = $dados;
        echo json_encode($r, JSON_UNESCAPED_UNICODE);
        exit;
    }
}

try { verificarAutenticacao(true, 'operador'); }
catch (Exception $e) {
    rh_log('ERRO', 'Autenticação falhou', ['msg' => $e->getMessage()]);
    retornar_json(false, 'Não autenticado');
}

$metodo = $_SERVER['REQUEST_METHOD'];
$body   = ($metodo !== 'GET') ? (json_decode(file_get_contents('php://input'), true) ?? []) : [];
$acao   = $_GET['acao'] ?? $body['acao'] ?? '';
$conn   = conectar_banco();
if (!$conn) {
    rh_log('ERRO', 'Falha ao conectar ao banco de dados');
    retornar_json(false, 'Erro ao conectar ao banco');
}

rh_log('INFO', "Requisição recebida", ['metodo' => $metodo, 'acao' => $acao, 'ip' => $_SERVER['REMOTE_ADDR'] ?? '']);

// ── LISTAR ────────────────────────────────────────────────────────────────────
if ($acao === 'listar') {
    $colab_id = intval($_GET['colaborador_id'] ?? 0);
    if ($colab_id <= 0) {
        rh_log('AVISO', 'listar: colaborador_id não informado');
        retornar_json(false, 'colaborador_id obrigatório');
    }

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
    rh_log('INFO', 'listar: OK', ['colaborador_id' => $colab_id, 'total' => count($list)]);
    retornar_json(true, 'OK', $list);
}

// ── OBTER ─────────────────────────────────────────────────────────────────────
if ($acao === 'obter') {
    $id = intval($_GET['id'] ?? 0);
    if ($id <= 0) {
        rh_log('AVISO', 'obter: ID inválido', ['id' => $_GET['id'] ?? 'vazio']);
        retornar_json(false, 'ID inválido');
    }

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
    if (!$row) {
        rh_log('AVISO', 'obter: Escala não encontrada', ['id' => $id]);
        retornar_json(false, 'Escala não encontrada');
    }
    retornar_json(true, 'OK', $row);
}

// ── CRIAR ─────────────────────────────────────────────────────────────────────
if ($acao === 'criar' && $metodo === 'POST') {
    rh_log('INFO', 'criar: iniciando', ['body_keys' => array_keys($body)]);

    $d = _extrair_escala($body);

    if ($d['colaborador_id'] <= 0) {
        rh_log('AVISO', 'criar: colaborador_id ausente', $d);
        retornar_json(false, 'colaborador_id obrigatório');
    }

    // Validações por tipo de jornada
    $validacao = _validar_regras_jornada($d);
    if ($validacao !== true) {
        rh_log('AVISO', 'criar: validação falhou', ['erro' => $validacao, 'tipo' => $d['tipo']]);
        retornar_json(false, $validacao);
    }

    $dias_json = json_encode($d['dias_trabalho'] ?? ['seg','ter','qua','qui','sex']);
    $semA_json = $d['alternada_semana_a'] ? json_encode($d['alternada_semana_a']) : null;
    $semB_json = $d['alternada_semana_b'] ? json_encode($d['alternada_semana_b']) : null;

    // Verificar se as colunas extras existem (compatibilidade)
    $temColunasExtras = _verificar_colunas_extras($conn);

    if ($temColunasExtras) {
        $stmt = $conn->prepare(
            "INSERT INTO rh_escala
             (colaborador_id, nome_escala, tipo, carga_horaria_diaria_min, dias_trabalho,
              hora_entrada, hora_almoco_saida, hora_almoco_retorno, hora_saida,
              tolerancia_minutos, intervalo_almoco_min,
              alternada_ativa, alternada_dia_inicio, alternada_semana_a, alternada_semana_b, alternada_tipo_folga,
              carga_horaria_mensal_min, descanso_interjornada_min, regime_12x36)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
        );
        // 19 parâmetros: i s s i s  s s s s  i i  i s s s s  i i i
        $stmt->bind_param('issississsiisssssiiii',
            $d['colaborador_id'],
            $d['nome_escala'],
            $d['tipo'],
            $d['carga_horaria_diaria_min'],
            $dias_json,
            $d['hora_entrada'],
            $d['hora_almoco_saida'],
            $d['hora_almoco_retorno'],
            $d['hora_saida'],
            $d['tolerancia_minutos'],
            $d['intervalo_almoco_min'],
            $d['alternada_ativa'],
            $d['alternada_dia_inicio'],
            $semA_json,
            $semB_json,
            $d['alternada_tipo_folga'],
            $d['carga_horaria_mensal_min'],
            $d['descanso_interjornada_min'],
            $d['regime_12x36']
        );
    } else {
        // Fallback: colunas antigas apenas (sem as novas)
        $stmt = $conn->prepare(
            "INSERT INTO rh_escala
             (colaborador_id, nome_escala, tipo, carga_horaria_diaria_min, dias_trabalho,
              hora_entrada, hora_almoco_saida, hora_almoco_retorno, hora_saida,
              tolerancia_minutos, intervalo_almoco_min,
              alternada_ativa, alternada_dia_inicio, alternada_semana_a, alternada_semana_b, alternada_tipo_folga)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
        );
        // 16 parâmetros: i s s i s  s s s s  i i  i s s s s
        $stmt->bind_param('issississsiissss',
            $d['colaborador_id'],
            $d['nome_escala'],
            $d['tipo'],
            $d['carga_horaria_diaria_min'],
            $dias_json,
            $d['hora_entrada'],
            $d['hora_almoco_saida'],
            $d['hora_almoco_retorno'],
            $d['hora_saida'],
            $d['tolerancia_minutos'],
            $d['intervalo_almoco_min'],
            $d['alternada_ativa'],
            $d['alternada_dia_inicio'],
            $semA_json,
            $semB_json,
            $d['alternada_tipo_folga']
        );
    }

    if (!$stmt->execute()) {
        $erro = $conn->error;
        $stmt->close(); fechar_conexao($conn);
        rh_log('ERRO', 'criar: execute falhou', ['mysql_error' => $erro, 'tipo' => $d['tipo']]);
        retornar_json(false, 'Erro ao criar escala: ' . $erro);
    }
    $novo_id = $conn->insert_id;
    $stmt->close(); fechar_conexao($conn);
    rh_log('INFO', 'criar: escala criada', ['id' => $novo_id, 'tipo' => $d['tipo'], 'colaborador_id' => $d['colaborador_id']]);
    retornar_json(true, 'Escala criada com sucesso', ['id' => $novo_id]);
}

// ── ATUALIZAR ─────────────────────────────────────────────────────────────────
if ($acao === 'atualizar' && $metodo === 'POST') {
    $id = intval($_GET['id'] ?? $body['id'] ?? 0);
    if ($id <= 0) {
        rh_log('AVISO', 'atualizar: ID inválido', ['id' => $_GET['id'] ?? $body['id'] ?? 'vazio']);
        retornar_json(false, 'ID inválido');
    }

    $d = _extrair_escala($body);

    $validacao = _validar_regras_jornada($d);
    if ($validacao !== true) {
        rh_log('AVISO', 'atualizar: validação falhou', ['erro' => $validacao, 'tipo' => $d['tipo']]);
        retornar_json(false, $validacao);
    }

    $dias_json2 = json_encode($d['dias_trabalho'] ?? ['seg','ter','qua','qui','sex']);
    $semA_json2 = $d['alternada_semana_a'] ? json_encode($d['alternada_semana_a']) : null;
    $semB_json2 = $d['alternada_semana_b'] ? json_encode($d['alternada_semana_b']) : null;

    $temColunasExtras2 = _verificar_colunas_extras($conn);

    if ($temColunasExtras2) {
        $stmt = $conn->prepare(
            "UPDATE rh_escala SET
             nome_escala=?, tipo=?, carga_horaria_diaria_min=?, dias_trabalho=?,
             hora_entrada=?, hora_almoco_saida=?, hora_almoco_retorno=?, hora_saida=?,
             tolerancia_minutos=?, intervalo_almoco_min=?,
             alternada_ativa=?, alternada_dia_inicio=?, alternada_semana_a=?, alternada_semana_b=?, alternada_tipo_folga=?,
             carga_horaria_mensal_min=?, descanso_interjornada_min=?, regime_12x36=?
             WHERE id=?"
        );
        // 19 parâmetros: s s i s  s s s s  i i  i s s s s  i i i  i
        $stmt->bind_param('ssississsiisssssiiii',
            $d['nome_escala'],
            $d['tipo'],
            $d['carga_horaria_diaria_min'],
            $dias_json2,
            $d['hora_entrada'],
            $d['hora_almoco_saida'],
            $d['hora_almoco_retorno'],
            $d['hora_saida'],
            $d['tolerancia_minutos'],
            $d['intervalo_almoco_min'],
            $d['alternada_ativa'],
            $d['alternada_dia_inicio'],
            $semA_json2,
            $semB_json2,
            $d['alternada_tipo_folga'],
            $d['carga_horaria_mensal_min'],
            $d['descanso_interjornada_min'],
            $d['regime_12x36'],
            $id
        );
    } else {
        $stmt = $conn->prepare(
            "UPDATE rh_escala SET
             nome_escala=?, tipo=?, carga_horaria_diaria_min=?, dias_trabalho=?,
             hora_entrada=?, hora_almoco_saida=?, hora_almoco_retorno=?, hora_saida=?,
             tolerancia_minutos=?, intervalo_almoco_min=?,
             alternada_ativa=?, alternada_dia_inicio=?, alternada_semana_a=?, alternada_semana_b=?, alternada_tipo_folga=?
             WHERE id=?"
        );
        // 16 parâmetros: s s i s  s s s s  i i  i s s s s  i
        $stmt->bind_param('ssississsiissssi',
            $d['nome_escala'],
            $d['tipo'],
            $d['carga_horaria_diaria_min'],
            $dias_json2,
            $d['hora_entrada'],
            $d['hora_almoco_saida'],
            $d['hora_almoco_retorno'],
            $d['hora_saida'],
            $d['tolerancia_minutos'],
            $d['intervalo_almoco_min'],
            $d['alternada_ativa'],
            $d['alternada_dia_inicio'],
            $semA_json2,
            $semB_json2,
            $d['alternada_tipo_folga'],
            $id
        );
    }

    if (!$stmt->execute()) {
        $erro = $conn->error;
        $stmt->close(); fechar_conexao($conn);
        rh_log('ERRO', 'atualizar: execute falhou', ['mysql_error' => $erro, 'id' => $id]);
        retornar_json(false, 'Erro ao atualizar escala: ' . $erro);
    }
    $stmt->close(); fechar_conexao($conn);
    rh_log('INFO', 'atualizar: escala atualizada', ['id' => $id, 'tipo' => $d['tipo']]);
    retornar_json(true, 'Escala atualizada com sucesso');
}

// ── EXCLUIR (soft delete) ─────────────────────────────────────────────────────
if ($metodo === 'DELETE') {
    $body2 = json_decode(file_get_contents('php://input'), true) ?? [];
    $id    = intval($body2['id'] ?? $_GET['id'] ?? 0);
    if ($id <= 0) {
        rh_log('AVISO', 'excluir: ID inválido');
        retornar_json(false, 'ID inválido');
    }

    $stmt = $conn->prepare("UPDATE rh_escala SET ativo=0 WHERE id=?");
    $stmt->bind_param('i', $id);
    $ok = $stmt->execute(); $stmt->close(); fechar_conexao($conn);
    rh_log($ok ? 'INFO' : 'ERRO', 'excluir: ' . ($ok ? 'OK' : 'falhou'), ['id' => $id]);
    retornar_json($ok, $ok ? 'Escala removida' : 'Erro ao remover');
}

fechar_conexao($conn);
rh_log('AVISO', 'Ação não reconhecida', ['acao' => $acao, 'metodo' => $metodo]);
retornar_json(false, 'Ação não reconhecida');

// ── HELPERS ───────────────────────────────────────────────────────────────────

/**
 * Verifica se as colunas extras (v2) existem na tabela rh_escala.
 */
function _verificar_colunas_extras(mysqli $conn): bool {
    $res = $conn->query("SHOW COLUMNS FROM rh_escala LIKE 'regime_12x36'");
    return $res && $res->num_rows > 0;
}

/**
 * Valida as regras de negócio por tipo de jornada.
 * Retorna true se válido, ou string com mensagem de erro.
 */
function _validar_regras_jornada(array $d) {
    $tipo = $d['tipo'];

    // ── Escala Alternada (12x alternado) ──────────────────────────────────────
    // Regra: o funcionário trabalha 12h (ou a carga definida mensalmente).
    // O sistema usa a carga mensal para calcular o total esperado no mês.
    if ($tipo === 'alternada') {
        if (empty($d['alternada_dia_inicio'])) {
            return 'Escala alternada: informe a data de início da Semana A.';
        }
        if (empty($d['alternada_semana_a']) || empty($d['alternada_semana_b'])) {
            return 'Escala alternada: selecione pelo menos um dia em cada semana (A e B).';
        }
        // Carga diária mínima para 12x: 720 min (12h)
        if ($d['carga_horaria_diaria_min'] < 720) {
            return 'Escala alternada 12x: a carga diária deve ser de no mínimo 12 horas (720 min).';
        }
        // Descanso mínimo entre jornadas: 36h (2160 min) para regime 12x36
        if ($d['regime_12x36'] && $d['descanso_interjornada_min'] < 2160) {
            return 'Regime 12x36: o descanso entre jornadas deve ser de no mínimo 36 horas.';
        }
    }

    // ── Controle de Jornada ───────────────────────────────────────────────────
    // Regra: o sistema controla rigorosamente dia da semana, hora e descanso entre jornadas.
    if ($tipo === 'controle_jornada') {
        if (empty($d['hora_entrada']) || empty($d['hora_saida'])) {
            return 'Controle de jornada: hora de entrada e saída são obrigatórias.';
        }
        if (empty($d['dias_trabalho']) || count($d['dias_trabalho']) === 0) {
            return 'Controle de jornada: selecione pelo menos um dia de trabalho.';
        }
        // Descanso mínimo entre jornadas: 11h (660 min) conforme CLT
        if ($d['descanso_interjornada_min'] > 0 && $d['descanso_interjornada_min'] < 660) {
            return 'Controle de jornada: o descanso entre jornadas deve ser de no mínimo 11 horas (CLT).';
        }
    }

    return true;
}

/**
 * Extrai e normaliza os dados da escala do body da requisição.
 */
function _extrair_escala(array $b): array {
    $n = fn($k, $def=null) => isset($b[$k]) && $b[$k] !== '' ? $b[$k] : $def;

    $tipo        = $n('tipo', 'livre');
    $isAlternada = ($tipo === 'alternada');
    $isControle  = ($tipo === 'controle_jornada');
    $is12x36     = (bool)$n('regime_12x36', false);

    // Semana A e B podem vir como array ou JSON string
    $semA = $n('alternada_semana_a', null);
    $semB = $n('alternada_semana_b', null);
    if (is_string($semA)) $semA = json_decode($semA, true);
    if (is_string($semB)) $semB = json_decode($semB, true);

    // Carga diária em minutos
    $cargaDiaria = intval($n('carga_horaria_diaria_min', 480));

    // Carga mensal: para 12x alternado, calcula automaticamente se não informada
    // Regra: em 12x36, o funcionário trabalha ~15 dias/mês × carga diária
    $cargaMensal = intval($n('carga_horaria_mensal_min', 0));
    if ($cargaMensal <= 0 && $isAlternada) {
        $cargaMensal = $cargaDiaria * 15; // estimativa padrão 12x36
    }

    // Descanso interjornada padrão por tipo
    $descanso = intval($n('descanso_interjornada_min', 0));
    if ($descanso <= 0) {
        if ($isAlternada && $is12x36) $descanso = 2160; // 36h
        elseif ($isControle)          $descanso = 660;  // 11h (CLT)
    }

    return [
        'colaborador_id'           => intval($n('colaborador_id', 0)),
        'nome_escala'              => trim($n('nome_escala', 'Principal')),
        'tipo'                     => $tipo,
        'carga_horaria_diaria_min' => $cargaDiaria,
        'dias_trabalho'            => $n('dias_trabalho', ['seg','ter','qua','qui','sex']),
        'hora_entrada'             => $n('hora_entrada', '08:00:00'),
        'hora_almoco_saida'        => $n('hora_almoco_saida', '12:00:00'),
        'hora_almoco_retorno'      => $n('hora_almoco_retorno', '13:00:00'),
        'hora_saida'               => $n('hora_saida', '17:00:00'),
        'tolerancia_minutos'       => intval($n('tolerancia_minutos', 10)),
        'intervalo_almoco_min'     => intval($n('intervalo_almoco_min', 60)),
        // Escala alternada
        'alternada_ativa'          => $isAlternada ? 1 : 0,
        'alternada_dia_inicio'     => $isAlternada ? $n('alternada_dia_inicio', null) : null,
        'alternada_semana_a'       => $isAlternada ? $semA : null,
        'alternada_semana_b'       => $isAlternada ? $semB : null,
        'alternada_tipo_folga'     => $isAlternada ? $n('alternada_tipo_folga', 'folga') : 'folga',
        // Campos v2 (novas colunas)
        'carga_horaria_mensal_min' => $cargaMensal,
        'descanso_interjornada_min'=> $descanso,
        'regime_12x36'             => $is12x36 ? 1 : 0,
    ];
}
?>
