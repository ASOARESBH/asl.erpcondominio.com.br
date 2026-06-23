<?php
// =====================================================
// API - ORDENS DE SERVIÇO (OS)
// Versão: 1.0  |  Data: 2026-06-22
// =====================================================
// Endpoints (acao via GET ou JSON body):
//   migration           — cria/verifica tabelas
//   listar              — lista OS com filtros
//   criar               — cria nova OS
//   editar              — edita OS existente
//   excluir             — exclui OS
//   buscar              — busca OS por número/assunto
//   dashboard_kpis      — KPIs para o dashboard
//   listar_interacoes   — interações de uma OS
//   adicionar_interacao — adiciona interação (muda status p/ andamento)
//   finalizar           — finaliza OS (obrigatório horas_totais)
//   vincular_chamado    — vincula OS dependente
//   listar_assuntos     — lista assuntos de configuração
//   criar_assunto       — cria assunto
//   editar_assunto      — edita assunto
//   excluir_assunto     — exclui assunto
//   listar_config       — lista configurações homem-hora
//   salvar_config       — salva configuração homem-hora
//   listar_materiais    — lista materiais usados em uma OS
//   adicionar_material  — adiciona material a uma OS
//   remover_material    — remove material de uma OS
//   baixar_estoque_os   — abate estoque ao finalizar OS
// =====================================================

