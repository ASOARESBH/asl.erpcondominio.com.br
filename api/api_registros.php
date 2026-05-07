<?php
// =====================================================
// API PARA REGISTROS DE ACESSO v2
// Correções: bind_param tipos corretos, compatibilidade
// com tabela sem colunas visitante_id/documento_visitante,
// log de debug em logs/registro.txt
// =====================================================

session_start();
ob_start();

require_once 'config.php';
require_once 'auth_helper.php';

ob_end_clean();
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-cache, must-revalidate');

// ===== LOG DE DEBUG =====
function log_registro($msg, $dados = null) {
    $dir = __DIR__ . '/../logs';
    if (!is_dir($dir)) @mkdir($dir, 0755, true);
    $linha = '[' . date('Y-m-d H:i:s') . '] ' . $msg;
    if ($dados !== null) $linha .= ' | ' . json_encode($dados, JSON_UNESCAPED_UNICODE);
    @file_put_contents($dir . '/registro.txt', $linha . PHP_EOL, FILE_APPEND);
}

// ===== RETORNO JSON =====
if (!function_exists('retornar_json')) {
    function retornar_json($sucesso, $mensagem, $dados = null) {
        $resposta = ['sucesso' => $sucesso, 'mensagem' => $mensagem];
        if ($dados !== null) $resposta['dados'] = $dados;
        echo json_encode($resposta, JSON_UNESCAPED_UNICODE);
        exit;
    }
}

$metodo  = $_SERVER['REQUEST_METHOD'];
$conexao = conectar_banco();

// ===== VERIFICAR COLUNAS EXTRAS (visitante_id, documento_visitante) =====
// Detecta se a migração migration_visitantes_v2.sql já foi executada
function _tem_coluna($conexao, $tabela, $coluna) {
    $r = $conexao->query("SHOW COLUMNS FROM `$tabela` LIKE '$coluna'");
    return $r && $r->num_rows > 0;
}
$tem_visitante_id    = _tem_coluna($conexao, 'registros_acesso', 'visitante_id');
$tem_documento_visit = _tem_coluna($conexao, 'registros_acesso', 'documento_visitante');

// ========== LISTAR REGISTROS ==========
if ($metodo === 'GET') {
    $limite = intval($_GET['limite'] ?? 100);

    $sql = "SELECT r.id,
            DATE_FORMAT(r.data_hora, '%d/%m/%Y %H:%i:%s') AS data_hora_formatada,
            r.data_hora, r.placa, r.modelo, r.cor, r.tag, r.tipo,
            r.nome_visitante, r.unidade_destino, r.dias_permanencia,
            r.status, r.liberado, r.observacao,
            m.nome AS morador_nome, m.unidade AS morador_unidade
            FROM registros_acesso r
            LEFT JOIN moradores m ON r.morador_id = m.id
            ORDER BY r.data_hora DESC
            LIMIT ?";

    $stmt = $conexao->prepare($sql);
    if (!$stmt) {
        log_registro('ERRO prepare GET', ['erro' => $conexao->error]);
        retornar_json(false, 'Erro ao preparar consulta: ' . $conexao->error);
    }
    $stmt->bind_param('i', $limite);
    $stmt->execute();
    $resultado = $stmt->get_result();

    $registros = [];
    while ($row = $resultado->fetch_assoc()) {
        $registros[] = $row;
    }
    $stmt->close();
    retornar_json(true, 'Registros listados com sucesso', $registros);
}

