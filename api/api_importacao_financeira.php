<?php
/**
 * ============================================================
 * API DE IMPORTAÇÃO FINANCEIRA
 * ============================================================
 * Importa arquivos CSV ou PDF de outros sistemas (ex: BRCondos)
 * para as tabelas contas_pagar / contas_receber do ERP.
 *
 * Ações disponíveis (POST/GET):
 *   importar          — Faz upload e processa o arquivo
 *   listar_lotes      — Lista os lotes de importação
 *   listar_itens      — Lista itens de um lote (com filtro de status)
 *   conciliar_item    — Marca um item como conciliado manualmente
 *   ignorar_item      — Marca item como ignorado (não importar)
 *   confirmar_importar — Importa itens pendentes de um lote para contas_pagar/receber
 *   excluir_lote      — Remove um lote e seus itens
 *
 * @version 1.0.0
 */
require_once 'config.php';
require_once 'auth_helper.php';

$conn    = conectar_banco();
$usuario = verificarAutenticacao(true, 'operador');
$usuario_nome = $usuario['nome'] ?? 'Sistema';

date_default_timezone_set('America/Sao_Paulo');

// ── Criar tabelas se não existirem ────────────────────────────
$conn->query("CREATE TABLE IF NOT EXISTS `importacoes_financeiras` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nome_arquivo` varchar(255) NOT NULL,
  `tipo_arquivo` enum('CSV','PDF') NOT NULL DEFAULT 'CSV',
  `tipo_conta` enum('PAGAR','RECEBER') NOT NULL DEFAULT 'PAGAR',
  `data_inicio` date DEFAULT NULL,
  `data_fim` date DEFAULT NULL,
  `total_registros` int(11) DEFAULT 0,
  `total_importados` int(11) DEFAULT 0,
  `total_duplicatas` int(11) DEFAULT 0,
  `total_erros` int(11) DEFAULT 0,
  `status` enum('PROCESSANDO','CONCLUIDO','ERRO') DEFAULT 'PROCESSANDO',
  `usuario` varchar(100) DEFAULT NULL,
  `data_importacao` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

$conn->query("CREATE TABLE IF NOT EXISTS `importacoes_financeiras_itens` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `importacao_id` int(11) NOT NULL,
  `linha_original` int(11) DEFAULT NULL,
  `numero_documento` varchar(100) DEFAULT NULL,
  `fornecedor_nome` varchar(255) DEFAULT NULL,
  `classificacao_despesa` varchar(255) DEFAULT NULL,
  `centro_custo` varchar(100) DEFAULT NULL,
  `observacao` text DEFAULT NULL,
  `valor` decimal(12,2) DEFAULT NULL,
  `data_vencimento` date DEFAULT NULL,
  `data_pagamento` date DEFAULT NULL,
  `status_original` varchar(50) DEFAULT NULL,
  `aprovada` tinyint(1) DEFAULT 0,
  `status_importacao` enum('PENDENTE','IMPORTADO','DUPLICATA','ERRO','CONCILIADO','IGNORADO') DEFAULT 'PENDENTE',
  `conta_id` int(11) DEFAULT NULL,
  `duplicata_conta_id` int(11) DEFAULT NULL,
  `mensagem_erro` text DEFAULT NULL,
  `conciliado_por` varchar(100) DEFAULT NULL,
  `data_conciliacao` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_importacao_id` (`importacao_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

// ── Roteamento ────────────────────────────────────────────────
$acao = $_REQUEST['acao'] ?? ($_GET['acao'] ?? '');

switch ($acao) {
    case 'importar':           _importar();           break;
    case 'listar_lotes':       _listarLotes();        break;
    case 'listar_itens':       _listarItens();        break;
    case 'conciliar_item':     _conciliarItem();      break;
    case 'ignorar_item':       _ignorarItem();        break;
    case 'confirmar_importar': _confirmarImportar();  break;
    case 'excluir_lote':       _excluirLote();        break;
    default:
        retornar_json(false, 'Ação inválida: ' . htmlspecialchars($acao));
}

// ══════════════════════════════════════════════════════════════
// IMPORTAR — faz upload e processa o arquivo
// ══════════════════════════════════════════════════════════════
function _importar() {
    global $conn, $usuario_nome;

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        retornar_json(false, 'Método inválido');
    }

    $tipo_conta  = strtoupper(trim($_POST['tipo_conta']  ?? 'PAGAR'));
    $data_inicio = trim($_POST['data_inicio'] ?? '');
    $data_fim    = trim($_POST['data_fim']    ?? '');

    if (!in_array($tipo_conta, ['PAGAR','RECEBER'])) {
        retornar_json(false, 'Tipo de conta inválido. Use PAGAR ou RECEBER.');
    }

    if (empty($_FILES['arquivo']['tmp_name'])) {
        retornar_json(false, 'Nenhum arquivo enviado.');
    }

    $arquivo     = $_FILES['arquivo'];
    $nome_orig   = $arquivo['name'];
    $tmp         = $arquivo['tmp_name'];
    $ext         = strtoupper(pathinfo($nome_orig, PATHINFO_EXTENSION));

    if (!in_array($ext, ['CSV','PDF'])) {
        retornar_json(false, 'Formato não suportado. Envie um arquivo CSV ou PDF.');
    }

    // Criar lote
    $stmt = $conn->prepare("INSERT INTO importacoes_financeiras
        (nome_arquivo, tipo_arquivo, tipo_conta, data_inicio, data_fim, status, usuario)
        VALUES (?, ?, ?, ?, ?, 'PROCESSANDO', ?)");
    $di = $data_inicio ?: null;
    $df = $data_fim    ?: null;
    $stmt->bind_param('ssssss', $nome_orig, $ext, $tipo_conta, $di, $df, $usuario_nome);
    $stmt->execute();
    $lote_id = $conn->insert_id;
    $stmt->close();

    // Parse do arquivo
    $itens = [];
    if ($ext === 'CSV') {
        $itens = _parseCSV($tmp, $data_inicio, $data_fim);
    } else {
        $itens = _parsePDFText($tmp, $data_inicio, $data_fim);
    }

    if (empty($itens)) {
        $conn->query("UPDATE importacoes_financeiras SET status='ERRO', total_registros=0 WHERE id={$lote_id}");
        retornar_json(false, 'Nenhum registro encontrado no arquivo. Verifique o formato ou o período informado.');
    }

    // Detectar duplicatas e inserir itens
    $total = count($itens);
    $importados = 0; $duplicatas = 0; $erros = 0;

    foreach ($itens as $idx => $item) {
        $status_imp = 'PENDENTE';
        $dup_id     = null;
        $msg_erro   = null;

        // Verificar duplicata: mesmo fornecedor + valor + data_vencimento na tabela destino
        $tabela_dest = $tipo_conta === 'PAGAR' ? 'contas_pagar' : 'contas_receber';
        $campo_nome  = $tipo_conta === 'PAGAR' ? 'fornecedor_nome' : 'morador_nome';
        $campo_data  = $tipo_conta === 'PAGAR' ? 'data_vencimento' : 'data_vencimento';

        if (!empty($item['fornecedor_nome']) && !empty($item['valor']) && !empty($item['data_vencimento'])) {
            $fn  = $item['fornecedor_nome'];
            $val = (float)$item['valor'];
            $dv  = $item['data_vencimento'];
            $chk = $conn->prepare("SELECT id FROM `{$tabela_dest}` WHERE `{$campo_nome}` = ? AND valor_original = ? AND `{$campo_data}` = ? LIMIT 1");
            $chk->bind_param('sds', $fn, $val, $dv);
            $chk->execute();
            $res = $chk->get_result();
            if ($res->num_rows > 0) {
                $row = $res->fetch_assoc();
                $status_imp = 'DUPLICATA';
                $dup_id     = $row['id'];
                $duplicatas++;
            }
            $chk->close();
        }

        // Inserir item no lote
        $ins = $conn->prepare("INSERT INTO importacoes_financeiras_itens
            (importacao_id, linha_original, numero_documento, fornecedor_nome,
             classificacao_despesa, centro_custo, observacao, valor,
             data_vencimento, data_pagamento, status_original, aprovada,
             status_importacao, duplicata_conta_id, mensagem_erro)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");

        $linha  = $idx + 1;
        $num    = $item['numero_documento']      ?? null;
        $forn   = $item['fornecedor_nome']       ?? null;
        $class  = $item['classificacao_despesa'] ?? null;
        $cc     = $item['centro_custo']          ?? null;
        $obs    = $item['observacao']            ?? null;
        $val    = isset($item['valor']) ? (float)$item['valor'] : null;
        $dv     = $item['data_vencimento']       ?? null;
        $dp     = $item['data_pagamento']        ?? null;
        $stori  = $item['status_original']       ?? null;
        $aprov  = isset($item['aprovada']) ? (int)$item['aprovada'] : 0;

        $ins->bind_param('iisssssdsssiisi',
            $lote_id, $linha, $num, $forn, $class, $cc, $obs,
            $val, $dv, $dp, $stori, $aprov, $status_imp, $dup_id, $msg_erro
        );
        if ($ins->execute()) {
            if ($status_imp === 'PENDENTE') $importados++;
        } else {
            $erros++;
        }
        $ins->close();
    }

    // Atualizar lote
    $conn->query("UPDATE importacoes_financeiras SET
        status='CONCLUIDO',
        total_registros={$total},
        total_importados={$importados},
        total_duplicatas={$duplicatas},
        total_erros={$erros}
        WHERE id={$lote_id}");

    retornar_json(true, 'Arquivo processado com sucesso', [
        'lote_id'         => $lote_id,
        'total'           => $total,
        'pendentes'       => $importados,
        'duplicatas'      => $duplicatas,
        'erros'           => $erros
    ]);
}

// ══════════════════════════════════════════════════════════════
// PARSE CSV
// ══════════════════════════════════════════════════════════════
function _parseCSV($path, $data_inicio, $data_fim) {
    $itens = [];
    $handle = fopen($path, 'r');
    if (!$handle) return $itens;

    // Detectar delimitador
    $primeira = fgets($handle);
    rewind($handle);
    $delim = (substr_count($primeira, ';') > substr_count($primeira, ',')) ? ';' : ',';

    // Ler cabeçalho
    $header = fgetcsv($handle, 0, $delim);
    if (!$header) { fclose($handle); return $itens; }

    // Normalizar cabeçalhos
    $header = array_map(fn($h) => mb_strtolower(trim(preg_replace('/[^a-zA-Z0-9_]/', '_', $h))), $header);

    // Mapas de colunas possíveis
    $map = [
        'numero_documento'      => ['_', 'id', 'numero', 'num', 'fatura', 'n_fatura', 'cod'],
        'fornecedor_nome'       => ['fornecedor', 'fornecedor_nome', 'nome', 'empresa', 'credor'],
        'classificacao_despesa' => ['classificacao', 'classifica__o_da_despesa', 'categoria', 'tipo_despesa'],
        'centro_custo'          => ['centro_de_custo', 'centro_custo', 'cc'],
        'observacao'            => ['observa__o', 'observacao', 'descricao', 'historico'],
        'valor'                 => ['valor', 'valor_r_', 'valor_original', 'total'],
        'data_vencimento'       => ['vence_em', 'vencimento', 'data_vencimento', 'dt_vencimento'],
        'data_pagamento'        => ['pago_em', 'pagamento', 'data_pagamento', 'dt_pagamento'],
        'status_original'       => ['status', 'situacao'],
        'aprovada'              => ['aprovada', 'aprovado']
    ];

    // Resolver índices
    $idx_map = [];
    foreach ($map as $campo => $aliases) {
        foreach ($aliases as $alias) {
            $pos = array_search($alias, $header);
            if ($pos !== false) { $idx_map[$campo] = $pos; break; }
        }
    }

    $linha = 1;
    while (($row = fgetcsv($handle, 0, $delim)) !== false) {
        $linha++;
        if (count(array_filter($row)) === 0) continue;

        $item = [];
        foreach ($idx_map as $campo => $pos) {
            $item[$campo] = isset($row[$pos]) ? trim($row[$pos]) : null;
        }

        // Normalizar valor
        if (!empty($item['valor'])) {
            $item['valor'] = _normalizarValor($item['valor']);
        }

        // Normalizar datas
        foreach (['data_vencimento','data_pagamento'] as $dc) {
            if (!empty($item[$dc])) {
                $item[$dc] = _normalizarData($item[$dc]);
            }
        }

        // Filtrar por período
        if ($data_inicio && !empty($item['data_vencimento']) && $item['data_vencimento'] < $data_inicio) continue;
        if ($data_fim    && !empty($item['data_vencimento']) && $item['data_vencimento'] > $data_fim)    continue;

        // Aprovada
        $item['aprovada'] = (!empty($item['aprovada']) && strtolower($item['aprovada']) === 'sim') ? 1 : 0;

        $itens[] = $item;
    }
    fclose($handle);
    return $itens;
}

// ══════════════════════════════════════════════════════════════
// PARSE PDF (texto extraído via pdftotext)
// Suporta o formato BRCondos (Contas a Pagar)
// ══════════════════════════════════════════════════════════════
function _parsePDFText($path, $data_inicio, $data_fim) {
    $itens = [];

    // Verificar se pdftotext está disponível
    $pdftotext = trim(shell_exec('which pdftotext 2>/dev/null'));
    if (empty($pdftotext)) {
        // Tentar extrair via strings como fallback
        $texto = shell_exec("strings " . escapeshellarg($path) . " 2>/dev/null");
    } else {
        $texto = shell_exec("pdftotext -layout " . escapeshellarg($path) . " - 2>/dev/null");
    }

    if (empty($texto)) return $itens;

    $linhas = explode("\n", $texto);

    // Padrão BRCondos: linha com ID numérico, fornecedor, datas, valor
    // Ex: 15627948 XAPURI MADEIRAS 30/04/2026 30/04/2026 504,40 PAGAMENTO MADEIRA MADEIRA - SIM Pago
    $padrao = '/^\s*(\d{7,10})\s+(.+?)\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+([\d\.,]+)\s+(.+?)\s+([\w\s\/]+?)\s*(-|[\w\s]+?)\s+(SIM|NÃO|NAO)\s+(Pago|Pendente|Vencido)?\s*$/i';

    foreach ($linhas as $linha_txt) {
        $linha_txt = trim($linha_txt);
        if (strlen($linha_txt) < 20) continue;

        // Tentar padrão principal
        if (preg_match($padrao, $linha_txt, $m)) {
            $dv = _normalizarData($m[3]);
            $dp = _normalizarData($m[4]);

            if ($data_inicio && $dv < $data_inicio) continue;
            if ($data_fim    && $dv > $data_fim)    continue;

            $itens[] = [
                'numero_documento'      => trim($m[1]),
                'fornecedor_nome'       => trim($m[2]),
                'data_vencimento'       => $dv,
                'data_pagamento'        => $dp,
                'valor'                 => _normalizarValor($m[5]),
                'observacao'            => trim($m[6]),
                'classificacao_despesa' => trim($m[7]),
                'centro_custo'          => trim($m[8]) === '-' ? null : trim($m[8]),
                'aprovada'              => strtoupper(trim($m[9])) === 'SIM' ? 1 : 0,
                'status_original'       => trim($m[10] ?? 'Pago')
            ];
            continue;
        }

        // Padrão alternativo: apenas ID + fornecedor + datas + valor
        if (preg_match('/^\s*(\d{7,10})\s+(.+?)\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+([\d\.,]+)/', $linha_txt, $m)) {
            $dv = _normalizarData($m[3]);
            $dp = _normalizarData($m[4]);

            if ($data_inicio && $dv < $data_inicio) continue;
            if ($data_fim    && $dv > $data_fim)    continue;

            // Extrair o restante da linha como observação
            $resto = trim(substr($linha_txt, strlen($m[0])));

            $itens[] = [
                'numero_documento'      => trim($m[1]),
                'fornecedor_nome'       => trim($m[2]),
                'data_vencimento'       => $dv,
                'data_pagamento'        => $dp,
                'valor'                 => _normalizarValor($m[5]),
                'observacao'            => $resto ?: null,
                'classificacao_despesa' => null,
                'centro_custo'          => null,
                'aprovada'              => 0,
                'status_original'       => 'Pago'
            ];
        }
    }

    return $itens;
}

// ══════════════════════════════════════════════════════════════
// LISTAR LOTES
// ══════════════════════════════════════════════════════════════
function _listarLotes() {
    global $conn;
    $res = $conn->query("SELECT * FROM importacoes_financeiras ORDER BY data_importacao DESC LIMIT 50");
    $lotes = [];
    while ($row = $res->fetch_assoc()) $lotes[] = $row;
    retornar_json(true, 'OK', $lotes);
}

// ══════════════════════════════════════════════════════════════
// LISTAR ITENS DE UM LOTE
// ══════════════════════════════════════════════════════════════
function _listarItens() {
    global $conn;
    $lote_id = (int)($_GET['lote_id'] ?? 0);
    $status  = trim($_GET['status'] ?? '');
    if (!$lote_id) { retornar_json(false, 'lote_id obrigatório'); return; }

    $where = "importacao_id = {$lote_id}";
    if ($status) $where .= " AND status_importacao = '" . $conn->real_escape_string($status) . "'";

    $res = $conn->query("SELECT * FROM importacoes_financeiras_itens WHERE {$where} ORDER BY linha_original ASC");
    $itens = [];
    while ($row = $res->fetch_assoc()) $itens[] = $row;
    retornar_json(true, 'OK', $itens);
}

// ══════════════════════════════════════════════════════════════
// CONCILIAR ITEM MANUALMENTE
// ══════════════════════════════════════════════════════════════
function _conciliarItem() {
    global $conn, $usuario_nome;
    $data = json_decode(file_get_contents('php://input'), true) ?: $_POST;
    $item_id  = (int)($data['item_id']  ?? 0);
    $conta_id = (int)($data['conta_id'] ?? 0);
    if (!$item_id) { retornar_json(false, 'item_id obrigatório'); return; }

    $stmt = $conn->prepare("UPDATE importacoes_financeiras_itens SET
        status_importacao='CONCILIADO',
        conta_id=?,
        conciliado_por=?,
        data_conciliacao=NOW()
        WHERE id=?");
    $cid = $conta_id ?: null;
    $stmt->bind_param('isi', $cid, $usuario_nome, $item_id);
    $stmt->execute();
    $stmt->close();
    retornar_json(true, 'Item conciliado com sucesso');
}

// ══════════════════════════════════════════════════════════════
// IGNORAR ITEM
// ══════════════════════════════════════════════════════════════
function _ignorarItem() {
    global $conn;
    $data    = json_decode(file_get_contents('php://input'), true) ?: $_POST;
    $item_id = (int)($data['item_id'] ?? 0);
    if (!$item_id) { retornar_json(false, 'item_id obrigatório'); return; }
    $conn->query("UPDATE importacoes_financeiras_itens SET status_importacao='IGNORADO' WHERE id={$item_id}");
    retornar_json(true, 'Item ignorado');
}

// ══════════════════════════════════════════════════════════════
// CONFIRMAR IMPORTAÇÃO — cria registros em contas_pagar/receber
// ══════════════════════════════════════════════════════════════
function _confirmarImportar() {
    global $conn, $usuario_nome;
    $data    = json_decode(file_get_contents('php://input'), true) ?: $_POST;
    $lote_id = (int)($data['lote_id'] ?? 0);
    if (!$lote_id) { retornar_json(false, 'lote_id obrigatório'); return; }

    // Buscar lote
    $res_lote = $conn->query("SELECT * FROM importacoes_financeiras WHERE id={$lote_id}");
    if (!$res_lote || $res_lote->num_rows === 0) { retornar_json(false, 'Lote não encontrado'); return; }
    $lote = $res_lote->fetch_assoc();
    $tipo_conta = $lote['tipo_conta'];

    // Buscar plano de contas padrão (DESPESA para pagar, RECEITA para receber)
    $tipo_plano = $tipo_conta === 'PAGAR' ? 'DESPESA' : 'RECEITA';
    $res_plano  = $conn->query("SELECT id FROM planos_contas WHERE tipo='{$tipo_plano}' AND ativo=1 LIMIT 1");
    $plano_id   = 1; // fallback
    if ($res_plano && $res_plano->num_rows > 0) {
        $plano_id = (int)$res_plano->fetch_assoc()['id'];
    }

    // Buscar itens PENDENTES do lote
    $res_itens = $conn->query("SELECT * FROM importacoes_financeiras_itens WHERE importacao_id={$lote_id} AND status_importacao='PENDENTE'");
    $importados = 0; $erros = 0;

    while ($item = $res_itens->fetch_assoc()) {
        $num_doc  = $item['numero_documento'] ?: ('IMP-' . $lote_id . '-' . $item['id']);
        $forn     = $item['fornecedor_nome']       ?: 'Importado';
        $class    = $item['classificacao_despesa'] ?: '';
        $obs      = $item['observacao']            ?: '';
        $valor    = (float)($item['valor']         ?: 0);
        $dv       = $item['data_vencimento']       ?: date('Y-m-d');
        $dp       = $item['data_pagamento']        ?: null;
        $stori    = strtolower($item['status_original'] ?? '');
        $status   = (strpos($stori, 'pago') !== false || strpos($stori, 'paid') !== false) ? 'PAGO' : 'PENDENTE';
        $vp       = $status === 'PAGO' ? $valor : 0;

        if ($tipo_conta === 'PAGAR') {
            $saldo = $valor - $vp;
            $ins = $conn->prepare("INSERT INTO contas_pagar
                (numero_documento, fornecedor_nome, plano_conta_id, classificacao_despesa,
                 descricao, valor_original, valor_pago, saldo_devedor,
                 data_emissao, data_vencimento, data_pagamento,
                 status, observacoes, usuario_criacao, ativo)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)");
            $de = date('Y-m-d');
            $ins->bind_param('ssissdddssssss',
                $num_doc, $forn, $plano_id, $class,
                $obs, $valor, $vp, $saldo,
                $de, $dv, $dp,
                $status, $obs, $usuario_nome
            );
        } else {
            $saldo = $valor - $vp;
            $ins = $conn->prepare("INSERT INTO contas_receber
                (numero_documento, morador_nome, plano_conta_id, descricao,
                 valor_original, valor_recebido, saldo_devedor,
                 data_emissao, data_vencimento, data_recebimento,
                 status, observacoes, usuario_criacao, ativo)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1)");
            $de = date('Y-m-d');
            $ins->bind_param('ssissddssssss',
                $num_doc, $forn, $plano_id, $obs,
                $valor, $vp, $saldo,
                $de, $dv, $dp,
                $status, $obs, $usuario_nome
            );
        }

        if ($ins->execute()) {
            $conta_id = $conn->insert_id;
            $conn->query("UPDATE importacoes_financeiras_itens SET status_importacao='IMPORTADO', conta_id={$conta_id} WHERE id={$item['id']}");
            $importados++;
        } else {
            $conn->query("UPDATE importacoes_financeiras_itens SET status_importacao='ERRO', mensagem_erro='" . $conn->real_escape_string($conn->error) . "' WHERE id={$item['id']}");
            $erros++;
        }
        $ins->close();
    }

    // Atualizar contadores do lote
    $conn->query("UPDATE importacoes_financeiras SET total_importados=total_importados+{$importados} WHERE id={$lote_id}");

    retornar_json(true, "Importação concluída: {$importados} registros importados, {$erros} erros.", [
        'importados' => $importados,
        'erros'      => $erros
    ]);
}

// ══════════════════════════════════════════════════════════════
// EXCLUIR LOTE
// ══════════════════════════════════════════════════════════════
function _excluirLote() {
    global $conn;
    $data    = json_decode(file_get_contents('php://input'), true) ?: $_POST;
    $lote_id = (int)($data['lote_id'] ?? $_GET['lote_id'] ?? 0);
    if (!$lote_id) { retornar_json(false, 'lote_id obrigatório'); return; }
    $conn->query("DELETE FROM importacoes_financeiras_itens WHERE importacao_id={$lote_id}");
    $conn->query("DELETE FROM importacoes_financeiras WHERE id={$lote_id}");
    retornar_json(true, 'Lote excluído com sucesso');
}

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════
function _normalizarValor($v) {
    if (is_null($v) || $v === '') return null;
    $v = trim($v);
    // Remove R$, espaços
    $v = preg_replace('/[R$\s]/', '', $v);
    // Formato brasileiro: 1.234,56 → 1234.56
    if (preg_match('/^\d{1,3}(\.\d{3})*(,\d{1,2})?$/', $v)) {
        $v = str_replace('.', '', $v);
        $v = str_replace(',', '.', $v);
    } else {
        // Formato americano: 1,234.56 → 1234.56
        $v = str_replace(',', '', $v);
    }
    return is_numeric($v) ? (float)$v : null;
}

function _normalizarData($d) {
    if (empty($d)) return null;
    $d = trim($d);
    // DD/MM/YYYY → YYYY-MM-DD
    if (preg_match('/^(\d{2})\/(\d{2})\/(\d{4})$/', $d, $m)) {
        return "{$m[3]}-{$m[2]}-{$m[1]}";
    }
    // YYYY-MM-DD já está correto
    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $d)) return $d;
    // DD-MM-YYYY
    if (preg_match('/^(\d{2})-(\d{2})-(\d{4})$/', $d, $m)) {
        return "{$m[3]}-{$m[2]}-{$m[1]}";
    }
    return null;
}
