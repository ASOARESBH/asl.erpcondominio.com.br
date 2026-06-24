<?php
/**
 * API Unificada — GED (Gestão Eletrônica de Documentos)
 *
 * Ações GET:
 *   dashboard_stats, departamentos_listar, grupos_listar,
 *   pastas_listar, documentos_listar, documento_carregar,
 *   compartilhamentos_listar, acessos_listar, logs_listar,
 *   download, grupo_membros
 *
 * Ações POST:
 *   departamento_salvar, departamento_excluir,
 *   grupo_salvar, grupo_excluir, grupo_membro_add, grupo_membro_remove,
 *   pasta_salvar, pasta_excluir,
 *   documento_salvar, documento_excluir,
 *   compartilhamento_gerar, compartilhamento_desativar
 */

ob_start();
error_reporting(E_ALL);
ini_set('display_errors', 0);

require_once 'config.php';
require_once 'auth_helper.php';

if (!function_exists('retornar_json')) {
    function retornar_json($sucesso, $mensagem, $dados = null) {
        if (ob_get_length()) ob_clean();
        header('Content-Type: application/json; charset=utf-8');
        $r = ['sucesso' => $sucesso, 'mensagem' => $mensagem];
        if ($dados !== null) $r['dados'] = $dados;
        echo json_encode($r, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }
}

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }

verificarAutenticacao();

$db  = conectar_banco();
if (!$db) retornar_json(false, 'Erro ao conectar ao banco de dados');
$db->set_charset('utf8mb4');

_criar_tabelas($db);

$sessao = _sessao();
$acao   = $_GET['acao'] ?? $_POST['acao'] ?? '';

switch ($acao) {
    // ── Leitura ──────────────────────────────────────────────
    case 'dashboard_stats':       _dashboard_stats($db);       break;
    case 'departamentos_listar':  _departamentos_listar($db);  break;
    case 'grupos_listar':         _grupos_listar($db);         break;
    case 'grupo_membros':         _grupo_membros($db);         break;
    case 'pastas_listar':         _pastas_listar($db);         break;
    case 'documentos_listar':     _documentos_listar($db);     break;
    case 'documento_carregar':    _documento_carregar($db);    break;
    case 'compartilhamentos_listar': _compartilhamentos_listar($db); break;
    case 'acessos_listar':        _acessos_listar($db);        break;
    case 'logs_listar':           _logs_listar($db);           break;
    case 'download':              _download($db, $sessao);     break;

    // ── Escrita ───────────────────────────────────────────────
    case 'departamento_salvar':   _departamento_salvar($db, $sessao);  break;
    case 'departamento_excluir':  _departamento_excluir($db);          break;
    case 'grupo_salvar':          _grupo_salvar($db, $sessao);         break;
    case 'grupo_excluir':         _grupo_excluir($db);                 break;
    case 'grupo_membro_add':      _grupo_membro_add($db);              break;
    case 'grupo_membro_remove':   _grupo_membro_remove($db);           break;
    case 'pasta_salvar':          _pasta_salvar($db, $sessao);         break;
    case 'pasta_excluir':         _pasta_excluir($db);                 break;
    case 'documento_salvar':      _documento_salvar($db, $sessao);     break;
    case 'documento_excluir':     _documento_excluir($db, $sessao);    break;
    case 'compartilhamento_gerar':    _compartilhamento_gerar($db, $sessao);    break;
    case 'compartilhamento_desativar':_compartilhamento_desativar($db);         break;

    default:
        retornar_json(false, "Ação '$acao' não reconhecida.");
}

