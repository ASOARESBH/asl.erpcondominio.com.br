<?php
// =====================================================
// API - CONTAS BANCÁRIAS + MOVIMENTAÇÕES + IMPORTAÇÃO OFX
// Versão: 1.0  |  Data: 2026-06-08
// =====================================================
require_once 'config.php';
require_once 'auth_helper.php';

// ─── Headers ────────────────────────────────────────
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: https://asl.erpcondominios.com.br');
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }

// ─── Helper JSON ─────────────────────────────────────
function _json($ok, $msg, $dados = null, $code = 200) {
    http_response_code($code);
    $r = ['sucesso' => $ok, 'mensagem' => $msg];
    if ($dados !== null) $r['dados'] = $dados;
    echo json_encode($r, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

// ─── Log de Debug ────────────────────────────────────
function _debug_log($msg, $dados = []) {
    $log_file = __DIR__ . '/../logs/debug_contas_bancarias.log';
    $dir = dirname($log_file);
    if (!is_dir($dir)) @mkdir($dir, 0755, true);
    $linha = date('Y-m-d H:i:s') . ' | ' . $msg;
    if (!empty($dados)) $linha .= ' | ' . json_encode($dados, JSON_UNESCAPED_UNICODE);
    @file_put_contents($log_file, $linha . PHP_EOL, FILE_APPEND | LOCK_EX);
}

$metodo = $_SERVER['REQUEST_METHOD'];
$raw_input = ($metodo !== 'GET') ? file_get_contents('php://input') : '';
$content_type = $_SERVER['CONTENT_TYPE'] ?? '';
$session_id = session_id() ?: 'sem-sessao';

_debug_log('REQUEST', [
    'method'       => $metodo,
    'content_type' => $content_type,
    'get_acao'     => $_GET['acao'] ?? '(vazio)',
    'post_acao'    => $_POST['acao'] ?? '(vazio)',
    'raw_input'    => substr($raw_input, 0, 500),
    'session_id'   => $session_id,
    'usuario_logado' => $_SESSION['usuario_logado'] ?? '(sem sessao)',
    'usuario_id'   => $_SESSION['usuario_id'] ?? '(sem sessao)',
]);

// ─── Autenticação ─────────────────────────────────────
verificarAutenticacao(true, 'operador');

$body   = [];
if ($metodo !== 'GET') {
    if ($raw_input) $body = json_decode($raw_input, true) ?? [];
    // Merge POST form-data (form-data tem prioridade sobre JSON)
    $body = array_merge($body, $_POST);
}
// acao: GET param > POST param > JSON body (suporte a Content-Type: application/json)
$acao = $_GET['acao'] ?? $_POST['acao'] ?? $body['acao'] ?? '';

_debug_log('ACAO_DETERMINADA', [
    'acao'      => $acao,
    'body_keys' => array_keys($body),
    'body_acao' => $body['acao'] ?? '(ausente)',
]);

// ─── Migration automática ─────────────────────────────
if ($acao === 'migration') {
    _executar_migration();
    exit;
}

$db = conectar_banco();
// ─── Migration automática na primeira chamada ─────────
// Garante que as tabelas existam sem precisar chamar ?acao=migration manualmente
_garantir_tabelas($db);

// =====================================================
// ROTEAMENTO
// =====================================================
switch ($acao) {

    // ── CONTAS BANCÁRIAS ──────────────────────────────
    case 'listar_contas':       _listar_contas($db); break;
    case 'obter_conta':         _obter_conta($db); break;
    case 'criar_conta':         _criar_conta($db, $body); break;
    case 'atualizar_conta':     _atualizar_conta($db, $body); break;
    case 'excluir_conta':       _excluir_conta($db, $body); break;

    // ── MOVIMENTAÇÕES ────────────────────────────────
    case 'listar_movimentacoes': _listar_movimentacoes($db); break;
    case 'criar_movimentacao':   _criar_movimentacao($db, $body); break;
    case 'atualizar_movimentacao': _atualizar_movimentacao($db, $body); break;
    case 'excluir_movimentacao': _excluir_movimentacao($db, $body); break;
    case 'conciliar':            _conciliar($db, $body); break;

    // ── IMPORTAÇÃO OFX ───────────────────────────────
    case 'preview_ofx':         _preview_ofx($db); break;
    case 'importar_ofx':        _importar_ofx($db); break;
    case 'historico_importacoes': _historico_importacoes($db); break;
    case 'ultimo_importado':    _ultimo_importado($db); break;

    // ── RELATÓRIOS / KPIs ────────────────────────────
    case 'kpis':                _kpis($db); break;
    case 'saldo_contas':        _saldo_contas($db); break;
    case 'relatorio_extrato':   _relatorio_extrato($db); break;

    // ── BANCOS BRASILEIROS ───────────────────────────
    case 'buscar_banco':        _buscar_banco($db); break;
    case 'listar_bancos':       _listar_bancos($db); break;
    case 'migration_bancos':    _migration_bancos($db); break;

    default:
        _json(false, 'Ação inválida: ' . htmlspecialchars($acao), null, 400);
}

// =====================================================
// CONTAS BANCÁRIAS
// =====================================================

function _listar_contas($db) {
    // Query resiliente: verifica se tabelas auxiliares existem antes de usar subqueries
    $tem_mov = $db->query("SHOW TABLES LIKE 'movimentacoes_bancarias'")->num_rows > 0;
    $tem_ofx = $db->query("SHOW TABLES LIKE 'historico_importacoes_ofx'")->num_rows > 0;

    $sub_mov = $tem_mov
        ? "(SELECT COUNT(*) FROM movimentacoes_bancarias mb WHERE mb.conta_id = cb.id)"
        : "0";
    $sub_ofx = $tem_ofx
        ? "(SELECT MAX(importado_em) FROM historico_importacoes_ofx hi WHERE hi.conta_id = cb.id)"
        : "NULL";

    $sql = "SELECT cb.*,
                {$sub_mov} AS total_mov,
                {$sub_ofx} AS ultima_importacao
            FROM contas_bancarias cb
            WHERE cb.ativo = 1
            ORDER BY cb.nome ASC";
    $res = $db->query($sql);
    if (!$res) _json(false, 'Erro ao listar contas: ' . $db->error);
    $rows = [];
    while ($r = $res->fetch_assoc()) {
        $r['id']            = (int)$r['id'];
        $r['saldo_atual']   = (float)$r['saldo_atual'];
        $r['saldo_inicial'] = (float)$r['saldo_inicial'];
        $r['total_mov']     = (int)($r['total_mov'] ?? 0);
        $rows[] = $r;
    }
    _json(true, 'OK', $rows);
}

function _obter_conta($db) {
    $id = intval($_GET['id'] ?? 0);
    if (!$id) _json(false, 'ID inválido', null, 400);
    $stmt = $db->prepare("SELECT * FROM contas_bancarias WHERE id = ? AND ativo = 1");
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $r = $stmt->get_result()->fetch_assoc();
    if (!$r) _json(false, 'Conta não encontrada', null, 404);
    $r['saldo_atual'] = (float)$r['saldo_atual'];
    _json(true, 'OK', $r);
}

function _criar_conta($db, $body) {
    verificarPermissao('gerente');
    $campos = ['nome','banco_codigo','banco_nome','agencia','conta_numero','conta_tipo'];
    foreach ($campos as $c) {
        if (empty($body[$c])) _json(false, "Campo obrigatório: $c", null, 400);
    }
    $saldo_ini = (float)($body['saldo_inicial'] ?? 0);
    $stmt = $db->prepare("INSERT INTO contas_bancarias
        (nome, banco_codigo, banco_nome, agencia, conta_numero, conta_tipo, moeda, saldo_inicial, saldo_atual, observacoes)
        VALUES (?,?,?,?,?,?,?,?,?,?)");
    $moeda = $body['moeda'] ?? 'BRL';
    $obs   = $body['observacoes'] ?? '';
    $stmt->bind_param('sssssssdds',
        $body['nome'], $body['banco_codigo'], $body['banco_nome'],
        $body['agencia'], $body['conta_numero'], $body['conta_tipo'],
        $moeda, $saldo_ini, $saldo_ini, $obs
    );
    if (!$stmt->execute()) _json(false, 'Erro ao criar conta: ' . $stmt->error);
    _json(true, 'Conta criada com sucesso', ['id' => $db->insert_id]);
}

function _atualizar_conta($db, $body) {
    verificarPermissao('gerente');
    $id = intval($body['id'] ?? 0);
    if (!$id) _json(false, 'ID inválido', null, 400);
    $stmt = $db->prepare("UPDATE contas_bancarias SET
        nome=?, banco_codigo=?, banco_nome=?, agencia=?, conta_numero=?,
        conta_tipo=?, moeda=?, saldo_inicial=?, observacoes=?
        WHERE id=? AND ativo=1");
    $saldo_ini = (float)($body['saldo_inicial'] ?? 0);
    $moeda = $body['moeda'] ?? 'BRL';
    $obs   = $body['observacoes'] ?? '';
    $stmt->bind_param('sssssssdssi',
        $body['nome'], $body['banco_codigo'], $body['banco_nome'],
        $body['agencia'], $body['conta_numero'], $body['conta_tipo'],
        $moeda, $saldo_ini, $obs, $id
    );
    if (!$stmt->execute()) _json(false, 'Erro ao atualizar: ' . $stmt->error);
    _recalcular_saldo($db, $id);
    _json(true, 'Conta atualizada com sucesso');
}

function _excluir_conta($db, $body) {
    verificarPermissao('admin');
    $id = intval($body['id'] ?? 0);
    if (!$id) _json(false, 'ID inválido', null, 400);
    $stmt = $db->prepare("UPDATE contas_bancarias SET ativo=0 WHERE id=?");
    $stmt->bind_param('i', $id);
    $stmt->execute();
    _json(true, 'Conta removida');
}

// =====================================================
// MOVIMENTAÇÕES
// =====================================================

function _listar_movimentacoes($db) {
    // Verificar se tabela existe
    if ($db->query("SHOW TABLES LIKE 'movimentacoes_bancarias'")->num_rows === 0) {
        _json(true, 'OK', ['movimentacoes' => [], 'total' => 0]);
    }
    $conta_id   = intval($_GET['conta_id'] ?? 0);
    $tipo       = $_GET['tipo'] ?? '';
    $conciliado = $_GET['conciliado'] ?? '';
    $dt_ini     = $_GET['dt_ini'] ?? '';
    $dt_fim     = $_GET['dt_fim'] ?? '';
    $busca      = $_GET['busca'] ?? '';
    $limite     = min(intval($_GET['limite'] ?? 100), 500);
    $offset     = intval($_GET['offset'] ?? 0);

    $where = ['1=1'];
    $params = [];
    $types  = '';

    if ($conta_id) { $where[] = 'mb.conta_id = ?'; $params[] = $conta_id; $types .= 'i'; }
    if ($tipo)     { $where[] = 'mb.tipo = ?';      $params[] = $tipo;     $types .= 's'; }
    if ($conciliado !== '') { $where[] = 'mb.conciliado = ?'; $params[] = intval($conciliado); $types .= 'i'; }
    if ($dt_ini)   { $where[] = 'mb.data_lancamento >= ?'; $params[] = $dt_ini; $types .= 's'; }
    if ($dt_fim)   { $where[] = 'mb.data_lancamento <= ?'; $params[] = $dt_fim; $types .= 's'; }
    if ($busca)    { $where[] = 'mb.descricao LIKE ?'; $params[] = "%$busca%"; $types .= 's'; }

    $sql = "SELECT mb.*, cb.nome AS conta_nome, cb.banco_nome
            FROM movimentacoes_bancarias mb
            JOIN contas_bancarias cb ON cb.id = mb.conta_id
            WHERE " . implode(' AND ', $where) . "
            ORDER BY mb.data_lancamento DESC, mb.id DESC
            LIMIT ? OFFSET ?";
    $params[] = $limite; $types .= 'i';
    $params[] = $offset; $types .= 'i';

    $stmt = $db->prepare($sql);
    if ($types) $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $res = $stmt->get_result();
    $rows = [];
    while ($r = $res->fetch_assoc()) {
        $r['valor'] = (float)$r['valor'];
        $rows[] = $r;
    }

    // Total para paginação
    $sql_count = "SELECT COUNT(*) AS total FROM movimentacoes_bancarias mb WHERE " . implode(' AND ', $where);
    $types_count  = substr($types, 0, -2); // remove os 2 'i' do fim (limite e offset)
    $params_count = array_slice($params, 0, -2);
    $stmt2 = $db->prepare($sql_count);
    if ($types_count && count($params_count) > 0) $stmt2->bind_param($types_count, ...$params_count);
    $stmt2->execute();
    $total = $stmt2->get_result()->fetch_assoc()['total'] ?? 0;

    _json(true, 'OK', ['movimentacoes' => $rows, 'total' => (int)$total]);
}

function _criar_movimentacao($db, $body) {
    verificarPermissao('gerente');
    $conta_id = intval($body['conta_id'] ?? 0);
    if (!$conta_id) _json(false, 'conta_id obrigatório', null, 400);
    if (empty($body['tipo']) || !in_array($body['tipo'], ['credito','debito'])) _json(false, 'tipo inválido', null, 400);
    if (empty($body['data_lancamento'])) _json(false, 'data_lancamento obrigatória', null, 400);
    $valor = abs((float)($body['valor'] ?? 0));
    if ($valor <= 0) _json(false, 'valor deve ser maior que zero', null, 400);

    $stmt = $db->prepare("INSERT INTO movimentacoes_bancarias
        (conta_id, tipo, valor, data_lancamento, descricao, checknum, categoria, origem, observacoes)
        VALUES (?,?,?,?,?,?,?,'manual',?)");
    $desc = $body['descricao'] ?? '';
    $chk  = $body['checknum'] ?? null;
    $cat  = $body['categoria'] ?? null;
    $obs  = $body['observacoes'] ?? null;
    $dt   = $body['data_lancamento'];
    $stmt->bind_param('isdsssss', $conta_id, $body['tipo'], $valor, $dt, $desc, $chk, $cat, $obs);
    if (!$stmt->execute()) _json(false, 'Erro ao criar movimentação: ' . $stmt->error);
    $novo_id = $db->insert_id;
    _recalcular_saldo($db, $conta_id);
    _json(true, 'Movimentação criada', ['id' => $novo_id]);
}

function _atualizar_movimentacao($db, $body) {
    verificarPermissao('gerente');
    $id = intval($body['id'] ?? 0);
    if (!$id) _json(false, 'ID inválido', null, 400);
    $stmt = $db->prepare("UPDATE movimentacoes_bancarias SET
        tipo=?, valor=?, data_lancamento=?, descricao=?, checknum=?, categoria=?, observacoes=?
        WHERE id=?");
    $valor = abs((float)($body['valor'] ?? 0));
    $stmt->bind_param('sdsssssi',
        $body['tipo'], $valor, $body['data_lancamento'],
        $body['descricao'] ?? '', $body['checknum'] ?? null,
        $body['categoria'] ?? null, $body['observacoes'] ?? null, $id
    );
    if (!$stmt->execute()) _json(false, 'Erro ao atualizar: ' . $stmt->error);
    // Recalcular saldo da conta
    $r = $db->query("SELECT conta_id FROM movimentacoes_bancarias WHERE id=$id")->fetch_assoc();
    if ($r) _recalcular_saldo($db, $r['conta_id']);
    _json(true, 'Movimentação atualizada');
}

function _excluir_movimentacao($db, $body) {
    verificarPermissao('gerente');
    $id = intval($body['id'] ?? 0);
    if (!$id) _json(false, 'ID inválido', null, 400);
    $r = $db->query("SELECT conta_id FROM movimentacoes_bancarias WHERE id=$id")->fetch_assoc();
    $stmt = $db->prepare("DELETE FROM movimentacoes_bancarias WHERE id=?");
    $stmt->bind_param('i', $id);
    $stmt->execute();
    if ($r) _recalcular_saldo($db, $r['conta_id']);
    _json(true, 'Movimentação excluída');
}

function _conciliar($db, $body) {
    verificarPermissao('gerente');
    $ids = $body['ids'] ?? [];
    $conciliado = intval($body['conciliado'] ?? 1);
    if (empty($ids)) _json(false, 'Nenhum ID informado', null, 400);
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $types = str_repeat('i', count($ids));
    $stmt = $db->prepare("UPDATE movimentacoes_bancarias SET conciliado=? WHERE id IN ($placeholders)");
    $params = array_merge([$conciliado], $ids);
    $types = 'i' . $types;
    $stmt->bind_param($types, ...$params);
    $stmt->execute();
    _json(true, 'Conciliação atualizada', ['afetadas' => $stmt->affected_rows]);
}

// =====================================================
// IMPORTAÇÃO OFX
// =====================================================

/**
 * Preview do OFX: analisa o arquivo e retorna estatísticas
 * sem inserir nada no banco. Informa quantas transações são
 * novas (após o último FITID importado) e quantas são duplicatas.
 */
function _preview_ofx($db) {
    if (empty($_FILES['ofx_file'])) _json(false, 'Arquivo OFX não enviado', null, 400);
    $conta_id = intval($_POST['conta_id'] ?? 0);
    if (!$conta_id) _json(false, 'conta_id obrigatório', null, 400);

    $conteudo = _ler_ofx($_FILES['ofx_file']['tmp_name']);
    $parsed   = _parsear_ofx($conteudo);

    // Buscar último FITID importado para esta conta
    $ultimo = _buscar_ultimo_fitid($db, $conta_id);

    $novas = 0; $duplicatas = 0; $apos_ultimo = false;
    foreach ($parsed['transacoes'] as $t) {
        if ($ultimo && !$apos_ultimo) {
            if ($t['fitid'] === $ultimo) { $apos_ultimo = true; }
            $duplicatas++;
            continue;
        }
        // Verificar se FITID já existe no banco
        $stmt = $db->prepare("SELECT id FROM movimentacoes_bancarias WHERE conta_id=? AND fitid=?");
        $stmt->bind_param('is', $conta_id, $t['fitid']);
        $stmt->execute();
        if ($stmt->get_result()->num_rows > 0) { $duplicatas++; } else { $novas++; }
    }

    _json(true, 'Preview gerado', [
        'banco_id'         => $parsed['banco_id'],
        'acct_id'          => $parsed['acct_id'],
        'dt_inicio'        => $parsed['dt_inicio'],
        'dt_fim'           => $parsed['dt_fim'],
        'saldo_final'      => $parsed['saldo_final'],
        'total_transacoes' => count($parsed['transacoes']),
        'novas'            => $novas,
        'duplicatas'       => $duplicatas,
        'ultimo_fitid_bd'  => $ultimo,
        'nome_arquivo'     => $_FILES['ofx_file']['name'],
    ]);
}

/**
 * Importação efetiva do OFX:
 *  1. Parseia o arquivo
 *  2. Busca o último FITID importado para a conta
 *  3. Importa apenas transações com FITID posterior ao último
 *  4. Ignora FITIDs já existentes (deduplicação por UNIQUE KEY)
 *  5. Registra no histórico de importações
 *  6. Recalcula saldo da conta
 */
function _importar_ofx($db) {
    verificarPermissao('gerente');
    if (empty($_FILES['ofx_file'])) _json(false, 'Arquivo OFX não enviado', null, 400);
    $conta_id = intval($_POST['conta_id'] ?? 0);
    if (!$conta_id) _json(false, 'conta_id obrigatório', null, 400);

    // Verificar se conta existe
    $r = $db->query("SELECT id, nome FROM contas_bancarias WHERE id=$conta_id AND ativo=1")->fetch_assoc();
    if (!$r) _json(false, 'Conta não encontrada', null, 404);

    $conteudo = _ler_ofx($_FILES['ofx_file']['tmp_name']);
    $parsed   = _parsear_ofx($conteudo);

    if (empty($parsed['transacoes'])) _json(false, 'Nenhuma transação encontrada no arquivo OFX');

    // Buscar último FITID importado
    $ultimo_fitid = _buscar_ultimo_fitid($db, $conta_id);

    $importadas = 0; $duplicatas = 0; $erros = 0;
    $ultimo_fitid_novo = null; $ultima_data_nova = null;
    $apos_ultimo = ($ultimo_fitid === null); // se nunca importou, importar tudo

    $db->begin_transaction();
    try {
        $stmt = $db->prepare("INSERT IGNORE INTO movimentacoes_bancarias
            (conta_id, fitid, tipo, valor, data_lancamento, descricao, checknum, origem, importacao_id)
            VALUES (?,?,?,?,?,?,?,'ofx',?)");

        foreach ($parsed['transacoes'] as $t) {
            // Pular até encontrar o último FITID importado
            if (!$apos_ultimo) {
                if ($t['fitid'] === $ultimo_fitid) { $apos_ultimo = true; }
                $duplicatas++;
                continue;
            }

            $tipo  = ($t['valor'] >= 0) ? 'credito' : 'debito';
            $valor = abs($t['valor']);
            $imp_id = 0; // será atualizado após inserir o histórico

            $stmt->bind_param('issdssis',
                $conta_id, $t['fitid'], $tipo, $valor,
                $t['data'], $t['memo'], $t['checknum'], $imp_id
            );
            if ($stmt->execute()) {
                if ($stmt->affected_rows > 0) {
                    $importadas++;
                    $ultimo_fitid_novo = $t['fitid'];
                    $ultima_data_nova  = $t['data'];
                } else {
                    $duplicatas++; // UNIQUE KEY ignorou
                }
            } else {
                $erros++;
            }
        }

        // Registrar no histórico
        $nome_arq = $_FILES['ofx_file']['name'];
        $usuario  = $_SESSION['usuario_nome'] ?? 'sistema';
        $stmt2 = $db->prepare("INSERT INTO historico_importacoes_ofx
            (conta_id, nome_arquivo, banco_id_ofx, acct_id_ofx, dt_inicio_ofx, dt_fim_ofx,
             ultimo_fitid, ultima_data, total_transacoes, importadas, duplicadas, saldo_final_ofx, importado_por)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)");
        $total = count($parsed['transacoes']);
        $saldo = $parsed['saldo_final'];
        $stmt2->bind_param('isssssssiiids',
            $conta_id, $nome_arq, $parsed['banco_id'], $parsed['acct_id'],
            $parsed['dt_inicio'], $parsed['dt_fim'],
            $ultimo_fitid_novo ?? $ultimo_fitid,
            $ultima_data_nova,
            $total, $importadas, $duplicatas, $saldo, $usuario
        );
        $stmt2->execute();
        $imp_id_novo = $db->insert_id;

        // Atualizar importacao_id nas movimentações recém-inseridas (se houver)
        if ($importadas > 0 && $imp_id_novo) {
            $db->query("UPDATE movimentacoes_bancarias SET importacao_id=$imp_id_novo
                        WHERE conta_id=$conta_id AND importacao_id=0 AND origem='ofx'");
        }

        $db->commit();
    } catch (Exception $e) {
        $db->rollback();
        _json(false, 'Erro durante importação: ' . $e->getMessage());
    }

    // Recalcular saldo
    _recalcular_saldo($db, $conta_id);

    _json(true, 'Importação concluída', [
        'importadas'  => $importadas,
        'duplicatas'  => $duplicatas,
        'erros'       => $erros,
        'total_arq'   => count($parsed['transacoes']),
        'ultimo_fitid'=> $ultimo_fitid_novo ?? $ultimo_fitid,
    ]);
}

function _historico_importacoes($db) {
    $conta_id = intval($_GET['conta_id'] ?? 0);
    $where = $conta_id ? "WHERE hi.conta_id = $conta_id" : '';
    $sql = "SELECT hi.*, cb.nome AS conta_nome
            FROM historico_importacoes_ofx hi
            JOIN contas_bancarias cb ON cb.id = hi.conta_id
            $where
            ORDER BY hi.importado_em DESC
            LIMIT 100";
    $res = $db->query($sql);
    $rows = [];
    while ($r = $res->fetch_assoc()) $rows[] = $r;
    _json(true, 'OK', $rows);
}

function _ultimo_importado($db) {
    $conta_id = intval($_GET['conta_id'] ?? 0);
    if (!$conta_id) _json(false, 'conta_id obrigatório', null, 400);
    // Verificar se tabela existe
    if ($db->query("SHOW TABLES LIKE 'historico_importacoes_ofx'")->num_rows === 0) {
        _json(true, 'OK', null);
    }
    $res = $db->query("SELECT ultimo_fitid, ultima_data, importado_em, nome_arquivo
                     FROM historico_importacoes_ofx
                     WHERE conta_id=$conta_id
                     ORDER BY importado_em DESC LIMIT 1");
    $r = $res ? $res->fetch_assoc() : null;
    _json(true, 'OK', $r ?? null);
}

// =====================================================
// KPIs e RELATÓRIOS
// =====================================================

function _kpis($db) {
    $conta_id = intval($_GET['conta_id'] ?? 0);
    $mes = $_GET['mes'] ?? date('Y-m');

    $where_conta = $conta_id ? "AND mb.conta_id = $conta_id" : '';
    $where_mes   = "AND DATE_FORMAT(mb.data_lancamento,'%Y-%m') = '$mes'";

    $sql = "SELECT
        COALESCE(SUM(CASE WHEN mb.tipo='credito' THEN mb.valor ELSE 0 END), 0) AS total_creditos,
        COALESCE(SUM(CASE WHEN mb.tipo='debito'  THEN mb.valor ELSE 0 END), 0) AS total_debitos,
        COUNT(*) AS total_mov,
        SUM(CASE WHEN mb.conciliado=0 THEN 1 ELSE 0 END) AS pendentes_conciliacao
        FROM movimentacoes_bancarias mb
        WHERE 1=1 $where_conta $where_mes";
    $r = $db->query($sql)->fetch_assoc();

    $saldo_total = $db->query("SELECT COALESCE(SUM(saldo_atual),0) AS s FROM contas_bancarias WHERE ativo=1")->fetch_assoc()['s'];
    $total_contas = $db->query("SELECT COUNT(*) AS c FROM contas_bancarias WHERE ativo=1")->fetch_assoc()['c'];

    _json(true, 'OK', [
        'saldo_total'           => (float)$saldo_total,
        'total_contas'          => (int)$total_contas,
        'total_creditos_mes'    => (float)$r['total_creditos'],
        'total_debitos_mes'     => (float)$r['total_debitos'],
        'saldo_mes'             => (float)$r['total_creditos'] - (float)$r['total_debitos'],
        'total_mov_mes'         => (int)$r['total_mov'],
        'pendentes_conciliacao' => (int)$r['pendentes_conciliacao'],
    ]);
}

function _saldo_contas($db) {
    $res = $db->query("SELECT * FROM vw_saldo_contas ORDER BY nome ASC");
    $rows = [];
    while ($r = $res->fetch_assoc()) {
        $r['saldo_calculado']  = (float)$r['saldo_calculado'];
        $r['total_creditos']   = (float)$r['total_creditos'];
        $r['total_debitos']    = (float)$r['total_debitos'];
        $rows[] = $r;
    }
    _json(true, 'OK', $rows);
}

function _relatorio_extrato($db) {
    $conta_id = intval($_GET['conta_id'] ?? 0);
    $dt_ini   = $_GET['dt_ini'] ?? date('Y-m-01');
    $dt_fim   = $_GET['dt_fim'] ?? date('Y-m-d');

    $where = "WHERE mb.data_lancamento BETWEEN ? AND ?";
    $params = [$dt_ini, $dt_fim];
    $types  = 'ss';
    if ($conta_id) { $where .= ' AND mb.conta_id = ?'; $params[] = $conta_id; $types .= 'i'; }

    $sql = "SELECT mb.*, cb.nome AS conta_nome, cb.banco_nome, cb.agencia, cb.conta_numero
            FROM movimentacoes_bancarias mb
            JOIN contas_bancarias cb ON cb.id = mb.conta_id
            $where
            ORDER BY mb.data_lancamento ASC, mb.id ASC";
    $stmt = $db->prepare($sql);
    $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $res = $stmt->get_result();
    $rows = [];
    $total_c = 0; $total_d = 0;
    while ($r = $res->fetch_assoc()) {
        $r['valor'] = (float)$r['valor'];
        if ($r['tipo'] === 'credito') $total_c += $r['valor'];
        else $total_d += $r['valor'];
        $rows[] = $r;
    }
    _json(true, 'OK', [
        'movimentacoes'  => $rows,
        'total_creditos' => $total_c,
        'total_debitos'  => $total_d,
        'saldo_periodo'  => $total_c - $total_d,
    ]);
}

// =====================================================
// HELPERS INTERNOS
// =====================================================

/** Recalcula saldo_atual da conta somando saldo_inicial + créditos - débitos */
function _recalcular_saldo($db, $conta_id) {
    $db->query("UPDATE contas_bancarias cb
        SET saldo_atual = cb.saldo_inicial
            + COALESCE((SELECT SUM(valor) FROM movimentacoes_bancarias WHERE conta_id=$conta_id AND tipo='credito'),0)
            - COALESCE((SELECT SUM(valor) FROM movimentacoes_bancarias WHERE conta_id=$conta_id AND tipo='debito'),0)
        WHERE id=$conta_id");
}

/** Busca o FITID da última transação importada para a conta */
function _buscar_ultimo_fitid($db, $conta_id) {
    $r = $db->query("SELECT ultimo_fitid FROM historico_importacoes_ofx
                     WHERE conta_id=$conta_id AND ultimo_fitid IS NOT NULL
                     ORDER BY importado_em DESC LIMIT 1")->fetch_assoc();
    return $r ? $r['ultimo_fitid'] : null;
}

/** Lê o arquivo OFX convertendo de ISO-8859-1 para UTF-8 */
function _ler_ofx($path) {
    $raw = file_get_contents($path);
    // Detectar encoding pelo cabeçalho
    if (preg_match('/CHARSET:\s*1252/i', $raw) || preg_match('/ENCODING:\s*USASCII/i', $raw)) {
        $raw = mb_convert_encoding($raw, 'UTF-8', 'ISO-8859-1');
    }
    return $raw;
}

/**
 * Parseia OFX SGML (formato Bradesco e maioria dos bancos brasileiros)
 * Retorna array com: banco_id, acct_id, dt_inicio, dt_fim, saldo_final, transacoes[]
 */
function _parsear_ofx($conteudo) {
    $result = [
        'banco_id'    => '',
        'acct_id'     => '',
        'dt_inicio'   => null,
        'dt_fim'      => null,
        'saldo_final' => 0.0,
        'transacoes'  => [],
    ];

    // Extrair campos de cabeçalho da conta
    if (preg_match('/<BANKID>\s*([^\r\n<]+)/i', $conteudo, $m)) $result['banco_id'] = trim($m[1]);
    if (preg_match('/<ACCTID>\s*([^\r\n<]+)/i',  $conteudo, $m)) $result['acct_id']  = trim($m[1]);
    if (preg_match('/<DTSTART>\s*(\d{8})/i',      $conteudo, $m)) $result['dt_inicio'] = _ofx_data($m[1]);
    if (preg_match('/<DTEND>\s*(\d{8})/i',        $conteudo, $m)) $result['dt_fim']    = _ofx_data($m[1]);
    if (preg_match('/<BALAMT>\s*([\d.,\-]+)/i',   $conteudo, $m)) {
        $result['saldo_final'] = (float)str_replace(',', '.', $m[1]);
    }

    // Extrair todas as transações
    preg_match_all('/<STMTTRN>(.*?)<\/STMTTRN>/is', $conteudo, $blocos);
    foreach ($blocos[1] as $bloco) {
        $t = [];
        if (preg_match('/<TRNTYPE>\s*([^\r\n<]+)/i', $bloco, $m)) $t['trntype']  = strtoupper(trim($m[1]));
        if (preg_match('/<DTPOSTED>\s*(\d{8})/i',    $bloco, $m)) $t['data']     = _ofx_data($m[1]);
        if (preg_match('/<TRNAMT>\s*([\d.,\-]+)/i',  $bloco, $m)) {
            $t['valor'] = (float)str_replace(',', '.', trim($m[1]));
        }
        if (preg_match('/<FITID>\s*([^\r\n<]+)/i',   $bloco, $m)) $t['fitid']    = trim($m[1]);
        if (preg_match('/<CHECKNUM>\s*([^\r\n<]+)/i',$bloco, $m)) $t['checknum'] = trim($m[1]);
        if (preg_match('/<MEMO>\s*([^\r\n<]+)/i',    $bloco, $m)) $t['memo']     = trim($m[1]);

        // Garantir que débitos sejam negativos
        if (isset($t['trntype']) && $t['trntype'] === 'DEBIT' && isset($t['valor']) && $t['valor'] > 0) {
            $t['valor'] = -$t['valor'];
        }

        if (!empty($t['fitid']) && isset($t['valor']) && isset($t['data'])) {
            $result['transacoes'][] = [
                'fitid'    => $t['fitid'],
                'data'     => $t['data'],
                'valor'    => $t['valor'],
                'memo'     => $t['memo'] ?? '',
                'checknum' => $t['checknum'] ?? null,
                'trntype'  => $t['trntype'] ?? '',
            ];
        }
    }

    return $result;
}

/** Converte data OFX (YYYYMMDD) para formato MySQL (YYYY-MM-DD) */
function _ofx_data($str) {
    $str = substr($str, 0, 8);
    if (strlen($str) !== 8) return null;
    return substr($str,0,4).'-'.substr($str,4,2).'-'.substr($str,6,2);
}

// =====================================================
// BANCOS BRASILEIROS
// =====================================================

/**
 * Busca banco por código exato ou por nome (busca parcial).
 * GET ?acao=buscar_banco&q=237  ou  ?acao=buscar_banco&q=bradesco
 */
function _buscar_banco($db) {
    $q = trim($_GET['q'] ?? '');
    if (strlen($q) === 0) _json(false, 'Parâmetro q obrigatório', null, 400);

    // Verifica se a tabela existe
    $chk = $db->query("SHOW TABLES LIKE 'bancos_brasileiros'");
    if (!$chk || $chk->num_rows === 0) {
        // Tabela não existe ainda — retorna array vazio para não quebrar o front
        _json(true, 'Tabela não migrada', []);
    }

    // Busca por código exato primeiro
    $stmt = $db->prepare("SELECT codigo, ispb, nome, nome_curto FROM bancos_brasileiros WHERE codigo = ? AND ativo = 1 LIMIT 1");
    $stmt->bind_param('s', $q);
    $stmt->execute();
    $exact = $stmt->get_result()->fetch_assoc();
    if ($exact) {
        _json(true, 'OK', [$exact]);
    }

    // Busca por nome parcial (máx 15 resultados)
    $like = '%' . $q . '%';
    $stmt2 = $db->prepare("SELECT codigo, ispb, nome, nome_curto FROM bancos_brasileiros WHERE (nome LIKE ? OR nome_curto LIKE ? OR codigo LIKE ?) AND ativo = 1 ORDER BY CAST(codigo AS UNSIGNED), codigo LIMIT 15");
    $stmt2->bind_param('sss', $like, $like, $like);
    $stmt2->execute();
    $res = $stmt2->get_result();
    $rows = [];
    while ($r = $res->fetch_assoc()) $rows[] = $r;
    _json(true, 'OK', $rows);
}

/**
 * Lista todos os bancos ativos (para popular um select completo).
 * GET ?acao=listar_bancos
 */
function _listar_bancos($db) {
    $chk = $db->query("SHOW TABLES LIKE 'bancos_brasileiros'");
    if (!$chk || $chk->num_rows === 0) _json(true, 'Tabela não migrada', []);

    $res = $db->query("SELECT codigo, ispb, nome, nome_curto FROM bancos_brasileiros WHERE ativo = 1 ORDER BY CAST(codigo AS UNSIGNED), codigo");
    $rows = [];
    while ($r = $res->fetch_assoc()) $rows[] = $r;
    _json(true, 'OK', $rows);
}

/**
 * Cria a tabela bancos_brasileiros e insere o seed completo.
 * GET ?acao=migration_bancos
 */
function _migration_bancos($db) {
    header('Content-Type: application/json; charset=utf-8');

    // 1. Criar tabela
    $create = "CREATE TABLE IF NOT EXISTS bancos_brasileiros (
        id        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        codigo    VARCHAR(10)  NOT NULL,
        ispb      VARCHAR(8)   DEFAULT NULL,
        nome      VARCHAR(120) NOT NULL,
        nome_curto VARCHAR(60) DEFAULT NULL,
        ativo     TINYINT(1)   NOT NULL DEFAULT 1,
        UNIQUE KEY uk_codigo (codigo),
        KEY idx_nome (nome)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";

    if (!$db->query($create)) {
        echo json_encode(['sucesso'=>false,'mensagem'=>'Erro ao criar tabela: '.$db->error], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // 2. Verificar se já tem dados
    $count = $db->query("SELECT COUNT(*) AS n FROM bancos_brasileiros")->fetch_assoc()['n'];
    if ($count > 0) {
        echo json_encode(['sucesso'=>true,'mensagem'=>"Tabela já populada ($count bancos)"], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // 3. Inserir seed via arquivo SQL
    $seed_file = __DIR__ . '/../sql/seed_bancos_brasileiros.sql';
    if (!file_exists($seed_file)) {
        // Fallback: inserir os principais bancos inline
        _inserir_bancos_inline($db);
    } else {
        // Executar o arquivo SQL linha a linha
        $sql_content = file_get_contents($seed_file);
        // Remover CREATE TABLE (já feito) e TRUNCATE
        $sql_content = preg_replace('/CREATE TABLE.*?;/s', '', $sql_content);
        $sql_content = preg_replace('/TRUNCATE TABLE.*?;/s', '', $sql_content);
        // Executar multi_query
        if ($db->multi_query($sql_content)) {
            do { if ($res = $db->store_result()) $res->free(); } while ($db->next_result());
        }
        if ($db->errno) {
            // Tentar inserir inline como fallback
            _inserir_bancos_inline($db);
        }
    }

    $total = $db->query("SELECT COUNT(*) AS n FROM bancos_brasileiros")->fetch_assoc()['n'];
    echo json_encode(['sucesso'=>true,'mensagem'=>"$total bancos inseridos com sucesso"], JSON_UNESCAPED_UNICODE);
    exit;
}

function _inserir_bancos_inline($db) {
    // Principais bancos brasileiros (fallback se o arquivo SQL não estiver disponível)
    $bancos = [
        ['001','00000000','Banco do Brasil S.A.','BB'],
        ['033','90400888','Banco Santander (Brasil) S.A.','SANTANDER'],
        ['041','92702067','Banco do Estado do Rio Grande do Sul S.A.','BANRISUL'],
        ['077','00416968','Banco Inter S.A.','INTER'],
        ['104','00360305','Caixa Econômica Federal','CAIXA'],
        ['208','33870163','Banco BTG Pactual S.A.','BTG PACTUAL'],
        ['212','92894922','Banco Original S.A.','ORIGINAL'],
        ['237','60746948','Banco Bradesco S.A.','BRADESCO'],
        ['260','18236120','Nu Pagamentos S.A. — Nubank','NUBANK'],
        ['290','13884775','Pagseguro Internet S.A.','PAGSEGURO'],
        ['318','71371686','Banco BMG S.A.','BMG'],
        ['323','10573521','Mercado Pago — Conta do Mercado Livre','MERCADO PAGO'],
        ['336','00000000','Banco C6 S.A.','C6 BANK'],
        ['341','60701190','Itaú Unibanco S.A.','ITAÚ'],
        ['380','22896431','PicPay Serviços S.A.','PICPAY'],
        ['422','58160789','Banco Safra S.A.','SAFRA'],
        ['748','01181521','Banco Cooperativo Sicredi S.A.','SICREDI'],
        ['756','02038232','Banco Cooperativo do Brasil S.A. — Bancoob','SICOOB'],
    ];
    $stmt = $db->prepare("INSERT IGNORE INTO bancos_brasileiros (codigo,ispb,nome,nome_curto) VALUES (?,?,?,?)");
    foreach ($bancos as $b) {
        $stmt->bind_param('ssss', $b[0], $b[1], $b[2], $b[3]);
        $stmt->execute();
    }
}

// =====================================================

// ─── Garantir tabelas (migration silenciosa) ──────────
function _garantir_tabelas($db) {
    // Verifica se a tabela principal existe; se não, executa migration completa
    $check = $db->query("SHOW TABLES LIKE 'contas_bancarias'");
    if ($check && $check->num_rows === 0) {
        _executar_migration();
    }
}

function _executar_migration() {
    header('Content-Type: application/json; charset=utf-8');
    $db = conectar_banco();
    $sqls = [];

    // contas_bancarias
    $sqls[] = "CREATE TABLE IF NOT EXISTS contas_bancarias (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        nome VARCHAR(120) NOT NULL,
        banco_codigo VARCHAR(10) NOT NULL,
        banco_nome VARCHAR(80) NOT NULL,
        agencia VARCHAR(20) NOT NULL,
        conta_numero VARCHAR(30) NOT NULL,
        conta_tipo ENUM('corrente','poupanca','investimento','caixa') NOT NULL DEFAULT 'corrente',
        moeda CHAR(3) NOT NULL DEFAULT 'BRL',
        saldo_inicial DECIMAL(15,2) NOT NULL DEFAULT 0.00,
        saldo_atual DECIMAL(15,2) NOT NULL DEFAULT 0.00,
        ativo TINYINT(1) NOT NULL DEFAULT 1,
        observacoes TEXT,
        criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_conta (banco_codigo, agencia, conta_numero)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";

    // historico_importacoes_ofx (antes de movimentacoes por causa da FK)
    $sqls[] = "CREATE TABLE IF NOT EXISTS historico_importacoes_ofx (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        conta_id INT UNSIGNED NOT NULL,
        nome_arquivo VARCHAR(255) NOT NULL,
        banco_id_ofx VARCHAR(20) NULL,
        acct_id_ofx VARCHAR(40) NULL,
        dt_inicio_ofx DATE NULL,
        dt_fim_ofx DATE NULL,
        ultimo_fitid VARCHAR(80) NULL,
        ultima_data DATE NULL,
        total_transacoes INT UNSIGNED NOT NULL DEFAULT 0,
        importadas INT UNSIGNED NOT NULL DEFAULT 0,
        duplicadas INT UNSIGNED NOT NULL DEFAULT 0,
        saldo_final_ofx DECIMAL(15,2) NULL,
        importado_por VARCHAR(80) NULL,
        importado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_imp_conta FOREIGN KEY (conta_id) REFERENCES contas_bancarias(id) ON DELETE CASCADE,
        INDEX idx_conta_data (conta_id, importado_em)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";

    // movimentacoes_bancarias
    $sqls[] = "CREATE TABLE IF NOT EXISTS movimentacoes_bancarias (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        conta_id INT UNSIGNED NOT NULL,
        fitid VARCHAR(80) NULL,
        tipo ENUM('credito','debito') NOT NULL,
        valor DECIMAL(15,2) NOT NULL,
        data_lancamento DATE NOT NULL,
        descricao VARCHAR(500) NOT NULL,
        checknum VARCHAR(30) NULL,
        categoria VARCHAR(80) NULL,
        conciliado TINYINT(1) NOT NULL DEFAULT 0,
        origem ENUM('ofx','manual','importacao') NOT NULL DEFAULT 'ofx',
        importacao_id INT UNSIGNED NULL,
        observacoes TEXT,
        criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_mov_conta FOREIGN KEY (conta_id) REFERENCES contas_bancarias(id) ON DELETE CASCADE,
        UNIQUE KEY uq_fitid_conta (conta_id, fitid),
        INDEX idx_conta_data (conta_id, data_lancamento),
        INDEX idx_tipo (tipo),
        INDEX idx_conciliado (conciliado)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";

    // View
    $sqls[] = "CREATE OR REPLACE VIEW vw_saldo_contas AS
        SELECT cb.id, cb.nome, cb.banco_nome, cb.agencia, cb.conta_numero, cb.conta_tipo, cb.saldo_inicial,
            COALESCE(SUM(CASE WHEN mb.tipo='credito' THEN mb.valor ELSE 0 END),0) AS total_creditos,
            COALESCE(SUM(CASE WHEN mb.tipo='debito'  THEN mb.valor ELSE 0 END),0) AS total_debitos,
            cb.saldo_inicial
                + COALESCE(SUM(CASE WHEN mb.tipo='credito' THEN mb.valor ELSE 0 END),0)
                - COALESCE(SUM(CASE WHEN mb.tipo='debito'  THEN mb.valor ELSE 0 END),0) AS saldo_calculado
        FROM contas_bancarias cb
        LEFT JOIN movimentacoes_bancarias mb ON mb.conta_id = cb.id
        WHERE cb.ativo = 1
        GROUP BY cb.id";

    // Tabela bancos_brasileiros
    $sqls[] = "CREATE TABLE IF NOT EXISTS bancos_brasileiros (
        id        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        codigo    VARCHAR(10)  NOT NULL,
        ispb      VARCHAR(8)   DEFAULT NULL,
        nome      VARCHAR(120) NOT NULL,
        nome_curto VARCHAR(60) DEFAULT NULL,
        ativo     TINYINT(1)   NOT NULL DEFAULT 1,
        UNIQUE KEY uk_codigo (codigo),
        KEY idx_nome (nome)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";

    // Seed módulo
    $sqls[] = "INSERT IGNORE INTO modulos_sistema (chave, nome, descricao, icone, grupo, ordem)
        VALUES ('contas_bancarias','Contas Bancárias','Cadastro de contas e importação OFX','fas fa-university','financeiro',55)";

    $erros = [];
    foreach ($sqls as $sql) {
        if (!$db->query($sql)) $erros[] = $db->error;
    }

    // Seed bancos brasileiros (se tabela vazia)
    $count_bancos = $db->query("SELECT COUNT(*) AS n FROM bancos_brasileiros")->fetch_assoc()['n'] ?? 0;
    if ($count_bancos == 0) {
        _inserir_bancos_inline($db);
    }

    echo json_encode([
        'sucesso'  => empty($erros),
        'mensagem' => empty($erros) ? 'Migration executada com sucesso' : 'Migration com erros',
        'erros'    => $erros,
    ], JSON_UNESCAPED_UNICODE);
    exit;
}