// ========== CRIAR REGISTRO MANUAL ==========
if ($metodo === 'POST') {
    $dados = json_decode(file_get_contents('php://input'), true);

    log_registro('POST recebido', $dados);

    $data_hora        = $dados['data_hora']        ?? date('Y-m-d H:i:s');
    $placa            = strtoupper(trim($dados['placa']    ?? ''));
    $modelo           = trim($dados['modelo']           ?? '');
    $cor              = trim($dados['cor']              ?? '');
    $tipo             = trim($dados['tipo']             ?? '');
    $unidade_destino  = trim($dados['unidade_destino']  ?? '');
    $dias_permanencia = intval($dados['dias_permanencia'] ?? 0);
    $nome_visitante   = trim($dados['nome_visitante']   ?? '');
    $observacao       = trim($dados['observacao']       ?? '');

    // Validações
    if (empty($placa) || empty($tipo)) {
        log_registro('ERRO validacao', ['placa' => $placa, 'tipo' => $tipo]);
        retornar_json(false, 'Placa e tipo são obrigatórios');
    }

    if (!in_array($tipo, ['Morador', 'Visitante', 'Prestador'])) {
        log_registro('ERRO tipo invalido', ['tipo' => $tipo]);
        retornar_json(false, 'Tipo inválido: ' . $tipo);
    }

    $morador_id   = isset($dados['morador_id'])   && $dados['morador_id']   ? intval($dados['morador_id'])   : null;
    $visitante_id = isset($dados['visitante_id']) && $dados['visitante_id'] ? intval($dados['visitante_id']) : null;
    $documento    = trim($dados['documento'] ?? '');
    $tag          = null;
    $liberado     = 0;
    $status       = '';

    // Se for morador, buscar no banco pela placa
    if ($tipo === 'Morador') {
        $stmt = $conexao->prepare(
            "SELECT v.tag, v.morador_id, m.nome, m.unidade
             FROM veiculos v
             INNER JOIN moradores m ON v.morador_id = m.id
             WHERE v.placa = ? AND v.ativo = 1"
        );
        if (!$stmt) {
            log_registro('ERRO prepare busca veiculo', ['erro' => $conexao->error]);
            retornar_json(false, 'Erro interno ao buscar veículo: ' . $conexao->error);
        }
        $stmt->bind_param('s', $placa);
        $stmt->execute();
        $resultado = $stmt->get_result();

        if ($resultado->num_rows > 0) {
            $veiculo         = $resultado->fetch_assoc();
            $morador_id      = intval($veiculo['morador_id']);
            $tag             = $veiculo['tag'];
            $liberado        = 1;
            $status          = '✅ Acesso liberado - ' . $veiculo['nome'];
            $unidade_destino = $veiculo['unidade'];
        } else {
            $status   = '❌ Acesso negado - Placa não cadastrada';
            $liberado = 0;
        }
        $stmt->close();
    } else {
        // Visitante ou Prestador
        $status   = '🟨 Registro manual - ' . $tipo;
        $liberado = 1;
    }

    // ── Montar INSERT dinamicamente conforme colunas disponíveis ──────────────
    // Colunas base (sempre presentes)
    $cols   = 'data_hora, placa, modelo, cor, tag, tipo, morador_id, nome_visitante, unidade_destino, dias_permanencia, status, liberado, observacao';
    $marks  = '?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?';
    $types  = 'ssssssissisisi';
    //          s=data_hora, s=placa, s=modelo, s=cor, s=tag, s=tipo,
    //          i=morador_id, s=nome_visitante, s=unidade_destino,
    //          i=dias_permanencia, s=status, i=liberado, s=observacao
    $params = [
        &$data_hora, &$placa, &$modelo, &$cor, &$tag, &$tipo,
        &$morador_id, &$nome_visitante, &$unidade_destino,
        &$dias_permanencia, &$status, &$liberado, &$observacao
    ];

    // Adicionar visitante_id se a coluna existir
    if ($tem_visitante_id) {
        $cols   .= ', visitante_id';
        $marks  .= ', ?';
        $types  .= 'i';
        $params[] = &$visitante_id;
    }

    // Adicionar documento_visitante se a coluna existir
    if ($tem_documento_visit) {
        $cols   .= ', documento_visitante';
        $marks  .= ', ?';
        $types  .= 's';
        $params[] = &$documento;
    }

    $sql  = "INSERT INTO registros_acesso ($cols) VALUES ($marks)";
    $stmt = $conexao->prepare($sql);

    if (!$stmt) {
        log_registro('ERRO prepare INSERT', ['sql' => $sql, 'erro' => $conexao->error]);
        retornar_json(false, 'Erro ao preparar inserção: ' . $conexao->error);
    }

    // bind_param dinâmico
    $bind_args = array_merge([&$types], $params);
    call_user_func_array([$stmt, 'bind_param'], $bind_args);

    log_registro('INSERT executando', [
        'sql'    => $sql,
        'types'  => $types,
        'placa'  => $placa,
        'tipo'   => $tipo,
        'morador_id' => $morador_id,
        'visitante_id' => $visitante_id,
        'tem_visitante_id' => $tem_visitante_id,
        'tem_documento_visit' => $tem_documento_visit
    ]);

    if ($stmt->execute()) {
        $id_inserido = $conexao->insert_id;
        log_registro('INSERT OK', ['id' => $id_inserido, 'status' => $status]);
        registrar_log('REGISTRO_CRIADO', "Registro manual criado: $placa ($tipo)");
        retornar_json(true, $status, ['id' => $id_inserido, 'liberado' => $liberado, 'status' => $status]);
    } else {
        log_registro('ERRO execute INSERT', ['erro' => $stmt->error, 'errno' => $stmt->errno]);
        retornar_json(false, 'Erro ao criar registro: ' . $stmt->error);
    }

    $stmt->close();
}

// ========== ATUALIZAR REGISTRO ==========
if ($metodo === 'PUT') {
    $dados = json_decode(file_get_contents('php://input'), true);

    $id         = intval($dados['id'] ?? 0);
    $observacao = trim($dados['observacao'] ?? '');
    $status     = trim($dados['status']     ?? '');

    if ($id <= 0) {
        retornar_json(false, 'ID inválido');
    }

    $stmt = $conexao->prepare('UPDATE registros_acesso SET observacao=?, status=? WHERE id=?');
    if (!$stmt) {
        retornar_json(false, 'Erro ao preparar atualização: ' . $conexao->error);
    }
    $stmt->bind_param('ssi', $observacao, $status, $id);

    if ($stmt->execute()) {
        registrar_log('REGISTRO_ATUALIZADO', "Registro atualizado: ID $id");
        retornar_json(true, 'Registro atualizado com sucesso');
    } else {
        retornar_json(false, 'Erro ao atualizar registro: ' . $stmt->error);
    }
    $stmt->close();
}

// ========== EXCLUIR REGISTRO ==========
if ($metodo === 'DELETE') {
    $dados = json_decode(file_get_contents('php://input'), true);
    $id    = intval($dados['id'] ?? 0);

    if ($id <= 0) {
        retornar_json(false, 'ID inválido');
    }

    $stmt = $conexao->prepare('DELETE FROM registros_acesso WHERE id = ?');
    if (!$stmt) {
        retornar_json(false, 'Erro ao preparar exclusão: ' . $conexao->error);
    }
    $stmt->bind_param('i', $id);

    if ($stmt->execute()) {
        registrar_log('REGISTRO_EXCLUIDO', "Registro excluído: ID $id");
        retornar_json(true, 'Registro excluído com sucesso');
    } else {
        retornar_json(false, 'Erro ao excluir registro: ' . $stmt->error);
    }
    $stmt->close();
}

fechar_conexao($conexao);