// ============================================================
// CRIAÇÃO AUTOMÁTICA DE TABELAS
// ============================================================
function _criar_tabelas($db) {
    $db->query("CREATE TABLE IF NOT EXISTS `documentos_departamentos` (
        `id` INT NOT NULL AUTO_INCREMENT,
        `nome` VARCHAR(100) NOT NULL,
        `descricao` TEXT,
        `icone` VARCHAR(60) DEFAULT 'fas fa-folder',
        `cor` VARCHAR(7) DEFAULT '#2563eb',
        `ativo` TINYINT(1) NOT NULL DEFAULT 1,
        `criado_por` INT DEFAULT NULL,
        `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (`id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $db->query("CREATE TABLE IF NOT EXISTS `documentos_grupos` (
        `id` INT NOT NULL AUTO_INCREMENT,
        `nome` VARCHAR(100) NOT NULL,
        `descricao` TEXT,
        `acesso_tipo` ENUM('todos','moradores','administradores','conselho','diretoria',
                           'financeiro','juridico','portaria','manutencao',
                           'prestadores','visitantes','personalizado') NOT NULL DEFAULT 'todos',
        `ativo` TINYINT(1) NOT NULL DEFAULT 1,
        `criado_por` INT DEFAULT NULL,
        `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (`id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $db->query("CREATE TABLE IF NOT EXISTS `documentos_grupos_usuarios` (
        `id` INT NOT NULL AUTO_INCREMENT,
        `grupo_id` INT NOT NULL,
        `usuario_id` INT NOT NULL,
        `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (`id`),
        UNIQUE KEY `uk_gu` (`grupo_id`,`usuario_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $db->query("CREATE TABLE IF NOT EXISTS `documentos_grupos_moradores` (
        `id` INT NOT NULL AUTO_INCREMENT,
        `grupo_id` INT NOT NULL,
        `morador_id` INT NOT NULL,
        `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (`id`),
        UNIQUE KEY `uk_gm` (`grupo_id`,`morador_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $db->query("CREATE TABLE IF NOT EXISTS `documentos_pastas` (
        `id` INT NOT NULL AUTO_INCREMENT,
        `nome` VARCHAR(200) NOT NULL,
        `departamento_id` INT DEFAULT NULL,
        `pasta_pai_id` INT DEFAULT NULL,
        `descricao` TEXT,
        `ordem` SMALLINT UNSIGNED DEFAULT 0,
        `ativo` TINYINT(1) NOT NULL DEFAULT 1,
        `criado_por` INT DEFAULT NULL,
        `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (`id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $db->query("CREATE TABLE IF NOT EXISTS `documentos` (
        `id` INT NOT NULL AUTO_INCREMENT,
        `nome` VARCHAR(300) NOT NULL,
        `descricao` TEXT,
        `departamento_id` INT DEFAULT NULL,
        `pasta_id` INT DEFAULT NULL,
        `grupo_id` INT DEFAULT NULL,
        `tags` TEXT,
        `arquivo` VARCHAR(600) DEFAULT NULL,
        `arquivo_tipo` VARCHAR(100) DEFAULT NULL,
        `arquivo_tamanho` BIGINT DEFAULT 0,
        `arquivo_nome_original` VARCHAR(500) DEFAULT NULL,
        `link_externo` VARCHAR(1000) DEFAULT NULL,
        `status` ENUM('ativo','inativo','expirado','rascunho') NOT NULL DEFAULT 'ativo',
        `data_publicacao` DATE DEFAULT NULL,
        `data_expiracao` DATE DEFAULT NULL,
        `total_downloads` INT UNSIGNED DEFAULT 0,
        `total_visualizacoes` INT UNSIGNED DEFAULT 0,
        `criado_por` INT DEFAULT NULL,
        `atualizado_por` INT DEFAULT NULL,
        `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (`id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $db->query("CREATE TABLE IF NOT EXISTS `documentos_compartilhamentos` (
        `id` INT NOT NULL AUTO_INCREMENT,
        `documento_id` INT NOT NULL,
        `token` VARCHAR(64) NOT NULL,
        `descricao` VARCHAR(300) DEFAULT NULL,
        `expira_em` DATETIME DEFAULT NULL,
        `limite_acessos` INT UNSIGNED DEFAULT NULL,
        `total_acessos` INT UNSIGNED DEFAULT 0,
        `ativo` TINYINT(1) NOT NULL DEFAULT 1,
        `criado_por` INT DEFAULT NULL,
        `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (`id`),
        UNIQUE KEY `uk_token` (`token`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $db->query("CREATE TABLE IF NOT EXISTS `documentos_acessos` (
        `id` INT NOT NULL AUTO_INCREMENT,
        `documento_id` INT NOT NULL,
        `tipo` ENUM('visualizacao','download','compartilhamento') NOT NULL DEFAULT 'visualizacao',
        `origem` ENUM('interno','externo') NOT NULL DEFAULT 'interno',
        `usuario_id` INT DEFAULT NULL,
        `usuario_nome` VARCHAR(200) DEFAULT NULL,
        `usuario_perfil` VARCHAR(100) DEFAULT NULL,
        `morador_id` INT DEFAULT NULL,
        `token_compartilhamento` VARCHAR(64) DEFAULT NULL,
        `ip` VARCHAR(45) DEFAULT NULL,
        `user_agent` TEXT,
        `referer` VARCHAR(500) DEFAULT NULL,
        `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (`id`),
        KEY `idx_doc` (`documento_id`),
        KEY `idx_ts` (`created_at`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $db->query("CREATE TABLE IF NOT EXISTS `documentos_logs` (
        `id` INT NOT NULL AUTO_INCREMENT,
        `documento_id` INT DEFAULT NULL,
        `usuario_id` INT DEFAULT NULL,
        `acao` ENUM('criacao','edicao','exclusao','download','visualizacao',
                    'compartilhamento','expiracao','restauracao','upload') NOT NULL,
        `descricao` TEXT,
        `ip` VARCHAR(45) DEFAULT NULL,
        `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (`id`),
        KEY `idx_doc` (`documento_id`),
        KEY `idx_ts`  (`created_at`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Garantir diretório de uploads
    $dir = dirname(__DIR__) . '/uploads/documentos';
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
        file_put_contents($dir . '/.htaccess',
            "Order Deny,Allow\nDeny from all\n"
        );
    }
}

// ============================================================
// HELPERS
// ============================================================
function _sessao(): array {
    if (session_status() === PHP_SESSION_NONE) session_start();
    return [
        'id'     => $_SESSION['usuario_id']    ?? null,
        'nome'   => $_SESSION['usuario_nome']  ?? 'Sistema',
        'perfil' => $_SESSION['usuario_perfil'] ?? 'operador',
    ];
}

function _esc($db, string $v): string {
    return $db->real_escape_string(trim($v));
}

function _ip(): string {
    return $_SERVER['HTTP_X_FORWARDED_FOR']
        ?? $_SERVER['REMOTE_ADDR']
        ?? '0.0.0.0';
}

function _log($db, $sessao, ?int $docId, string $acao, string $desc): void {
    $uid = (int)($sessao['id'] ?? 0);
    $ip  = _esc($db, _ip());
    $a   = _esc($db, $acao);
    $d   = _esc($db, $desc);
    $didSql = $docId ? $docId : 'NULL';
    $db->query("INSERT INTO documentos_logs (documento_id, usuario_id, acao, descricao, ip)
                VALUES ($didSql, $uid, '$a', '$d', '$ip')");
}

function _registrar_acesso($db, $sessao, int $docId, string $tipo, string $origem): void {
    $uid   = (int)($sessao['id'] ?? 0);
    $nome  = _esc($db, $sessao['nome'] ?? '');
    $perf  = _esc($db, $sessao['perfil'] ?? '');
    $ip    = _esc($db, _ip());
    $ua    = _esc($db, substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 500));
    $ref   = _esc($db, substr($_SERVER['HTTP_REFERER']    ?? '', 0, 499));

    $db->query("INSERT INTO documentos_acessos
                (documento_id, tipo, origem, usuario_id, usuario_nome, usuario_perfil, ip, user_agent, referer)
                VALUES ($docId, '$tipo', '$origem', " . ($uid ?: 'NULL') . ", '$nome', '$perf', '$ip', '$ua', '$ref')");

    // Incrementar contador
    if ($tipo === 'download') {
        $db->query("UPDATE documentos SET total_downloads = total_downloads + 1 WHERE id = $docId");
    } elseif ($tipo === 'visualizacao') {
        $db->query("UPDATE documentos SET total_visualizacoes = total_visualizacoes + 1 WHERE id = $docId");
    }
}

// ============================================================
// DASHBOARD
// ============================================================
function _dashboard_stats($db) {
    $hoje = date('Y-m-d');

    $rTotal    = $db->query("SELECT COUNT(*) c FROM documentos WHERE status = 'ativo'");
    $rHoje     = $db->query("SELECT COUNT(*) c FROM documentos WHERE DATE(created_at) = '$hoje'");
    $rDow      = $db->query("SELECT SUM(total_downloads) c FROM documentos");
    $rVis      = $db->query("SELECT SUM(total_visualizacoes) c FROM documentos");
    $rExp      = $db->query("SELECT COUNT(*) c FROM documentos WHERE status='ativo' AND data_expiracao IS NOT NULL AND data_expiracao < '$hoje'");
    $rComp     = $db->query("SELECT COUNT(*) c FROM documentos_compartilhamentos WHERE ativo=1");

    $total    = (int)$rTotal->fetch_assoc()['c'];
    $novosHj  = (int)$rHoje->fetch_assoc()['c'];
    $downloads= (int)$rDow->fetch_assoc()['c'];
    $visu     = (int)$rVis->fetch_assoc()['c'];
    $expirand = (int)$rExp->fetch_assoc()['c'];
    $links    = (int)$rComp->fetch_assoc()['c'];

    // Top 5 mais acessados
    $rTop = $db->query("SELECT d.id, d.nome, d.total_visualizacoes, d.total_downloads,
                               dep.nome AS departamento
                        FROM documentos d
                        LEFT JOIN documentos_departamentos dep ON d.departamento_id = dep.id
                        WHERE d.status = 'ativo'
                        ORDER BY (d.total_visualizacoes + d.total_downloads) DESC
                        LIMIT 5");
    $topDocs = [];
    if ($rTop) while ($r = $rTop->fetch_assoc()) $topDocs[] = $r;

    // Últimos 5 documentos
    $rUlt = $db->query("SELECT d.id, d.nome, d.status, d.created_at,
                               dep.nome AS departamento
                        FROM documentos d
                        LEFT JOIN documentos_departamentos dep ON d.departamento_id = dep.id
                        ORDER BY d.created_at DESC LIMIT 5");
    $ultDocs = [];
    if ($rUlt) while ($r = $rUlt->fetch_assoc()) $ultDocs[] = $r;

    // Últimos 5 acessos
    $rUltAc = $db->query("SELECT a.created_at, a.tipo, a.origem, a.usuario_nome, a.ip,
                                  d.nome AS documento
                           FROM documentos_acessos a
                           LEFT JOIN documentos d ON a.documento_id = d.id
                           ORDER BY a.created_at DESC LIMIT 5");
    $ultAcessos = [];
    if ($rUltAc) while ($r = $rUltAc->fetch_assoc()) $ultAcessos[] = $r;

    retornar_json(true, 'OK', [
        'total_documentos'  => $total,
        'novos_hoje'        => $novosHj,
        'total_downloads'   => $downloads,
        'total_visualizacoes' => $visu,
        'expirando'         => $expirand,
        'links_ativos'      => $links,
        'top_documentos'    => $topDocs,
        'ultimos_documentos' => $ultDocs,
        'ultimos_acessos'   => $ultAcessos,
    ]);
}

// ============================================================
// DEPARTAMENTOS
// ============================================================
function _departamentos_listar($db) {
    $res = $db->query("SELECT d.*, COUNT(doc.id) AS total_documentos
                       FROM documentos_departamentos d
                       LEFT JOIN documentos doc ON doc.departamento_id = d.id AND doc.status != 'excluido'
                       WHERE d.ativo = 1
                       GROUP BY d.id
                       ORDER BY d.nome ASC");
    $rows = [];
    if ($res) while ($r = $res->fetch_assoc()) $rows[] = $r;
    retornar_json(true, 'OK', ['departamentos' => $rows]);
}

function _departamento_salvar($db, $sessao) {
    $id    = (int)($_POST['id'] ?? 0);
    $nome  = _esc($db, $_POST['nome'] ?? '');
    $desc  = _esc($db, $_POST['descricao'] ?? '');
    $icone = _esc($db, $_POST['icone'] ?? 'fas fa-folder');
    $cor   = _esc($db, $_POST['cor']   ?? '#2563eb');

    if (!$nome) retornar_json(false, 'Nome é obrigatório.');

    if ($id) {
        $db->query("UPDATE documentos_departamentos SET nome='$nome', descricao='$desc',
                    icone='$icone', cor='$cor' WHERE id=$id");
        _log($db, $sessao, null, 'edicao', "Departamento editado: $nome");
        retornar_json(true, 'Departamento atualizado.');
    } else {
        $uid = (int)($sessao['id'] ?? 0);
        $db->query("INSERT INTO documentos_departamentos (nome, descricao, icone, cor, criado_por)
                    VALUES ('$nome','$desc','$icone','$cor',$uid)");
        _log($db, $sessao, null, 'criacao', "Departamento criado: $nome");
        retornar_json(true, 'Departamento criado.', ['id' => $db->insert_id]);
    }
}

function _departamento_excluir($db) {
    $id = (int)($_POST['id'] ?? 0);
    if (!$id) retornar_json(false, 'ID inválido.');
    $res = $db->query("SELECT COUNT(*) c FROM documentos WHERE departamento_id=$id AND status!='expirado'");
    if ($res && $res->fetch_assoc()['c'] > 0)
        retornar_json(false, 'Departamento possui documentos vinculados. Remova-os primeiro.');
    $db->query("UPDATE documentos_departamentos SET ativo=0 WHERE id=$id");
    retornar_json(true, 'Departamento removido.');
}

// ============================================================
// GRUPOS
// ============================================================
function _grupos_listar($db) {
    $res = $db->query("SELECT g.*,
                              COUNT(DISTINCT gu.usuario_id) AS total_usuarios,
                              COUNT(DISTINCT gm.morador_id) AS total_moradores
                       FROM documentos_grupos g
                       LEFT JOIN documentos_grupos_usuarios  gu ON gu.grupo_id = g.id
                       LEFT JOIN documentos_grupos_moradores gm ON gm.grupo_id = g.id
                       WHERE g.ativo = 1
                       GROUP BY g.id
                       ORDER BY g.nome ASC");
    $rows = [];
    if ($res) while ($r = $res->fetch_assoc()) $rows[] = $r;
    retornar_json(true, 'OK', ['grupos' => $rows]);
}

function _grupo_membros($db) {
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) retornar_json(false, 'ID inválido.');

    $rU = $db->query("SELECT u.id, u.nome, u.email, 'usuario' AS tipo
                      FROM documentos_grupos_usuarios gu
                      JOIN usuarios u ON u.id = gu.usuario_id
                      WHERE gu.grupo_id = $id");
    $rM = $db->query("SELECT m.id, m.nome, m.email, 'morador' AS tipo
                      FROM documentos_grupos_moradores gm
                      JOIN moradores m ON m.id = gm.morador_id
                      WHERE gm.grupo_id = $id");
    $membros = [];
    if ($rU) while ($r = $rU->fetch_assoc()) $membros[] = $r;
    if ($rM) while ($r = $rM->fetch_assoc()) $membros[] = $r;
    retornar_json(true, 'OK', ['membros' => $membros]);
}

function _grupo_salvar($db, $sessao) {
    $id   = (int)($_POST['id'] ?? 0);
    $nome = _esc($db, $_POST['nome'] ?? '');
    $desc = _esc($db, $_POST['descricao'] ?? '');
    $tipo = _esc($db, $_POST['acesso_tipo'] ?? 'todos');

    if (!$nome) retornar_json(false, 'Nome é obrigatório.');

    if ($id) {
        $db->query("UPDATE documentos_grupos SET nome='$nome',descricao='$desc',acesso_tipo='$tipo' WHERE id=$id");
        retornar_json(true, 'Grupo atualizado.');
    } else {
        $uid = (int)($sessao['id'] ?? 0);
        $db->query("INSERT INTO documentos_grupos (nome,descricao,acesso_tipo,criado_por)
                    VALUES ('$nome','$desc','$tipo',$uid)");
        retornar_json(true, 'Grupo criado.', ['id' => $db->insert_id]);
    }
}

function _grupo_excluir($db) {
    $id = (int)($_POST['id'] ?? 0);
    if (!$id) retornar_json(false, 'ID inválido.');
    $db->query("UPDATE documentos_grupos SET ativo=0 WHERE id=$id");
    retornar_json(true, 'Grupo removido.');
}

function _grupo_membro_add($db) {
    $gid  = (int)($_POST['grupo_id']  ?? 0);
    $uid  = (int)($_POST['usuario_id'] ?? 0);
    $mid  = (int)($_POST['morador_id'] ?? 0);
    if (!$gid) retornar_json(false, 'grupo_id inválido.');

    if ($uid) {
        $db->query("INSERT IGNORE INTO documentos_grupos_usuarios (grupo_id,usuario_id) VALUES ($gid,$uid)");
    }
    if ($mid) {
        $db->query("INSERT IGNORE INTO documentos_grupos_moradores (grupo_id,morador_id) VALUES ($gid,$mid)");
    }
    retornar_json(true, 'Membro adicionado.');
}

function _grupo_membro_remove($db) {
    $gid  = (int)($_POST['grupo_id']  ?? 0);
    $uid  = (int)($_POST['usuario_id'] ?? 0);
    $mid  = (int)($_POST['morador_id'] ?? 0);
    if ($uid) $db->query("DELETE FROM documentos_grupos_usuarios WHERE grupo_id=$gid AND usuario_id=$uid");
    if ($mid) $db->query("DELETE FROM documentos_grupos_moradores WHERE grupo_id=$gid AND morador_id=$mid");
    retornar_json(true, 'Membro removido.');
}

// ============================================================
// PASTAS
// ============================================================
function _pastas_listar($db) {
    $depId = (int)($_GET['departamento_id'] ?? 0);
    $where = $depId ? "WHERE p.ativo=1 AND p.departamento_id=$depId" : "WHERE p.ativo=1";
    $res = $db->query("SELECT p.*, dep.nome AS departamento_nome,
                              pai.nome AS pasta_pai_nome,
                              COUNT(doc.id) AS total_documentos
                       FROM documentos_pastas p
                       LEFT JOIN documentos_departamentos dep ON dep.id = p.departamento_id
                       LEFT JOIN documentos_pastas pai ON pai.id = p.pasta_pai_id
                       LEFT JOIN documentos doc ON doc.pasta_id = p.id
                       $where
                       GROUP BY p.id
                       ORDER BY p.departamento_id, p.pasta_pai_id, p.ordem, p.nome");
    $rows = [];
    if ($res) while ($r = $res->fetch_assoc()) $rows[] = $r;
    retornar_json(true, 'OK', ['pastas' => $rows]);
}

function _pasta_salvar($db, $sessao) {
    $id    = (int)($_POST['id'] ?? 0);
    $nome  = _esc($db, $_POST['nome'] ?? '');
    $depId = (int)($_POST['departamento_id'] ?? 0);
    $paiId = (int)($_POST['pasta_pai_id'] ?? 0);
    $desc  = _esc($db, $_POST['descricao'] ?? '');

    if (!$nome) retornar_json(false, 'Nome é obrigatório.');

    $paiSql = $paiId ? $paiId : 'NULL';
    $depSql = $depId ? $depId : 'NULL';

    if ($id) {
        $db->query("UPDATE documentos_pastas SET nome='$nome',departamento_id=$depSql,
                    pasta_pai_id=$paiSql,descricao='$desc' WHERE id=$id");
        retornar_json(true, 'Pasta atualizada.');
    } else {
        $uid = (int)($sessao['id'] ?? 0);
        $db->query("INSERT INTO documentos_pastas (nome,departamento_id,pasta_pai_id,descricao,criado_por)
                    VALUES ('$nome',$depSql,$paiSql,'$desc',$uid)");
        retornar_json(true, 'Pasta criada.', ['id' => $db->insert_id]);
    }
}

function _pasta_excluir($db) {
    $id = (int)($_POST['id'] ?? 0);
    if (!$id) retornar_json(false, 'ID inválido.');
    $res = $db->query("SELECT COUNT(*) c FROM documentos WHERE pasta_id=$id");
    if ($res && $res->fetch_assoc()['c'] > 0)
        retornar_json(false, 'Pasta contém documentos. Mova-os antes de excluir.');
    $db->query("UPDATE documentos_pastas SET ativo=0 WHERE id=$id");
    retornar_json(true, 'Pasta removida.');
}

// ============================================================
// DOCUMENTOS
// ============================================================
function _documentos_listar($db) {
    $busca  = _esc($db, $_GET['busca'] ?? '');
    $depId  = (int)($_GET['departamento_id'] ?? 0);
    $pastId = (int)($_GET['pasta_id'] ?? 0);
    $status = _esc($db, $_GET['status'] ?? '');
    $grupoId= (int)($_GET['grupo_id'] ?? 0);
    $pag    = max(1, (int)($_GET['pagina'] ?? 1));
    $limit  = 20;
    $offset = ($pag - 1) * $limit;

    $where = "WHERE 1=1";
    if ($busca)  $where .= " AND (d.nome LIKE '%$busca%' OR d.descricao LIKE '%$busca%' OR d.tags LIKE '%$busca%')";
    if ($depId)  $where .= " AND d.departamento_id=$depId";
    if ($pastId) $where .= " AND d.pasta_id=$pastId";
    if ($status) $where .= " AND d.status='$status'";
    if ($grupoId)$where .= " AND d.grupo_id=$grupoId";

    $sqlCount = "SELECT COUNT(*) c FROM documentos d $where";
    $rCount   = $db->query($sqlCount);
    $total    = $rCount ? (int)$rCount->fetch_assoc()['c'] : 0;

    $sql = "SELECT d.*,
                   dep.nome AS departamento_nome, dep.cor AS departamento_cor,
                   p.nome AS pasta_nome,
                   g.nome AS grupo_nome,
                   DATE_FORMAT(d.created_at,'%d/%m/%Y %H:%i') AS criado_em,
                   DATE_FORMAT(d.data_publicacao,'%d/%m/%Y')   AS pub_formatada,
                   DATE_FORMAT(d.data_expiracao,'%d/%m/%Y')    AS exp_formatada
            FROM documentos d
            LEFT JOIN documentos_departamentos dep ON dep.id = d.departamento_id
            LEFT JOIN documentos_pastas p ON p.id = d.pasta_id
            LEFT JOIN documentos_grupos  g ON g.id = d.grupo_id
            $where
            ORDER BY d.created_at DESC
            LIMIT $limit OFFSET $offset";

    $res  = $db->query($sql);
    $rows = [];
    if ($res) while ($r = $res->fetch_assoc()) $rows[] = $r;

    retornar_json(true, 'OK', [
        'documentos'  => $rows,
        'total'       => $total,
        'pagina'      => $pag,
        'total_paginas' => (int)ceil($total / $limit),
    ]);
}

function _documento_carregar($db) {
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) retornar_json(false, 'ID inválido.');

    $res = $db->query("SELECT d.*,
                              dep.nome AS departamento_nome,
                              p.nome AS pasta_nome,
                              g.nome AS grupo_nome,
                              DATE_FORMAT(d.data_publicacao,'%d/%m/%Y') AS pub_formatada,
                              DATE_FORMAT(d.data_expiracao,'%d/%m/%Y')  AS exp_formatada
                       FROM documentos d
                       LEFT JOIN documentos_departamentos dep ON dep.id = d.departamento_id
                       LEFT JOIN documentos_pastas p ON p.id = d.pasta_id
                       LEFT JOIN documentos_grupos  g ON g.id = d.grupo_id
                       WHERE d.id=$id LIMIT 1");

    if (!$res || $res->num_rows === 0) retornar_json(false, 'Documento não encontrado.');
    $doc = $res->fetch_assoc();

    // Últimos 10 acessos deste documento
    $rAc = $db->query("SELECT tipo, origem, usuario_nome, ip,
                               DATE_FORMAT(created_at,'%d/%m/%Y %H:%i') AS data_acesso
                        FROM documentos_acessos WHERE documento_id=$id
                        ORDER BY created_at DESC LIMIT 10");
    $acessos = [];
    if ($rAc) while ($r = $rAc->fetch_assoc()) $acessos[] = $r;

    retornar_json(true, 'OK', ['documento' => $doc, 'acessos' => $acessos]);
}

function _documento_salvar($db, $sessao) {
    $id      = (int)($_POST['id'] ?? 0);
    $nome    = _esc($db, $_POST['nome']    ?? '');
    $desc    = _esc($db, $_POST['descricao'] ?? '');
    $depId   = (int)($_POST['departamento_id'] ?? 0);
    $pastId  = (int)($_POST['pasta_id']   ?? 0);
    $grupoId = (int)($_POST['grupo_id']   ?? 0);
    $tags    = _esc($db, $_POST['tags']   ?? '');
    $linkExt = _esc($db, $_POST['link_externo'] ?? '');
    $status  = _esc($db, $_POST['status'] ?? 'ativo');
    $dataPub = _esc($db, $_POST['data_publicacao'] ?? '');
    $dataExp = _esc($db, $_POST['data_expiracao']  ?? '');
    $uid     = (int)($sessao['id'] ?? 0);

    if (!$nome) retornar_json(false, 'Nome do documento é obrigatório.');

    $depSql  = $depId  ? $depId  : 'NULL';
    $pastSql = $pastId ? $pastId : 'NULL';
    $grupoSql= $grupoId? $grupoId: 'NULL';
    $pubSql  = $dataPub? "'$dataPub'":'NULL';
    $expSql  = $dataExp? "'$dataExp'":'NULL';

    // Upload de arquivo
    $arquivoNovo = '';
    $arquivoTipo = '';
    $arquivoTam  = 0;
    $arquivoOrig = '';

    if (!empty($_FILES['arquivo']['tmp_name'])) {
        $upload = _processar_upload($_FILES['arquivo']);
        if (!$upload['success']) retornar_json(false, $upload['error']);
        $arquivoNovo = _esc($db, $upload['path']);
        $arquivoTipo = _esc($db, $upload['mime']);
        $arquivoTam  = (int)$upload['size'];
        $arquivoOrig = _esc($db, $upload['original']);
    }

    if ($id) {
        $setSql = "nome='$nome', descricao='$desc', departamento_id=$depSql, pasta_id=$pastSql,
                   grupo_id=$grupoSql, tags='$tags', link_externo='$linkExt', status='$status',
                   data_publicacao=$pubSql, data_expiracao=$expSql, atualizado_por=$uid";

        if ($arquivoNovo) {
            // Remover arquivo anterior
            $rOld = $db->query("SELECT arquivo FROM documentos WHERE id=$id");
            if ($rOld) {
                $old = $rOld->fetch_assoc();
                if (!empty($old['arquivo'])) {
                    $oldPath = dirname(__DIR__) . '/uploads/documentos/' . basename($old['arquivo']);
                    if (file_exists($oldPath)) unlink($oldPath);
                }
            }
            $setSql .= ", arquivo='$arquivoNovo', arquivo_tipo='$arquivoTipo',
                          arquivo_tamanho=$arquivoTam, arquivo_nome_original='$arquivoOrig'";
        }

        $db->query("UPDATE documentos SET $setSql WHERE id=$id");
        _log($db, $sessao, $id, 'edicao', "Documento editado: $nome");
        retornar_json(true, 'Documento atualizado com sucesso.');
    } else {
        $arqSql   = $arquivoNovo ? "'$arquivoNovo'" : 'NULL';
        $tipoSql  = $arquivoTipo ? "'$arquivoTipo'" : 'NULL';
        $origSql  = $arquivoOrig ? "'$arquivoOrig'" : 'NULL';

        $db->query("INSERT INTO documentos
                    (nome, descricao, departamento_id, pasta_id, grupo_id, tags,
                     arquivo, arquivo_tipo, arquivo_tamanho, arquivo_nome_original,
                     link_externo, status, data_publicacao, data_expiracao, criado_por, atualizado_por)
                    VALUES ('$nome','$desc',$depSql,$pastSql,$grupoSql,'$tags',
                            $arqSql,$tipoSql,$arquivoTam,$origSql,
                            '$linkExt','$status',$pubSql,$expSql,$uid,$uid)");

        $novoId = $db->insert_id;
        _log($db, $sessao, $novoId, 'criacao', "Documento criado: $nome");

        // Notificação por e-mail (opcional — integra ao sistema existente)
        _notificar_novo_documento($db, $novoId, $nome, $grupoId, $uid);

        retornar_json(true, 'Documento cadastrado com sucesso.', ['id' => $novoId]);
    }
}

function _processar_upload(array $file): array {
    $tipos_permitidos = [
        'application/pdf', 'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp',
        'application/zip', 'application/x-zip-compressed',
        'text/plain',
    ];

    $exts_permitidas = ['pdf','doc','docx','xls','xlsx','ppt','pptx','png','jpg','jpeg','gif','webp','zip','txt'];

    $limite_bytes = 50 * 1024 * 1024; // 50 MB

    if ($file['error'] !== UPLOAD_ERR_OK)
        return ['success' => false, 'error' => 'Erro no upload: código ' . $file['error']];

    if ($file['size'] > $limite_bytes)
        return ['success' => false, 'error' => 'Arquivo muito grande. Limite: 50 MB.'];

    $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    if (!in_array($ext, $exts_permitidas))
        return ['success' => false, 'error' => "Tipo de arquivo .$ext não permitido."];

    // Validar MIME via finfo
    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime  = $finfo->file($file['tmp_name']);
    if (!in_array($mime, $tipos_permitidos))
        return ['success' => false, 'error' => "Tipo MIME não permitido: $mime."];

    $dir = dirname(__DIR__) . '/uploads/documentos';
    if (!is_dir($dir)) mkdir($dir, 0755, true);

    $nomeUnico = uniqid('doc_', true) . '.' . $ext;
    $destino   = $dir . '/' . $nomeUnico;

    if (!move_uploaded_file($file['tmp_name'], $destino))
        return ['success' => false, 'error' => 'Falha ao salvar o arquivo no servidor.'];

    return [
        'success'  => true,
        'path'     => $nomeUnico,
        'mime'     => $mime,
        'size'     => $file['size'],
        'original' => $file['name'],
    ];
}

function _documento_excluir($db, $sessao) {
    $id = (int)($_POST['id'] ?? 0);
    if (!$id) retornar_json(false, 'ID inválido.');

    $res = $db->query("SELECT nome, arquivo FROM documentos WHERE id=$id LIMIT 1");
    if (!$res || $res->num_rows === 0) retornar_json(false, 'Documento não encontrado.');
    $doc = $res->fetch_assoc();

    // Marcar como inativo (soft delete) e remover arquivo físico
    $db->query("UPDATE documentos SET status='expirado' WHERE id=$id");

    if (!empty($doc['arquivo'])) {
        $path = dirname(__DIR__) . '/uploads/documentos/' . basename($doc['arquivo']);
        if (file_exists($path)) unlink($path);
    }

    _log($db, $sessao, $id, 'exclusao', "Documento excluído: " . $doc['nome']);
    retornar_json(true, 'Documento excluído com sucesso.');
}

// ============================================================
// DOWNLOAD (autenticado, registra acesso)
// ============================================================
function _download($db, $sessao) {
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) retornar_json(false, 'ID inválido.');

    $res = $db->query("SELECT * FROM documentos WHERE id=$id AND status='ativo' LIMIT 1");
    if (!$res || $res->num_rows === 0) retornar_json(false, 'Documento não disponível.');
    $doc = $res->fetch_assoc();

    if (empty($doc['arquivo'])) {
        // Sem arquivo físico — retornar link externo
        retornar_json(true, 'OK', ['link_externo' => $doc['link_externo']]);
    }

    $path = dirname(__DIR__) . '/uploads/documentos/' . basename($doc['arquivo']);
    if (!file_exists($path)) retornar_json(false, 'Arquivo não encontrado no servidor.');

    _registrar_acesso($db, $sessao, $id, 'download', 'interno');
    _log($db, $sessao, $id, 'download', "Download: " . $doc['nome']);

    if (ob_get_length()) ob_clean();
    header('Content-Type: ' . ($doc['arquivo_tipo'] ?: 'application/octet-stream'));
    header('Content-Disposition: attachment; filename="' . rawurlencode($doc['arquivo_nome_original'] ?: basename($doc['arquivo'])) . '"');
    header('Content-Length: ' . filesize($path));
    header('Cache-Control: private, no-cache');
    readfile($path);
    exit;
}

// ============================================================
// COMPARTILHAMENTOS
// ============================================================
function _compartilhamentos_listar($db) {
    $docId = (int)($_GET['documento_id'] ?? 0);
    $where = $docId ? "WHERE c.documento_id=$docId" : "WHERE 1=1";
    $res = $db->query("SELECT c.*, d.nome AS documento_nome,
                              DATE_FORMAT(c.expira_em,'%d/%m/%Y %H:%i') AS expira_formatado,
                              DATE_FORMAT(c.created_at,'%d/%m/%Y %H:%i') AS criado_em
                       FROM documentos_compartilhamentos c
                       JOIN documentos d ON d.id = c.documento_id
                       $where
                       ORDER BY c.created_at DESC LIMIT 50");
    $rows = [];
    if ($res) while ($r = $res->fetch_assoc()) {
        // Montar URL pública
        $proto = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on') ? 'https' : 'http';
        $host  = $_SERVER['HTTP_HOST'] ?? 'localhost';
        $r['url'] = "$proto://$host/doc.php?t=" . $r['token'];
        $rows[] = $r;
    }
    retornar_json(true, 'OK', ['compartilhamentos' => $rows]);
}

function _compartilhamento_gerar($db, $sessao) {
    $docId      = (int)($_POST['documento_id'] ?? 0);
    $desc       = _esc($db, $_POST['descricao'] ?? '');
    $expira     = _esc($db, $_POST['expira_em'] ?? '');
    $limite     = (int)($_POST['limite_acessos'] ?? 0);
    $uid        = (int)($sessao['id'] ?? 0);

    if (!$docId) retornar_json(false, 'documento_id é obrigatório.');

    // Verificar se documento existe e está ativo
    $res = $db->query("SELECT id, nome FROM documentos WHERE id=$docId AND status='ativo' LIMIT 1");
    if (!$res || $res->num_rows === 0) retornar_json(false, 'Documento não encontrado ou inativo.');
    $doc = $res->fetch_assoc();

    $token    = bin2hex(random_bytes(24)); // 48 chars
    $expSql   = $expira ? "'$expira'" : 'NULL';
    $limSql   = $limite ? $limite : 'NULL';

    $db->query("INSERT INTO documentos_compartilhamentos
                (documento_id, token, descricao, expira_em, limite_acessos, criado_por)
                VALUES ($docId,'$token','$desc',$expSql,$limSql,$uid)");

    $proto = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on') ? 'https' : 'http';
    $host  = $_SERVER['HTTP_HOST'] ?? 'localhost';
    $url   = "$proto://$host/doc.php?t=$token";

    _log($db, $sessao, $docId, 'compartilhamento', "Link criado para: " . $doc['nome']);

    retornar_json(true, 'Link de compartilhamento criado.', [
        'token' => $token,
        'url'   => $url,
    ]);
}

function _compartilhamento_desativar($db) {
    $id = (int)($_POST['id'] ?? 0);
    if (!$id) retornar_json(false, 'ID inválido.');
    $db->query("UPDATE documentos_compartilhamentos SET ativo=0 WHERE id=$id");
    retornar_json(true, 'Link desativado com sucesso.');
}

// ============================================================
// ACESSOS
// ============================================================
function _acessos_listar($db) {
    $docId  = (int)($_GET['documento_id'] ?? 0);
    $pag    = max(1, (int)($_GET['pagina'] ?? 1));
    $limit  = 30;
    $offset = ($pag - 1) * $limit;
    $where  = $docId ? "WHERE a.documento_id=$docId" : "WHERE 1=1";

    $rCount = $db->query("SELECT COUNT(*) c FROM documentos_acessos a $where");
    $total  = $rCount ? (int)$rCount->fetch_assoc()['c'] : 0;

    $res = $db->query("SELECT a.*, d.nome AS documento_nome,
                              DATE_FORMAT(a.created_at,'%d/%m/%Y %H:%i') AS data_acesso
                       FROM documentos_acessos a
                       LEFT JOIN documentos d ON d.id = a.documento_id
                       $where
                       ORDER BY a.created_at DESC
                       LIMIT $limit OFFSET $offset");
    $rows = [];
    if ($res) while ($r = $res->fetch_assoc()) $rows[] = $r;

    retornar_json(true, 'OK', [
        'acessos'       => $rows,
        'total'         => $total,
        'pagina'        => $pag,
        'total_paginas' => (int)ceil($total / $limit),
    ]);
}

// ============================================================
// LOGS
// ============================================================
function _logs_listar($db) {
    $docId = (int)($_GET['documento_id'] ?? 0);
    $pag   = max(1, (int)($_GET['pagina'] ?? 1));
    $limit = 30;
    $offset= ($pag - 1) * $limit;
    $where = $docId ? "WHERE l.documento_id=$docId" : "WHERE 1=1";

    $rCount = $db->query("SELECT COUNT(*) c FROM documentos_logs l $where");
    $total  = $rCount ? (int)$rCount->fetch_assoc()['c'] : 0;

    $res = $db->query("SELECT l.*, d.nome AS documento_nome, u.nome AS usuario_nome,
                              DATE_FORMAT(l.created_at,'%d/%m/%Y %H:%i') AS data_log
                       FROM documentos_logs l
                       LEFT JOIN documentos d ON d.id = l.documento_id
                       LEFT JOIN usuarios   u ON u.id = l.usuario_id
                       $where
                       ORDER BY l.created_at DESC
                       LIMIT $limit OFFSET $offset");
    $rows = [];
    if ($res) while ($r = $res->fetch_assoc()) $rows[] = $r;

    retornar_json(true, 'OK', [
        'logs'          => $rows,
        'total'         => $total,
        'pagina'        => $pag,
        'total_paginas' => (int)ceil($total / $limit),
    ]);
}

// ============================================================
// NOTIFICAÇÃO DE NOVO DOCUMENTO (integra ao EmailSender)
// ============================================================
function _notificar_novo_documento($db, int $docId, string $nomeDoc, int $grupoId, int $criadoPor): void {
    // Somente disparar se o grupo NÃO for "Todos" (grupo 1) — grupos específicos são notificados
    if (!$grupoId || $grupoId === 1) return;

    try {
        require_once __DIR__ . '/EmailSender.php';

        $rGrupo = $db->query("SELECT nome FROM documentos_grupos WHERE id=$grupoId LIMIT 1");
        $grupo  = $rGrupo ? ($rGrupo->fetch_assoc()['nome'] ?? 'Todos') : 'Todos';

        $rDep = $db->query("SELECT dep.nome FROM documentos d
                             LEFT JOIN documentos_departamentos dep ON dep.id = d.departamento_id
                             WHERE d.id=$docId LIMIT 1");
        $depto = $rDep ? ($rDep->fetch_assoc()['nome'] ?? '') : '';

        $corpo = "
<div style='font-family:Arial,sans-serif;background:#f1f5f9;padding:24px'>
<div style='max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)'>
  <div style='background:linear-gradient(135deg,#2563eb,#1e40af);color:#fff;padding:24px;text-align:center'>
    <h2 style='margin:0'><i class='fas fa-folder-open'></i> Novo Documento Disponível</h2>
  </div>
  <div style='padding:28px'>
    <p>Um novo documento foi publicado no sistema:</p>
    <table style='width:100%;border-collapse:collapse;font-size:14px'>
      <tr><td style='padding:8px 12px;color:#64748b;width:140px'>Documento:</td><td style='padding:8px 12px;font-weight:600'>$nomeDoc</td></tr>
      <tr style='background:#f8fafc'><td style='padding:8px 12px;color:#64748b'>Departamento:</td><td style='padding:8px 12px'>$depto</td></tr>
      <tr><td style='padding:8px 12px;color:#64748b'>Grupo de Acesso:</td><td style='padding:8px 12px'>$grupo</td></tr>
    </table>
    <div style='text-align:center;margin-top:20px'>
      <a href='#' style='background:#2563eb;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600'>
        Acessar Documento
      </a>
    </div>
  </div>
  <div style='text-align:center;padding:16px;font-size:12px;color:#94a3b8'>
    Sistema ERP Condomínio — E-mail automático, não responda.
  </div>
</div></div>";

        // Buscar administradores do grupo para notificar
        $rUsuarios = $db->query("SELECT u.email, u.nome
                                 FROM documentos_grupos_usuarios gu
                                 JOIN usuarios u ON u.id = gu.usuario_id
                                 WHERE gu.grupo_id=$grupoId AND u.email != '' LIMIT 50");
        if ($rUsuarios) {
            $sender = new EmailSender($db, false);
            while ($u = $rUsuarios->fetch_assoc()) {
                try {
                    $sender->enviar($u['email'], "Novo documento disponível: $nomeDoc", $corpo, $u['nome']);
                } catch (\Throwable $e) {
                    error_log('[DocumentosGED] Erro ao notificar ' . $u['email'] . ': ' . $e->getMessage());
                }
            }
        }
    } catch (\Throwable $e) {
        error_log('[DocumentosGED] Erro na notificação: ' . $e->getMessage());
    }
}