// ─── Handler de erro fatal ───────────────────────────
set_error_handler(function($errno, $errstr, $errfile, $errline) {
    $log_file = __DIR__ . '/../logs/debug_ordens_servico.log';
    $dir = dirname($log_file);
    if (!is_dir($dir)) mkdir($dir, 0755, true);
    $entry = date('Y-m-d H:i:s') . ' | PHP_ERROR | ' . json_encode([
        'errno' => $errno, 'errstr' => $errstr,
        'errfile' => basename($errfile), 'errline' => $errline
    ], JSON_UNESCAPED_UNICODE) . PHP_EOL;
    file_put_contents($log_file, $entry, FILE_APPEND | LOCK_EX);
    if (in_array($errno, [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR])) {
        http_response_code(500);
        echo json_encode(['sucesso'=>false,'mensagem'=>"Erro interno: $errstr (linha $errline)"], JSON_UNESCAPED_UNICODE);
        exit;
    }
    return false;
});
register_shutdown_function(function() {
    $error = error_get_last();
    if ($error && in_array($error['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR])) {
        $log_file = __DIR__ . '/../logs/debug_ordens_servico.log';
        $entry = date('Y-m-d H:i:s') . ' | FATAL_ERROR | ' . json_encode($error, JSON_UNESCAPED_UNICODE) . PHP_EOL;
        file_put_contents($log_file, $entry, FILE_APPEND | LOCK_EX);
        if (!headers_sent()) {
            http_response_code(500);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(['sucesso'=>false,'mensagem'=>'Erro fatal: '.$error['message']], JSON_UNESCAPED_UNICODE);
        }
    }
});

// ─── Configurações de sessão ─────────────────────────
ini_set('session.cookie_httponly', 1);
ini_set('session.use_only_cookies', 1);
ini_set('session.cookie_samesite', 'Lax');
ini_set('session.gc_maxlifetime', 7200);

ob_start();
require_once 'config.php';
require_once 'auth_helper.php';
ob_end_clean();

// ─── Headers ─────────────────────────────────────────
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-cache, must-revalidate');
$allowed_origins = [
    'https://asl.erpcondominios.com.br',
    'http://asl.erpcondominios.com.br',
    'https://erpcondominios.com.br',
    'http://localhost',
    'http://127.0.0.1'
];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
header('Access-Control-Allow-Origin: ' . (in_array($origin, $allowed_origins) ? $origin : 'https://asl.erpcondominios.com.br'));
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// ─── Função de log de debug ──────────────────────────
function os_log($nivel, $mensagem, $dados = []) {
    $log_file = __DIR__ . '/../logs/debug_ordens_servico.log';
    $dir = dirname($log_file);
    if (!is_dir($dir)) mkdir($dir, 0755, true);
    $session_id = (session_status() === PHP_SESSION_ACTIVE) ? session_id() : 'sem-sessao';
    $entry = date('Y-m-d H:i:s') . ' | ' . strtoupper($nivel) . ' | ' . json_encode([
        'session_id' => $session_id,
        'mensagem'   => $mensagem,
        'dados'      => $dados
    ], JSON_UNESCAPED_UNICODE) . PHP_EOL;
    file_put_contents($log_file, $entry, FILE_APPEND | LOCK_EX);
}

// ─── Função retornar JSON ────────────────────────────
if (!function_exists('retornar_json')) {
    function retornar_json($sucesso, $mensagem, $dados = null) {
        $r = ['sucesso' => $sucesso, 'mensagem' => $mensagem];
        if ($dados !== null) $r['dados'] = $dados;
        echo json_encode($r, JSON_UNESCAPED_UNICODE);
        exit;
    }
}

// ─── Autenticação ────────────────────────────────────
try {
    verificarAutenticacao(true, 'operador');
} catch (Exception $e) {
    os_log('erro', 'Autenticação falhou', ['msg' => $e->getMessage()]);
    retornar_json(false, 'Não autenticado: ' . $e->getMessage());
}

// ─── Conexão ─────────────────────────────────────────
$conn = conectar_banco();
if (!$conn) {
    os_log('erro', 'Falha na conexão com banco');
    retornar_json(false, 'Erro ao conectar ao banco de dados');
}
$conn->set_charset('utf8mb4');

// ─── Leitura da ação ─────────────────────────────────
$metodo = $_SERVER['REQUEST_METHOD'];
$body   = [];
$raw    = file_get_contents('php://input');
if ($raw) {
    $decoded = json_decode($raw, true);
    if (json_last_error() === JSON_ERROR_NONE) $body = $decoded;
}
$acao = $_GET['acao'] ?? $_POST['acao'] ?? $body['acao'] ?? '';

os_log('info', 'Requisição recebida', ['metodo' => $metodo, 'acao' => $acao, 'get' => $_GET]);

// =====================================================
// MIGRATION — CRIAR TABELAS
// =====================================================
function _os_garantir_tabelas($conn) {
    $sqls = [];

    // Tabela principal de OS
    $sqls[] = "CREATE TABLE IF NOT EXISTS os_chamados (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        numero          VARCHAR(20) NOT NULL UNIQUE COMMENT 'Ex: OS-2024-0001',
        titulo          VARCHAR(255) NOT NULL,
        assunto_id      INT DEFAULT NULL,
        departamento    VARCHAR(100) DEFAULT NULL,
        prioridade      ENUM('baixa','media','alta','urgente') NOT NULL DEFAULT 'media',
        status          ENUM('aberto','andamento','finalizado','cancelado') NOT NULL DEFAULT 'aberto',
        morador_id      INT DEFAULT NULL,
        morador_nome    VARCHAR(255) DEFAULT NULL,
        morador_unidade VARCHAR(50) DEFAULT NULL,
        atendente_id    INT DEFAULT NULL,
        atendente_nome  VARCHAR(255) DEFAULT NULL,
        descricao       TEXT DEFAULT NULL,
        horas_estimadas DECIMAL(8,2) DEFAULT NULL,
        horas_totais    DECIMAL(8,2) DEFAULT NULL,
        os_pai_id       INT DEFAULT NULL COMMENT 'OS dependente de outra',
        data_abertura   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        data_inicio     DATETIME DEFAULT NULL,
        data_finalizacao DATETIME DEFAULT NULL,
        data_previsao   DATE DEFAULT NULL,
        criado_por_id   INT DEFAULT NULL,
        criado_por_nome VARCHAR(255) DEFAULT NULL,
        observacao_finalizacao TEXT DEFAULT NULL,
        INDEX idx_status (status),
        INDEX idx_prioridade (prioridade),
        INDEX idx_departamento (departamento),
        INDEX idx_data_abertura (data_abertura),
        INDEX idx_morador_id (morador_id),
        INDEX idx_atendente_id (atendente_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";

    // Interações / histórico de atendimento
    $sqls[] = "CREATE TABLE IF NOT EXISTS os_interacoes (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        os_id       INT NOT NULL,
        tipo        ENUM('comentario','andamento','solucao','nota_interna') NOT NULL DEFAULT 'comentario',
        mensagem    TEXT NOT NULL,
        usuario_id  INT DEFAULT NULL,
        usuario_nome VARCHAR(255) DEFAULT NULL,
        criado_em   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_os_id (os_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";

    // Materiais usados em cada OS
    $sqls[] = "CREATE TABLE IF NOT EXISTS os_materiais_usados (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        os_id           INT NOT NULL,
        produto_id      INT NOT NULL,
        produto_nome    VARCHAR(255) NOT NULL,
        quantidade      DECIMAL(10,3) NOT NULL DEFAULT 1,
        preco_unitario  DECIMAL(10,2) DEFAULT 0,
        estoque_baixado TINYINT(1) NOT NULL DEFAULT 0,
        adicionado_em   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_os_id (os_id),
        INDEX idx_produto_id (produto_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";

    // Assuntos / categorias de OS (configuráveis)
    $sqls[] = "CREATE TABLE IF NOT EXISTS os_assuntos (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        nome        VARCHAR(150) NOT NULL,
        descricao   VARCHAR(255) DEFAULT NULL,
        departamento VARCHAR(100) DEFAULT NULL,
        ativo       TINYINT(1) NOT NULL DEFAULT 1,
        criado_em   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";

    // Configuração de homem-hora por assunto/serviço
    $sqls[] = "CREATE TABLE IF NOT EXISTS os_config_homem_hora (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        assunto_id      INT DEFAULT NULL,
        descricao       VARCHAR(255) NOT NULL,
        horas_estimadas DECIMAL(8,2) NOT NULL DEFAULT 1,
        custo_hora      DECIMAL(10,2) DEFAULT 0,
        ativo           TINYINT(1) NOT NULL DEFAULT 1,
        criado_em       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";

    // Recursos humanos vinculados a cada OS
    $sqls[] = "CREATE TABLE IF NOT EXISTS os_recursos_humanos (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        os_id           INT NOT NULL,
        colaborador_id  INT NOT NULL,
        colaborador_nome VARCHAR(255) NOT NULL,
        cargo           VARCHAR(150) DEFAULT NULL,
        departamento    VARCHAR(100) DEFAULT NULL,
        vinculado_em    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_os_id (os_id),
        INDEX idx_colaborador_id (colaborador_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";

    $erros = [];
    foreach ($sqls as $sql) {
        if (!$conn->query($sql)) {
            $erros[] = $conn->error;
        }
    }
    return $erros;
}

// Executar migration automaticamente
$erros_migration = _os_garantir_tabelas($conn);
if (!empty($erros_migration)) {
    os_log('erro', 'Erros na migration', $erros_migration);
}

// ─── Roteamento por ação ─────────────────────────────
switch ($acao) {

    // ─────────────────────────────────────────────────
    case 'migration':
        if (empty($erros_migration)) {
            retornar_json(true, 'Tabelas verificadas/criadas com sucesso');
        } else {
            retornar_json(false, 'Erros na migration', $erros_migration);
        }
        break;

    // ─────────────────────────────────────────────────
    case 'dashboard_kpis':
        $kpis = [];

        // Totais por status
        $res = $conn->query("SELECT status, COUNT(*) as total FROM os_chamados GROUP BY status");
        $por_status = ['aberto'=>0,'andamento'=>0,'finalizado'=>0,'cancelado'=>0];
        if ($res) {
            while ($row = $res->fetch_assoc()) {
                $por_status[$row['status']] = (int)$row['total'];
            }
        }
        $kpis['abertos']     = $por_status['aberto'];
        $kpis['andamento']   = $por_status['andamento'];
        $kpis['finalizados'] = $por_status['finalizado'];
        $kpis['cancelados']  = $por_status['cancelado'];
        $kpis['total']       = array_sum($por_status);

        // Tempo médio de finalização (em horas)
        $res = $conn->query("SELECT AVG(horas_totais) as media FROM os_chamados WHERE status='finalizado' AND horas_totais IS NOT NULL");
        $row = $res ? $res->fetch_assoc() : null;
        $kpis['tempo_medio_horas'] = $row ? round((float)$row['media'], 1) : 0;

        // OS abertas hoje
        $res = $conn->query("SELECT COUNT(*) as total FROM os_chamados WHERE DATE(data_abertura) = CURDATE()");
        $row = $res ? $res->fetch_assoc() : null;
        $kpis['abertas_hoje'] = $row ? (int)$row['total'] : 0;

        // OS urgentes em aberto
        $res = $conn->query("SELECT COUNT(*) as total FROM os_chamados WHERE prioridade='urgente' AND status IN ('aberto','andamento')");
        $row = $res ? $res->fetch_assoc() : null;
        $kpis['urgentes_abertas'] = $row ? (int)$row['total'] : 0;

        // OS com prazo vencido (data_previsao < hoje e não finalizado)
        $res = $conn->query("SELECT COUNT(*) as total FROM os_chamados WHERE data_previsao IS NOT NULL AND data_previsao < CURDATE() AND status NOT IN ('finalizado','cancelado')");
        $row = $res ? $res->fetch_assoc() : null;
        $kpis['prazo_vencido'] = $row ? (int)$row['total'] : 0;

        // Últimas 5 OS abertas
        $res = $conn->query("SELECT id, numero, titulo, status, prioridade, departamento, DATE_FORMAT(data_abertura,'%d/%m/%Y %H:%i') as data_abertura FROM os_chamados ORDER BY data_abertura DESC LIMIT 5");
        $ultimas = [];
        if ($res) {
            while ($row = $res->fetch_assoc()) $ultimas[] = $row;
        }
        $kpis['ultimas_os'] = $ultimas;

        // Por prioridade
        $res = $conn->query("SELECT prioridade, COUNT(*) as total FROM os_chamados WHERE status NOT IN ('finalizado','cancelado') GROUP BY prioridade");
        $por_prioridade = ['baixa'=>0,'media'=>0,'alta'=>0,'urgente'=>0];
        if ($res) {
            while ($row = $res->fetch_assoc()) {
                $por_prioridade[$row['prioridade']] = (int)$row['total'];
            }
        }
        $kpis['por_prioridade'] = $por_prioridade;

        retornar_json(true, 'KPIs carregados', $kpis);
        break;

    // ─────────────────────────────────────────────────
    case 'listar':
        $status      = $_GET['status']      ?? $body['status']      ?? '';
        $prioridade  = $_GET['prioridade']  ?? $body['prioridade']  ?? '';
        $departamento = $_GET['departamento'] ?? $body['departamento'] ?? '';
        $busca       = $_GET['busca']       ?? $body['busca']       ?? '';
        $pagina      = max(1, (int)($_GET['pagina'] ?? 1));
        $por_pagina  = max(1, min(100, (int)($_GET['por_pagina'] ?? 25)));
        $offset      = ($pagina - 1) * $por_pagina;

        $where = ['1=1'];
        $params = [];
        $types  = '';

        if ($status !== '') {
            $where[] = 'o.status = ?';
            $params[] = $status;
            $types .= 's';
        }
        if ($prioridade !== '') {
            $where[] = 'o.prioridade = ?';
            $params[] = $prioridade;
            $types .= 's';
        }
        if ($departamento !== '') {
            $where[] = 'o.departamento = ?';
            $params[] = $departamento;
            $types .= 's';
        }
        if ($busca !== '') {
            $where[] = '(o.numero LIKE ? OR o.titulo LIKE ? OR o.morador_nome LIKE ? OR o.atendente_nome LIKE ?)';
            $b = '%' . $busca . '%';
            $params[] = $b; $params[] = $b; $params[] = $b; $params[] = $b;
            $types .= 'ssss';
        }

        $where_sql = implode(' AND ', $where);

        // Contar total
        $sql_count = "SELECT COUNT(*) as total FROM os_chamados o WHERE $where_sql";
        if (!empty($params)) {
            $stmt = $conn->prepare($sql_count);
            $stmt->bind_param($types, ...$params);
            $stmt->execute();
            $res = $stmt->get_result();
        } else {
            $res = $conn->query($sql_count);
        }
        $total = $res ? (int)$res->fetch_assoc()['total'] : 0;

        // Ordenação: abertos primeiro, depois andamento, depois finalizados; dentro de cada grupo, mais antigos primeiro
        $order = "FIELD(o.status,'aberto','andamento','finalizado','cancelado'), o.data_abertura ASC";

        $sql = "SELECT o.*, a.nome as assunto_nome
                FROM os_chamados o
                LEFT JOIN os_assuntos a ON o.assunto_id = a.id
                WHERE $where_sql
                ORDER BY $order
                LIMIT ? OFFSET ?";

        $params[] = $por_pagina;
        $params[] = $offset;
        $types .= 'ii';

        $stmt = $conn->prepare($sql);
        $stmt->bind_param($types, ...$params);
        $stmt->execute();
        $res = $stmt->get_result();
        $lista = [];
        while ($row = $res->fetch_assoc()) $lista[] = $row;

        retornar_json(true, 'OS listadas', [
            'lista'      => $lista,
            'total'      => $total,
            'pagina'     => $pagina,
            'por_pagina' => $por_pagina,
            'paginas'    => ceil($total / $por_pagina)
        ]);
        break;

    // ─────────────────────────────────────────────────
    case 'buscar':
        $id = (int)($_GET['id'] ?? $body['id'] ?? 0);
        if (!$id) retornar_json(false, 'ID inválido');

        $stmt = $conn->prepare(
            "SELECT o.*, a.nome as assunto_nome
             FROM os_chamados o
             LEFT JOIN os_assuntos a ON o.assunto_id = a.id
             WHERE o.id = ?"
        );
        $stmt->bind_param('i', $id);
        $stmt->execute();
        $os = $stmt->get_result()->fetch_assoc();
        if (!$os) retornar_json(false, 'OS não encontrada');

        // Buscar recursos humanos vinculados
        $stmt2 = $conn->prepare("SELECT * FROM os_recursos_humanos WHERE os_id = ? ORDER BY vinculado_em ASC");
        $stmt2->bind_param('i', $id);
        $stmt2->execute();
        $rh = [];
        $res2 = $stmt2->get_result();
        while ($row = $res2->fetch_assoc()) $rh[] = $row;
        $os['recursos_humanos'] = $rh;

        // Buscar materiais
        $stmt3 = $conn->prepare("SELECT * FROM os_materiais_usados WHERE os_id = ? ORDER BY adicionado_em ASC");
        $stmt3->bind_param('i', $id);
        $stmt3->execute();
        $mats = [];
        $res3 = $stmt3->get_result();
        while ($row = $res3->fetch_assoc()) $mats[] = $row;
        $os['materiais'] = $mats;

        retornar_json(true, 'OS encontrada', $os);
        break;

    // ─────────────────────────────────────────────────
    case 'criar':
        $dados = array_merge($body, $_POST);

        $titulo      = trim($dados['titulo']      ?? '');
        $descricao   = trim($dados['descricao']   ?? '');
        $prioridade  = trim($dados['prioridade']  ?? 'media');
        $departamento = trim($dados['departamento'] ?? '');
        $assunto_id  = !empty($dados['assunto_id']) ? (int)$dados['assunto_id'] : null;
        $morador_id  = !empty($dados['morador_id']) ? (int)$dados['morador_id'] : null;
        $morador_nome = trim($dados['morador_nome'] ?? '');
        $morador_unidade = trim($dados['morador_unidade'] ?? '');
        $atendente_id = !empty($dados['atendente_id']) ? (int)$dados['atendente_id'] : null;
        $atendente_nome = trim($dados['atendente_nome'] ?? '');
        $horas_estimadas = !empty($dados['horas_estimadas']) ? (float)$dados['horas_estimadas'] : null;
        $data_previsao = !empty($dados['data_previsao']) ? $dados['data_previsao'] : null;
        $os_pai_id   = !empty($dados['os_pai_id']) ? (int)$dados['os_pai_id'] : null;
        $recursos_humanos = $dados['recursos_humanos'] ?? [];

        if (empty($titulo)) retornar_json(false, 'Título é obrigatório');
        if (!in_array($prioridade, ['baixa','media','alta','urgente'])) $prioridade = 'media';

        // Gerar número sequencial único: OS-YYYY-NNNN
        $ano = date('Y');
        $res = $conn->query("SELECT MAX(CAST(SUBSTRING(numero, 9) AS UNSIGNED)) as ultimo FROM os_chamados WHERE numero LIKE 'OS-{$ano}-%'");
        $row = $res ? $res->fetch_assoc() : null;
        $seq = ($row && $row['ultimo']) ? (int)$row['ultimo'] + 1 : 1;
        $numero = 'OS-' . $ano . '-' . str_pad($seq, 4, '0', STR_PAD_LEFT);

        // Usuário logado
        $usuario = obterUsuarioAutenticado();
        $criado_por_id   = $usuario ? (int)$usuario['id'] : null;
        $criado_por_nome = $usuario ? $usuario['nome'] : null;

        $stmt = $conn->prepare(
            "INSERT INTO os_chamados
             (numero, titulo, assunto_id, departamento, prioridade, status,
              morador_id, morador_nome, morador_unidade,
              atendente_id, atendente_nome,
              descricao, horas_estimadas, data_previsao, os_pai_id,
              criado_por_id, criado_por_nome, data_abertura)
             VALUES (?,?,?,?,?,'aberto',?,?,?,?,?,?,?,?,?,?,?,NOW())"
        );
        $stmt->bind_param(
            'ssississsissdss ii',
            $numero, $titulo, $assunto_id, $departamento, $prioridade,
            $morador_id, $morador_nome, $morador_unidade,
            $atendente_id, $atendente_nome,
            $descricao, $horas_estimadas, $data_previsao, $os_pai_id,
            $criado_por_id, $criado_por_nome
        );

        // Reescrever com bind correto
        $stmt = $conn->prepare(
            "INSERT INTO os_chamados
             (numero, titulo, assunto_id, departamento, prioridade, status,
              morador_id, morador_nome, morador_unidade,
              atendente_id, atendente_nome,
              descricao, horas_estimadas, data_previsao, os_pai_id,
              criado_por_id, criado_por_nome)
             VALUES (?,?,?,?,?,'aberto',?,?,?,?,?,?,?,?,?,?,?)"
        );
        $stmt->bind_param(
            'ssissississdssii',
            $numero, $titulo, $assunto_id, $departamento, $prioridade,
            $morador_id, $morador_nome, $morador_unidade,
            $atendente_id, $atendente_nome,
            $descricao, $horas_estimadas, $data_previsao, $os_pai_id,
            $criado_por_id, $criado_por_nome
        );

        if (!$stmt->execute()) {
            os_log('erro', 'Erro ao criar OS', ['error' => $conn->error]);
            retornar_json(false, 'Erro ao criar OS: ' . $conn->error);
        }
        $os_id = $conn->insert_id;

        // Vincular recursos humanos
        if (!empty($recursos_humanos) && is_array($recursos_humanos)) {
            $stmt_rh = $conn->prepare(
                "INSERT INTO os_recursos_humanos (os_id, colaborador_id, colaborador_nome, cargo, departamento) VALUES (?,?,?,?,?)"
            );
            foreach ($recursos_humanos as $rh) {
                $col_id   = (int)($rh['id'] ?? 0);
                $col_nome = $rh['nome'] ?? '';
                $col_cargo = $rh['cargo'] ?? '';
                $col_dep  = $rh['departamento'] ?? '';
                if ($col_id && $col_nome) {
                    $stmt_rh->bind_param('iisss', $os_id, $col_id, $col_nome, $col_cargo, $col_dep);
                    $stmt_rh->execute();
                }
            }
        }

        // Interação inicial automática
        $msg_inicial = "OS criada com status **Aberto**. Prioridade: {$prioridade}.";
        $stmt_int = $conn->prepare(
            "INSERT INTO os_interacoes (os_id, tipo, mensagem, usuario_id, usuario_nome) VALUES (?,'comentario',?,?,?)"
        );
        $stmt_int->bind_param('isis', $os_id, $msg_inicial, $criado_por_id, $criado_por_nome);
        $stmt_int->execute();

        os_log('info', 'OS criada', ['os_id' => $os_id, 'numero' => $numero]);
        retornar_json(true, "OS {$numero} criada com sucesso", ['id' => $os_id, 'numero' => $numero]);
        break;

    // ─────────────────────────────────────────────────
    case 'editar':
        $dados = array_merge($body, $_POST);
        $id = (int)($dados['id'] ?? $_GET['id'] ?? 0);
        if (!$id) retornar_json(false, 'ID inválido');

        $titulo      = trim($dados['titulo']      ?? '');
        $descricao   = trim($dados['descricao']   ?? '');
        $prioridade  = trim($dados['prioridade']  ?? 'media');
        $departamento = trim($dados['departamento'] ?? '');
        $assunto_id  = !empty($dados['assunto_id']) ? (int)$dados['assunto_id'] : null;
        $morador_id  = !empty($dados['morador_id']) ? (int)$dados['morador_id'] : null;
        $morador_nome = trim($dados['morador_nome'] ?? '');
        $morador_unidade = trim($dados['morador_unidade'] ?? '');
        $atendente_id = !empty($dados['atendente_id']) ? (int)$dados['atendente_id'] : null;
        $atendente_nome = trim($dados['atendente_nome'] ?? '');
        $horas_estimadas = !empty($dados['horas_estimadas']) ? (float)$dados['horas_estimadas'] : null;
        $data_previsao = !empty($dados['data_previsao']) ? $dados['data_previsao'] : null;

        if (empty($titulo)) retornar_json(false, 'Título é obrigatório');

        $stmt = $conn->prepare(
            "UPDATE os_chamados SET
             titulo=?, assunto_id=?, departamento=?, prioridade=?,
             morador_id=?, morador_nome=?, morador_unidade=?,
             atendente_id=?, atendente_nome=?,
             descricao=?, horas_estimadas=?, data_previsao=?
             WHERE id=?"
        );
        $stmt->bind_param(
            'sissississdsi',
            $titulo, $assunto_id, $departamento, $prioridade,
            $morador_id, $morador_nome, $morador_unidade,
            $atendente_id, $atendente_nome,
            $descricao, $horas_estimadas, $data_previsao, $id
        );

        if (!$stmt->execute()) {
            retornar_json(false, 'Erro ao editar OS: ' . $conn->error);
        }

        // Atualizar recursos humanos (remove e recria)
        $recursos_humanos = $dados['recursos_humanos'] ?? null;
        if ($recursos_humanos !== null && is_array($recursos_humanos)) {
            $conn->query("DELETE FROM os_recursos_humanos WHERE os_id = $id");
            $stmt_rh = $conn->prepare(
                "INSERT INTO os_recursos_humanos (os_id, colaborador_id, colaborador_nome, cargo, departamento) VALUES (?,?,?,?,?)"
            );
            foreach ($recursos_humanos as $rh) {
                $col_id   = (int)($rh['id'] ?? 0);
                $col_nome = $rh['nome'] ?? '';
                $col_cargo = $rh['cargo'] ?? '';
                $col_dep  = $rh['departamento'] ?? '';
                if ($col_id && $col_nome) {
                    $stmt_rh->bind_param('iisss', $id, $col_id, $col_nome, $col_cargo, $col_dep);
                    $stmt_rh->execute();
                }
            }
        }

        os_log('info', 'OS editada', ['os_id' => $id]);
        retornar_json(true, 'OS atualizada com sucesso');
        break;

    // ─────────────────────────────────────────────────
    case 'excluir':
        $id = (int)($_GET['id'] ?? $body['id'] ?? 0);
        if (!$id) retornar_json(false, 'ID inválido');

        // Verificar se existe
        $res = $conn->query("SELECT id, numero, status FROM os_chamados WHERE id = $id");
        $os = $res ? $res->fetch_assoc() : null;
        if (!$os) retornar_json(false, 'OS não encontrada');
        if ($os['status'] === 'finalizado') retornar_json(false, 'Não é possível excluir uma OS finalizada');

        // Excluir dependências
        $conn->query("DELETE FROM os_interacoes WHERE os_id = $id");
        $conn->query("DELETE FROM os_materiais_usados WHERE os_id = $id");
        $conn->query("DELETE FROM os_recursos_humanos WHERE os_id = $id");

        $stmt = $conn->prepare("DELETE FROM os_chamados WHERE id = ?");
        $stmt->bind_param('i', $id);
        if (!$stmt->execute()) retornar_json(false, 'Erro ao excluir OS');

        os_log('info', 'OS excluída', ['os_id' => $id, 'numero' => $os['numero']]);
        retornar_json(true, 'OS excluída com sucesso');
        break;

    // ─────────────────────────────────────────────────
    case 'listar_interacoes':
        $os_id = (int)($_GET['os_id'] ?? $body['os_id'] ?? 0);
        if (!$os_id) retornar_json(false, 'os_id inválido');

        $stmt = $conn->prepare(
            "SELECT * FROM os_interacoes WHERE os_id = ? ORDER BY criado_em ASC"
        );
        $stmt->bind_param('i', $os_id);
        $stmt->execute();
        $lista = [];
        $res = $stmt->get_result();
        while ($row = $res->fetch_assoc()) $lista[] = $row;

        retornar_json(true, 'Interações carregadas', $lista);
        break;

    // ─────────────────────────────────────────────────
    case 'adicionar_interacao':
        $dados = array_merge($body, $_POST);
        $os_id   = (int)($dados['os_id'] ?? 0);
        $tipo    = trim($dados['tipo'] ?? 'comentario');
        $mensagem = trim($dados['mensagem'] ?? '');

        if (!$os_id) retornar_json(false, 'os_id inválido');
        if (empty($mensagem)) retornar_json(false, 'Mensagem é obrigatória');
        if (!in_array($tipo, ['comentario','andamento','solucao','nota_interna'])) $tipo = 'comentario';

        // Verificar se OS existe
        $res = $conn->query("SELECT id, status FROM os_chamados WHERE id = $os_id");
        $os = $res ? $res->fetch_assoc() : null;
        if (!$os) retornar_json(false, 'OS não encontrada');
        if ($os['status'] === 'finalizado') retornar_json(false, 'OS já finalizada');

        $usuario = obterUsuarioAutenticado();
        $usuario_id   = $usuario ? (int)$usuario['id'] : null;
        $usuario_nome = $usuario ? $usuario['nome'] : 'Sistema';

        $stmt = $conn->prepare(
            "INSERT INTO os_interacoes (os_id, tipo, mensagem, usuario_id, usuario_nome) VALUES (?,?,?,?,?)"
        );
        $stmt->bind_param('issis', $os_id, $tipo, $mensagem, $usuario_id, $usuario_nome);
        if (!$stmt->execute()) retornar_json(false, 'Erro ao adicionar interação');

        $int_id = $conn->insert_id;

        // Mudar status para "andamento" ao adicionar qualquer interação (se ainda aberto)
        if ($os['status'] === 'aberto') {
            $conn->query("UPDATE os_chamados SET status='andamento', data_inicio=NOW() WHERE id = $os_id");
        }

        os_log('info', 'Interação adicionada', ['os_id' => $os_id, 'tipo' => $tipo]);
        retornar_json(true, 'Interação adicionada com sucesso', ['id' => $int_id]);
        break;

    // ─────────────────────────────────────────────────
    case 'finalizar':
        $dados           = array_merge($body, $_POST);
        $os_id           = (int)($dados['os_id'] ?? 0);
        $horas_totais    = isset($dados['horas_totais']) ? (float)$dados['horas_totais'] : null;
        $horas_estimadas = !empty($dados['horas_estimadas']) ? (float)$dados['horas_estimadas'] : null;
        $data_previsao   = !empty($dados['data_previsao']) ? trim($dados['data_previsao']) : null;
        $observacao      = trim($dados['observacao_finalizacao'] ?? '');

        if (!$os_id) retornar_json(false, 'os_id inválido');
        if ($horas_totais === null || $horas_totais < 0) retornar_json(false, 'Horas totais são obrigatórias para finalizar a O.S');

        $res = $conn->query("SELECT id, status, numero FROM os_chamados WHERE id = $os_id");
        $os  = $res ? $res->fetch_assoc() : null;
        if (!$os) retornar_json(false, 'O.S não encontrada');
        if ($os['status'] === 'finalizado') retornar_json(false, 'O.S já está finalizada');

        // UPDATE dinâmico: inclui horas_estimadas e data_previsao se informados
        $set_extra    = '';
        $extra_types  = '';
        $extra_values = [];
        if ($horas_estimadas !== null) { $set_extra .= ', horas_estimadas=?'; $extra_types .= 'd'; $extra_values[] = $horas_estimadas; }
        if ($data_previsao   !== null) { $set_extra .= ', data_previsao=?';   $extra_types .= 's'; $extra_values[] = $data_previsao; }

        $sql_fin = "UPDATE os_chamados SET status='finalizado', horas_totais=?, data_finalizacao=NOW(), observacao_finalizacao=?{$set_extra} WHERE id=?";
        $stmt    = $conn->prepare($sql_fin);
        $bind_types  = 'ds' . $extra_types . 'i';
        $bind_values = array_merge([$horas_totais, $observacao], $extra_values, [$os_id]);
        $stmt->bind_param($bind_types, ...$bind_values);
        if (!$stmt->execute()) retornar_json(false, 'Erro ao finalizar O.S: ' . $conn->error);

        // Adicionar interação de finalização
        $usuario      = obterUsuarioAutenticado();
        $usuario_id   = $usuario ? (int)$usuario['id'] : null;
        $usuario_nome = $usuario ? $usuario['nome'] : 'Sistema';
        $msg_fin      = "O.S finalizada. Horas totais: {$horas_totais}h." . ($observacao ? " Observação: {$observacao}" : '');
        $stmt_int     = $conn->prepare(
            "INSERT INTO os_interacoes (os_id, tipo, mensagem, usuario_id, usuario_nome) VALUES (?,'solucao',?,?,?)"
        );
        $stmt_int->bind_param('isis', $os_id, $msg_fin, $usuario_id, $usuario_nome);
        $stmt_int->execute();

        // Baixar estoque automaticamente (materiais não baixados ainda)
        $res_mats = $conn->query(
            "SELECT * FROM os_materiais_usados WHERE os_id = $os_id AND estoque_baixado = 0"
        );
        $erros_estoque = [];
        if ($res_mats) {
            while ($mat = $res_mats->fetch_assoc()) {
                $res_prod = $conn->query("SELECT quantidade_estoque FROM produtos_estoque WHERE id = " . (int)$mat['produto_id']);
                if ($res_prod) {
                    $prod = $res_prod->fetch_assoc();
                    if ($prod) {
                        $nova_qtd = max(0, (float)$prod['quantidade_estoque'] - (float)$mat['quantidade']);
                        $conn->query("UPDATE produtos_estoque SET quantidade_estoque = $nova_qtd WHERE id = " . (int)$mat['produto_id']);
                        $conn->query("UPDATE os_materiais_usados SET estoque_baixado = 1 WHERE id = " . (int)$mat['id']);
                    }
                }
            }
        }

        os_log('info', 'O.S finalizada', ['os_id' => $os_id, 'numero' => $os['numero'], 'horas' => $horas_totais]);
        retornar_json(true, 'O.S finalizada com sucesso', ['erros_estoque' => $erros_estoque]);
        break;

    // ─────────────────────────────────────────────────
    case 'vincular_chamado':
        $dados = array_merge($body, $_POST);
        $os_id    = (int)($dados['os_id'] ?? 0);
        $os_pai_id = (int)($dados['os_pai_id'] ?? 0);

        if (!$os_id || !$os_pai_id) retornar_json(false, 'os_id e os_pai_id são obrigatórios');
        if ($os_id === $os_pai_id) retornar_json(false, 'Uma OS não pode depender de si mesma');

        // Verificar se ambas existem
        $res = $conn->query("SELECT id FROM os_chamados WHERE id IN ($os_id, $os_pai_id)");
        if (!$res || $res->num_rows < 2) retornar_json(false, 'Uma ou ambas as OS não foram encontradas');

        $stmt = $conn->prepare("UPDATE os_chamados SET os_pai_id = ? WHERE id = ?");
        $stmt->bind_param('ii', $os_pai_id, $os_id);
        if (!$stmt->execute()) retornar_json(false, 'Erro ao vincular OS');

        retornar_json(true, 'OS vinculada com sucesso');
        break;

    // ─────────────────────────────────────────────────
    case 'listar_assuntos':
        $ativo = $_GET['ativo'] ?? '1';
        $sql = "SELECT * FROM os_assuntos";
        if ($ativo !== '') $sql .= " WHERE ativo = " . ($ativo === '0' ? 0 : 1);
        $sql .= " ORDER BY nome ASC";
        $res = $conn->query($sql);
        $lista = [];
        if ($res) while ($row = $res->fetch_assoc()) $lista[] = $row;
        retornar_json(true, 'Assuntos carregados', $lista);
        break;

    // ─────────────────────────────────────────────────
    case 'criar_assunto':
        $dados = array_merge($body, $_POST);
        $nome        = trim($dados['nome']        ?? '');
        $descricao   = trim($dados['descricao']   ?? '');
        $departamento = trim($dados['departamento'] ?? '');

        if (empty($nome)) retornar_json(false, 'Nome é obrigatório');

        $stmt = $conn->prepare("INSERT INTO os_assuntos (nome, descricao, departamento) VALUES (?,?,?)");
        $stmt->bind_param('sss', $nome, $descricao, $departamento);
        if (!$stmt->execute()) retornar_json(false, 'Erro ao criar assunto: ' . $conn->error);

        retornar_json(true, 'Assunto criado com sucesso', ['id' => $conn->insert_id]);
        break;

    // ─────────────────────────────────────────────────
    case 'editar_assunto':
        $dados = array_merge($body, $_POST);
        $id          = (int)($dados['id'] ?? $_GET['id'] ?? 0);
        $nome        = trim($dados['nome']        ?? '');
        $descricao   = trim($dados['descricao']   ?? '');
        $departamento = trim($dados['departamento'] ?? '');
        $ativo       = isset($dados['ativo']) ? (int)$dados['ativo'] : 1;

        if (!$id) retornar_json(false, 'ID inválido');
        if (empty($nome)) retornar_json(false, 'Nome é obrigatório');

        $stmt = $conn->prepare("UPDATE os_assuntos SET nome=?, descricao=?, departamento=?, ativo=? WHERE id=?");
        $stmt->bind_param('sssii', $nome, $descricao, $departamento, $ativo, $id);
        if (!$stmt->execute()) retornar_json(false, 'Erro ao editar assunto');

        retornar_json(true, 'Assunto atualizado com sucesso');
        break;

    // ─────────────────────────────────────────────────
    case 'excluir_assunto':
        $id = (int)($_GET['id'] ?? $body['id'] ?? 0);
        if (!$id) retornar_json(false, 'ID inválido');

        // Verificar se está em uso
        $res = $conn->query("SELECT COUNT(*) as total FROM os_chamados WHERE assunto_id = $id");
        $row = $res ? $res->fetch_assoc() : null;
        if ($row && (int)$row['total'] > 0) {
            retornar_json(false, 'Assunto em uso por OS existentes. Inative-o em vez de excluir.');
        }

        $stmt = $conn->prepare("DELETE FROM os_assuntos WHERE id = ?");
        $stmt->bind_param('i', $id);
        if (!$stmt->execute()) retornar_json(false, 'Erro ao excluir assunto');

        retornar_json(true, 'Assunto excluído com sucesso');
        break;

    // ─────────────────────────────────────────────────
    case 'listar_config':
        $res = $conn->query(
            "SELECT c.*, a.nome as assunto_nome
             FROM os_config_homem_hora c
             LEFT JOIN os_assuntos a ON c.assunto_id = a.id
             WHERE c.ativo = 1
             ORDER BY c.descricao ASC"
        );
        $lista = [];
        if ($res) while ($row = $res->fetch_assoc()) $lista[] = $row;
        retornar_json(true, 'Configurações carregadas', $lista);
        break;

    // ─────────────────────────────────────────────────
    case 'salvar_config':
        $dados = array_merge($body, $_POST);
        $id             = !empty($dados['id']) ? (int)$dados['id'] : 0;
        $assunto_id     = !empty($dados['assunto_id']) ? (int)$dados['assunto_id'] : null;
        $descricao      = trim($dados['descricao']      ?? '');
        $horas_estimadas = (float)($dados['horas_estimadas'] ?? 1);
        $custo_hora     = (float)($dados['custo_hora']     ?? 0);

        if (empty($descricao)) retornar_json(false, 'Descrição é obrigatória');

        if ($id) {
            $stmt = $conn->prepare(
                "UPDATE os_config_homem_hora SET assunto_id=?, descricao=?, horas_estimadas=?, custo_hora=? WHERE id=?"
            );
            $stmt->bind_param('isddi', $assunto_id, $descricao, $horas_estimadas, $custo_hora, $id);
        } else {
            $stmt = $conn->prepare(
                "INSERT INTO os_config_homem_hora (assunto_id, descricao, horas_estimadas, custo_hora) VALUES (?,?,?,?)"
            );
            $stmt->bind_param('isdd', $assunto_id, $descricao, $horas_estimadas, $custo_hora);
        }

        if (!$stmt->execute()) retornar_json(false, 'Erro ao salvar configuração: ' . $conn->error);

        retornar_json(true, 'Configuração salva com sucesso', ['id' => $id ?: $conn->insert_id]);
        break;

    // ─────────────────────────────────────────────────
    case 'excluir_config':
        $id = (int)($_GET['id'] ?? $body['id'] ?? 0);
        if (!$id) retornar_json(false, 'ID inválido');
        $stmt = $conn->prepare("DELETE FROM os_config_homem_hora WHERE id = ?");
        $stmt->bind_param('i', $id);
        if (!$stmt->execute()) retornar_json(false, 'Erro ao excluir configuração');
        retornar_json(true, 'Configuração excluída com sucesso');
        break;

    // ─────────────────────────────────────────────────
    case 'listar_materiais':
        $os_id = (int)($_GET['os_id'] ?? $body['os_id'] ?? 0);
        if (!$os_id) retornar_json(false, 'os_id inválido');

        $stmt = $conn->prepare("SELECT * FROM os_materiais_usados WHERE os_id = ? ORDER BY adicionado_em ASC");
        $stmt->bind_param('i', $os_id);
        $stmt->execute();
        $lista = [];
        $res = $stmt->get_result();
        while ($row = $res->fetch_assoc()) $lista[] = $row;

        retornar_json(true, 'Materiais carregados', $lista);
        break;

    // ─────────────────────────────────────────────────
    case 'adicionar_material':
        $dados = array_merge($body, $_POST);
        $os_id         = (int)($dados['os_id'] ?? 0);
        $produto_id    = (int)($dados['produto_id'] ?? 0);
        $produto_nome  = trim($dados['produto_nome'] ?? '');
        $quantidade    = (float)($dados['quantidade'] ?? 1);
        $preco_unitario = (float)($dados['preco_unitario'] ?? 0);

        if (!$os_id || !$produto_id) retornar_json(false, 'os_id e produto_id são obrigatórios');
        if ($quantidade <= 0) retornar_json(false, 'Quantidade deve ser maior que zero');

        // Verificar se OS não está finalizada
        $res = $conn->query("SELECT status FROM os_chamados WHERE id = $os_id");
        $os = $res ? $res->fetch_assoc() : null;
        if (!$os) retornar_json(false, 'OS não encontrada');
        if ($os['status'] === 'finalizado') retornar_json(false, 'OS já finalizada — não é possível adicionar materiais');

        // Se não passou nome, buscar do banco
        if (empty($produto_nome)) {
            $res_prod = $conn->query("SELECT nome, preco_unitario FROM produtos_estoque WHERE id = $produto_id");
            $prod = $res_prod ? $res_prod->fetch_assoc() : null;
            if ($prod) {
                $produto_nome = $prod['nome'];
                if (!$preco_unitario) $preco_unitario = (float)$prod['preco_unitario'];
            }
        }

        $stmt = $conn->prepare(
            "INSERT INTO os_materiais_usados (os_id, produto_id, produto_nome, quantidade, preco_unitario) VALUES (?,?,?,?,?)"
        );
        $stmt->bind_param('iisdd', $os_id, $produto_id, $produto_nome, $quantidade, $preco_unitario);
        if (!$stmt->execute()) retornar_json(false, 'Erro ao adicionar material');

        retornar_json(true, 'Material adicionado com sucesso', ['id' => $conn->insert_id]);
        break;

    // ─────────────────────────────────────────────────
    case 'remover_material':
        $id = (int)($_GET['id'] ?? $body['id'] ?? 0);
        if (!$id) retornar_json(false, 'ID inválido');

        // Verificar se já foi baixado do estoque
        $res = $conn->query("SELECT estoque_baixado, os_id FROM os_materiais_usados WHERE id = $id");
        $mat = $res ? $res->fetch_assoc() : null;
        if (!$mat) retornar_json(false, 'Material não encontrado');
        if ($mat['estoque_baixado']) retornar_json(false, 'Material já baixado do estoque — não pode ser removido');

        $stmt = $conn->prepare("DELETE FROM os_materiais_usados WHERE id = ?");
        $stmt->bind_param('i', $id);
        if (!$stmt->execute()) retornar_json(false, 'Erro ao remover material');

        retornar_json(true, 'Material removido com sucesso');
        break;

    // ─────────────────────────────────────────────────
    case 'baixar_estoque_os':
        $os_id = (int)($_GET['os_id'] ?? $body['os_id'] ?? 0);
        if (!$os_id) retornar_json(false, 'os_id inválido');

        $res_mats = $conn->query(
            "SELECT * FROM os_materiais_usados WHERE os_id = $os_id AND estoque_baixado = 0"
        );
        $baixados = 0;
        $erros = [];
        if ($res_mats) {
            while ($mat = $res_mats->fetch_assoc()) {
                $res_prod = $conn->query("SELECT quantidade_estoque FROM produtos_estoque WHERE id = " . (int)$mat['produto_id']);
                if ($res_prod) {
                    $prod = $res_prod->fetch_assoc();
                    if ($prod) {
                        $nova_qtd = max(0, (float)$prod['quantidade_estoque'] - (float)$mat['quantidade']);
                        $conn->query("UPDATE produtos_estoque SET quantidade_estoque = $nova_qtd WHERE id = " . (int)$mat['produto_id']);
                        $conn->query("UPDATE os_materiais_usados SET estoque_baixado = 1 WHERE id = " . (int)$mat['id']);
                        $baixados++;
                    } else {
                        $erros[] = 'Produto ID ' . $mat['produto_id'] . ' não encontrado';
                    }
                }
            }
        }

        retornar_json(true, "$baixados material(is) baixado(s) do estoque", ['baixados' => $baixados, 'erros' => $erros]);
        break;

    // ─────────────────────────────────────────────────
    default:
        os_log('aviso', 'Ação inválida', ['acao' => $acao]);
        retornar_json(false, "Ação inválida: '$acao'");
        break;
}
