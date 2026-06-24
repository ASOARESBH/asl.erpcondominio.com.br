<?php
/**
 * API Unificada — E-mail e Alertas
 * Gerencia configuração SMTP, provedores, teste de conexão,
 * alertas configuráveis e log de envios.
 *
 * Ações disponíveis:
 *   GET  ?acao=smtp_carregar
 *   POST acao=smtp_salvar
 *   POST acao=smtp_testar
 *   GET  ?acao=alertas_listar[&modulo=xxx]
 *   POST acao=alerta_salvar
 *   POST acao=alerta_toggle   (ativar/desativar)
 *   GET  ?acao=log_listar[&pagina=N&tipo=xxx&status=xxx]
 *   POST acao=log_limpar
 *   GET  ?acao=provedores_listar
 */

ob_start();
error_reporting(E_ALL);
ini_set('display_errors', 0);

require_once __DIR__ . '/email_error_logger.php';
email_error_install_shutdown_handler();

require_once 'config.php';
require_once 'auth_helper.php';

if (!function_exists('retornar_json')) {
    function retornar_json($sucesso, $mensagem, $dados = null) {
        if (ob_get_length()) ob_clean();
        header('Content-Type: application/json; charset=utf-8');
        $r = ['sucesso' => $sucesso, 'mensagem' => $mensagem];
        if ($dados !== null) $r['dados'] = $dados;
        echo json_encode($r, JSON_UNESCAPED_UNICODE);
        exit;
    }
}

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }

// Autenticação
verificarAutenticacao();

$conexao = conectar_banco();
if (!$conexao) retornar_json(false, 'Erro ao conectar ao banco de dados');
mysqli_set_charset($conexao, 'utf8mb4');

// Criar tabelas se não existirem
_criar_tabelas($conexao);

$acao = $_GET['acao'] ?? $_POST['acao'] ?? '';
$metodo = $_SERVER['REQUEST_METHOD'];

// Roteamento
switch ($acao) {
    case 'smtp_carregar':    _smtp_carregar($conexao);    break;
    case 'smtp_salvar':      _smtp_salvar($conexao);      break;
    case 'smtp_testar':      _smtp_testar($conexao);      break;
    case 'alertas_listar':   _alertas_listar($conexao);   break;
    case 'alerta_salvar':    _alerta_salvar($conexao);    break;
    case 'alerta_toggle':    _alerta_toggle($conexao);    break;
    case 'log_listar':       _log_listar($conexao);       break;
    case 'log_limpar':       _log_limpar($conexao);       break;
    case 'provedores_listar':_provedores_listar();        break;
    default:
        retornar_json(false, "Ação '$acao' não reconhecida.");
}

// ============================================================
// CRIAÇÃO AUTOMÁTICA DE TABELAS
// ============================================================
function _criar_tabelas($db) {
    // configuracao_smtp
    mysqli_query($db, "CREATE TABLE IF NOT EXISTS `configuracao_smtp` (
        `id`               INT(11)      NOT NULL AUTO_INCREMENT,
        `provedor`         VARCHAR(50)  NOT NULL DEFAULT 'custom',
        `smtp_host`        VARCHAR(255) NOT NULL DEFAULT '',
        `smtp_port`        INT(11)      NOT NULL DEFAULT 587,
        `smtp_usuario`     VARCHAR(255) NOT NULL DEFAULT '',
        `smtp_senha`       VARCHAR(255) NOT NULL DEFAULT '',
        `smtp_de_email`    VARCHAR(255) NOT NULL DEFAULT '',
        `smtp_de_nome`     VARCHAR(255) NOT NULL DEFAULT 'Sistema ERP',
        `smtp_seguranca`   ENUM('tls','ssl','none') NOT NULL DEFAULT 'tls',
        `smtp_ativo`       TINYINT(1)   NOT NULL DEFAULT 1,
        `timeout`          INT(11)      NOT NULL DEFAULT 30,
        `data_criacao`     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        `data_atualizacao` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (`id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Migração: adicionar colunas novas se não existirem
    $cols = [];
    $res = mysqli_query($db, "DESCRIBE configuracao_smtp");
    while ($r = mysqli_fetch_assoc($res)) $cols[] = $r['Field'];
    if (!in_array('provedor', $cols))
        mysqli_query($db, "ALTER TABLE configuracao_smtp ADD COLUMN `provedor` VARCHAR(50) NOT NULL DEFAULT 'custom' AFTER `id`");
    if (!in_array('timeout', $cols))
        mysqli_query($db, "ALTER TABLE configuracao_smtp ADD COLUMN `timeout` INT(11) NOT NULL DEFAULT 30 AFTER `smtp_seguranca`");
    // Providers de e-mail (Brevo / Resend / SMTP)
    if (!in_array('email_provider', $cols))
        mysqli_query($db, "ALTER TABLE configuracao_smtp ADD COLUMN `email_provider` ENUM('brevo','resend','smtp') NOT NULL DEFAULT 'brevo' AFTER `smtp_ativo`");
    if (!in_array('api_key', $cols))
        mysqli_query($db, "ALTER TABLE configuracao_smtp ADD COLUMN `api_key` VARCHAR(1024) DEFAULT NULL AFTER `email_provider`");
    if (!in_array('sender_email', $cols))
        mysqli_query($db, "ALTER TABLE configuracao_smtp ADD COLUMN `sender_email` VARCHAR(255) DEFAULT NULL AFTER `api_key`");
    if (!in_array('sender_name', $cols))
        mysqli_query($db, "ALTER TABLE configuracao_smtp ADD COLUMN `sender_name` VARCHAR(255) DEFAULT NULL AFTER `sender_email`");
    // Instalações existentes com SMTP configurado → preservar como 'smtp'
    mysqli_query($db, "UPDATE configuracao_smtp SET email_provider='smtp' WHERE email_provider='brevo' AND smtp_host!='' AND smtp_usuario!=''");

    // email_alertas
    mysqli_query($db, "CREATE TABLE IF NOT EXISTS `email_alertas` (
        `id`                  INT(11)      NOT NULL AUTO_INCREMENT,
        `codigo`              VARCHAR(80)  NOT NULL,
        `modulo`              VARCHAR(50)  NOT NULL,
        `evento`              VARCHAR(80)  NOT NULL,
        `nome`                VARCHAR(150) NOT NULL,
        `descricao`           TEXT,
        `ativo`               TINYINT(1)   NOT NULL DEFAULT 0,
        `assunto`             VARCHAR(255) NOT NULL DEFAULT '',
        `corpo_html`          LONGTEXT,
        `variaveis`           TEXT,
        `destinatario_tipo`   ENUM('morador','admin','email_fixo','todos_admins') NOT NULL DEFAULT 'admin',
        `destinatario_email`  VARCHAR(255) DEFAULT NULL,
        `cc_emails`           TEXT,
        `data_criacao`        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        `data_atualizacao`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (`id`),
        UNIQUE KEY `uk_codigo` (`codigo`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // email_log
    mysqli_query($db, "CREATE TABLE IF NOT EXISTS `email_log` (
        `id`              INT(11)      NOT NULL AUTO_INCREMENT,
        `alerta_codigo`   VARCHAR(80)  DEFAULT NULL,
        `morador_id`      INT(11)      DEFAULT NULL,
        `destinatario`    VARCHAR(255) NOT NULL,
        `assunto`         VARCHAR(255) NOT NULL,
        `tipo`            VARCHAR(80)  NOT NULL,
        `status`          ENUM('enviado','erro','pendente') NOT NULL DEFAULT 'pendente',
        `erro_mensagem`   TEXT,
        `dados_contexto`  TEXT,
        `data_envio`      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (`id`),
        KEY `idx_alerta` (`alerta_codigo`),
        KEY `idx_status` (`status`),
        KEY `idx_data`   (`data_envio`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Migração email_log
    $cols2 = [];
    $res2 = mysqli_query($db, "DESCRIBE email_log");
    while ($r = mysqli_fetch_assoc($res2)) $cols2[] = $r['Field'];
    if (!in_array('alerta_codigo', $cols2))
        mysqli_query($db, "ALTER TABLE email_log ADD COLUMN `alerta_codigo` VARCHAR(80) DEFAULT NULL AFTER `id`");
    if (!in_array('dados_contexto', $cols2))
        mysqli_query($db, "ALTER TABLE email_log ADD COLUMN `dados_contexto` TEXT DEFAULT NULL AFTER `erro_mensagem`");
    if (!in_array('provider', $cols2))
        mysqli_query($db, "ALTER TABLE email_log ADD COLUMN `provider` VARCHAR(50) DEFAULT NULL AFTER `status`");
    if (!in_array('message_id', $cols2))
        mysqli_query($db, "ALTER TABLE email_log ADD COLUMN `message_id` VARCHAR(255) DEFAULT NULL AFTER `provider`");
    if (!in_array('response_code', $cols2))
        mysqli_query($db, "ALTER TABLE email_log ADD COLUMN `response_code` INT DEFAULT NULL AFTER `message_id`");
    if (!in_array('erro_detalhado', $cols2))
        mysqli_query($db, "ALTER TABLE email_log ADD COLUMN `erro_detalhado` TEXT DEFAULT NULL AFTER `response_code`");

    // Inserir alertas padrão
    _inserir_alertas_padrao($db);
}

function _inserir_alertas_padrao($db) {
    $alertas = [
        ['sistema.reset_senha','sistema','reset_senha','Reset de Senha',
         'Enviado ao usuário quando solicita redefinição de senha.',1,
         'Redefinição de Senha — {{sistema_nome}}',
         'morador','["nome_usuario","link_reset","expira_em","sistema_nome","logo_url","data_envio"]'],

        ['sistema.novo_usuario','sistema','novo_usuario','Boas-vindas — Novo Usuário',
         'Enviado quando um novo usuário é cadastrado no sistema.',0,
         'Bem-vindo ao {{sistema_nome}}!',
         'morador','["nome_usuario","email_usuario","perfil_usuario","link_sistema","sistema_nome","logo_url","data_envio"]'],

        ['hidrometro.leitura_realizada','hidrometro','leitura_realizada','Leitura Realizada — Notificação ao Morador',
         'Enviado ao morador após o lançamento da leitura do hidrômetro.',0,
         'Leitura do Hidrômetro — {{mes_referencia}} — {{sistema_nome}}',
         'morador','["nome_morador","unidade","numero_hidrometro","leitura_anterior","leitura_atual","consumo","valor_total","data_leitura","mes_referencia","sistema_nome","logo_url","data_envio"]'],

        ['hidrometro.consumo_alto','hidrometro','consumo_alto','Alerta de Consumo Elevado',
         'Enviado ao admin quando o consumo excede o limite configurado.',0,
         '⚠️ Consumo Elevado — Unidade {{unidade}} — {{sistema_nome}}',
         'admin','["nome_morador","unidade","consumo","limite","sistema_nome","logo_url","data_envio"]'],

        ['financeiro.conta_vencendo','financeiro','conta_vencendo','Conta a Vencer em Breve',
         'Enviado ao admin X dias antes do vencimento de uma conta a pagar.',0,
         '⏰ Conta Vencendo em {{dias_para_vencer}} dias — {{sistema_nome}}',
         'todos_admins','["fornecedor","descricao","data_vencimento","valor","dias_para_vencer","sistema_nome","logo_url","data_envio"]'],

        ['financeiro.conta_vencida','financeiro','conta_vencida','Conta Vencida',
         'Enviado ao admin quando uma conta a pagar vence sem pagamento.',0,
         '🔴 Conta Vencida — {{fornecedor}} — {{sistema_nome}}',
         'todos_admins','["fornecedor","descricao","data_vencimento","valor","sistema_nome","logo_url","data_envio"]'],

        ['acesso.visitante_registrado','acesso','visitante_registrado','Visitante Registrado',
         'Enviado ao morador quando um visitante é registrado para sua unidade.',0,
         '🔔 Visitante Registrado — Unidade {{unidade}} — {{sistema_nome}}',
         'morador','["nome_morador","unidade","nome_visitante","documento_visitante","data_hora","operador","sistema_nome","logo_url","data_envio"]'],

        ['rh.aniversario_colaborador','rh','aniversario_colaborador','Aniversário de Colaborador',
         'Enviado ao admin com a lista de colaboradores aniversariantes do dia.',0,
         '🎂 Aniversariantes do Dia — {{sistema_nome}}',
         'todos_admins','["lista_aniversariantes","sistema_nome","logo_url","data_envio"]'],

        ['moradores.cadastro_novo','moradores','cadastro_novo','Boas-vindas ao Morador',
         'Enviado ao morador quando seu cadastro é criado no sistema.',0,
         'Bem-vindo ao {{sistema_nome}}!',
         'morador','["nome_morador","unidade","cpf","sistema_nome","logo_url","data_envio"]'],
    ];

    foreach ($alertas as $a) {
        $codigo = mysqli_real_escape_string($db, $a[0]);
        $modulo = mysqli_real_escape_string($db, $a[1]);
        $evento = mysqli_real_escape_string($db, $a[2]);
        $nome   = mysqli_real_escape_string($db, $a[3]);
        $desc   = mysqli_real_escape_string($db, $a[4]);
        $ativo  = (int)$a[5];
        $assunto= mysqli_real_escape_string($db, $a[6]);
        $dest   = mysqli_real_escape_string($db, $a[7]);
        $vars   = mysqli_real_escape_string($db, $a[8]);
        mysqli_query($db, "INSERT IGNORE INTO email_alertas
            (codigo,modulo,evento,nome,descricao,ativo,assunto,variaveis,destinatario_tipo)
            VALUES ('$codigo','$modulo','$evento','$nome','$desc',$ativo,'$assunto','$vars','$dest')");
    }
}

// ============================================================
// SMTP — CARREGAR
// ============================================================
function _smtp_carregar($db) {
    $res    = mysqli_query($db, "SELECT * FROM configuracao_smtp ORDER BY id DESC LIMIT 1");
    $config = $res ? mysqli_fetch_assoc($res) : null;
    if ($config) {
        // Mascarar senha SMTP
        $config['smtp_senha_mascarada'] = str_repeat('*', min(8, strlen($config['smtp_senha'])));
        $config['smtp_senha'] = '';

        // Mascarar API Key
        if (!empty($config['api_key'])) {
            require_once __DIR__ . '/email/EmailCrypto.php';
            try {
                $plain = EmailCrypto::decrypt($config['api_key']);
                $config['api_key_mask'] = EmailCrypto::mask($plain);
            } catch (Throwable $e) {
                $config['api_key_mask'] = '••••••••';
            }
        } else {
            $config['api_key_mask'] = '';
        }
        $config['api_key'] = ''; // nunca expor a chave real
    }
    retornar_json(true, 'OK', $config);
}

// ============================================================
// SMTP — SALVAR
// ============================================================
function _smtp_salvar($db) {
    require_once __DIR__ . '/email/EmailCrypto.php';

    $emailProvider = $_POST['email_provider'] ?? 'smtp';
    if (!in_array($emailProvider, ['brevo','resend','smtp'], true)) $emailProvider = 'smtp';

    $provedor   = mysqli_real_escape_string($db, $_POST['provedor']      ?? 'custom');
    $host       = mysqli_real_escape_string($db, $_POST['smtp_host']     ?? '');
    $port       = (int)($_POST['smtp_port']  ?? 587);
    $usuario    = mysqli_real_escape_string($db, $_POST['smtp_usuario']  ?? '');
    $de_email   = mysqli_real_escape_string($db, $_POST['smtp_de_email'] ?? '');
    $de_nome    = mysqli_real_escape_string($db, $_POST['smtp_de_nome']  ?? 'Sistema ERP');
    $seguranca  = in_array($_POST['smtp_seguranca'] ?? 'tls', ['tls','ssl','none'])
                  ? $_POST['smtp_seguranca'] : 'tls';
    $timeout    = (int)($_POST['timeout'] ?? 30);
    $nova_senha = $_POST['smtp_senha'] ?? '';

    // Campos API
    $nova_api_key   = $_POST['api_key']     ?? '';
    $sender_email   = mysqli_real_escape_string($db, $_POST['sender_email'] ?? '');
    $sender_name    = mysqli_real_escape_string($db, $_POST['sender_name']  ?? '');

    // Validação por provider
    if ($emailProvider === 'brevo' || $emailProvider === 'resend') {
        if (empty($sender_email) || !filter_var($sender_email, FILTER_VALIDATE_EMAIL))
            retornar_json(false, 'E-mail remetente inválido ou ausente.');
        if (empty($sender_name))
            retornar_json(false, 'Nome do remetente é obrigatório.');
    } else {
        if (empty($host) || empty($usuario) || empty($de_email))
            retornar_json(false, 'Preencha os campos obrigatórios: Host, Usuário e E-mail de Envio.');
    }

    // Busca registro existente
    $res       = mysqli_query($db, "SELECT id, smtp_senha, api_key FROM configuracao_smtp ORDER BY id DESC LIMIT 1");
    $existente = $res ? mysqli_fetch_assoc($res) : null;

    // Preservar senha se não alterada
    $senha_final = !empty($nova_senha)
        ? mysqli_real_escape_string($db, $nova_senha)
        : ($existente ? mysqli_real_escape_string($db, $existente['smtp_senha']) : '');

    // Criptografar API Key se nova foi fornecida; preservar existente caso contrário
    $api_key_final = '';
    if (!empty($nova_api_key)) {
        try {
            $api_key_final = mysqli_real_escape_string($db, EmailCrypto::encrypt($nova_api_key));
        } catch (Throwable $e) {
            $api_key_final = mysqli_real_escape_string($db, $nova_api_key);
        }
    } elseif ($existente && !empty($existente['api_key'])) {
        $api_key_final = mysqli_real_escape_string($db, $existente['api_key']);
    }

    $ep         = mysqli_real_escape_string($db, $emailProvider);
    $api_esc    = $api_key_final !== '' ? "'$api_key_final'" : 'NULL';
    $se_esc     = $sender_email  !== '' ? "'$sender_email'"  : 'NULL';
    $sn_esc     = $sender_name   !== '' ? "'$sender_name'"   : 'NULL';

    if ($existente) {
        $id  = (int)$existente['id'];
        $sql = "UPDATE configuracao_smtp SET
            email_provider='$ep', api_key=$api_esc,
            sender_email=$se_esc, sender_name=$sn_esc,
            provedor='$provedor', smtp_host='$host', smtp_port=$port,
            smtp_usuario='$usuario', smtp_senha='$senha_final',
            smtp_de_email='$de_email', smtp_de_nome='$de_nome',
            smtp_seguranca='$seguranca', timeout=$timeout, smtp_ativo=1
            WHERE id=$id";
    } else {
        $sql = "INSERT INTO configuracao_smtp
            (email_provider,api_key,sender_email,sender_name,
             provedor,smtp_host,smtp_port,smtp_usuario,smtp_senha,
             smtp_de_email,smtp_de_nome,smtp_seguranca,timeout,smtp_ativo)
            VALUES ('$ep',$api_esc,$se_esc,$sn_esc,
             '$provedor','$host',$port,'$usuario','$senha_final',
             '$de_email','$de_nome','$seguranca',$timeout,1)";
    }

    if (mysqli_query($db, $sql)) {
        retornar_json(true, 'Configuração salva com sucesso!');
    } else {
        retornar_json(false, 'Erro ao salvar: ' . mysqli_error($db));
    }
}

// ============================================================
// SMTP — TESTAR CONEXÃO
// ============================================================
function _smtp_testar($db) {
    $email_teste = $_POST['email_teste'] ?? '';
    email_error_log('INFO', 'SMTP test started', [
        'email_teste' => $email_teste,
    ]);
    if (empty($email_teste) || !filter_var($email_teste, FILTER_VALIDATE_EMAIL)) {
        email_error_log('WARNING', 'SMTP test rejected: invalid destination', [
            'email_teste' => $email_teste,
        ]);
        retornar_json(false, 'Informe um e-mail válido para o teste.');
    }

    // Carregar configuração
    $res = mysqli_query($db, "SELECT * FROM configuracao_smtp WHERE smtp_ativo=1 ORDER BY id DESC LIMIT 1");
    $cfg = $res ? mysqli_fetch_assoc($res) : null;
    if (!$cfg) {
        email_error_log('ERROR', 'Email test failed: no active configuration', [
            'email_teste' => $email_teste,
            'mysql_error' => mysqli_error($db),
        ]);
        retornar_json(false, 'Nenhuma configuração de e-mail ativa encontrada. Salve a configuração primeiro.');
    }

    // Tentar enviar usando EmailSender
    if (!file_exists(__DIR__ . '/EmailSender.php')) {
        email_error_log('ERROR', 'SMTP test failed: EmailSender.php not found', [
            'path' => __DIR__ . '/EmailSender.php',
            'email_teste' => $email_teste,
        ]);
        retornar_json(false, 'Classe EmailSender não encontrada. Verifique se o PHPMailer está instalado.');
    }

    try {
        require_once __DIR__ . '/EmailSender.php';
        $sender = new EmailSender($db, true);
        $resultado = $sender->enviar(
            $email_teste,
            'Teste de Conexão SMTP — ' . date('d/m/Y H:i'),
            '<div style="font-family:Arial,sans-serif;padding:24px;background:#f8fafc;border-radius:8px">
                <h2 style="color:#1e3a8a">✅ Conexão SMTP funcionando!</h2>
                <p style="color:#334155">Este é um e-mail de teste enviado pelo sistema ERP Serra da Liberdade.</p>
                <p style="color:#64748b;font-size:13px">Enviado em: ' . date('d/m/Y H:i:s') . '</p>
            </div>'
        );

        // Registrar no log
        $dest = mysqli_real_escape_string($db, $email_teste);
        mysqli_query($db, "INSERT INTO email_log (alerta_codigo,destinatario,assunto,tipo,status)
            VALUES ('smtp.teste','$dest','Teste de Conexão SMTP','teste','enviado')");

        email_error_log('INFO', 'SMTP test sent successfully', [
            'email_teste' => $email_teste,
            'smtp' => [
                'host' => $cfg['smtp_host'],
                'port' => $cfg['smtp_port'],
                'usuario' => $cfg['smtp_usuario'] ?? null,
                'de_email' => $cfg['smtp_de_email'] ?? null,
                'seguranca' => $cfg['smtp_seguranca'] ?? null,
                'timeout' => $cfg['timeout'] ?? null,
            ],
        ]);

        $provider = $cfg['email_provider'] ?? 'smtp';
        retornar_json(true, 'E-mail de teste enviado com sucesso para ' . $email_teste . '!', [
            'destinatario' => $email_teste,
            'provider'     => $provider,
            'host'         => ($provider === 'smtp') ? ($cfg['smtp_host'] ?? null) : null,
            'porta'        => ($provider === 'smtp') ? ($cfg['smtp_port'] ?? null) : null,
        ]);
    } catch (Throwable $e) {
        // Registrar erro no log
        $dest  = mysqli_real_escape_string($db, $email_teste);
        $erro  = mysqli_real_escape_string($db, $e->getMessage());
        mysqli_query($db, "INSERT INTO email_log (alerta_codigo,destinatario,assunto,tipo,status,erro_mensagem)
            VALUES ('smtp.teste','$dest','Teste de Conexão SMTP','teste','erro','$erro')");

        email_error_log_exception('ERROR', 'SMTP test failed', $e, [
            'email_teste' => $email_teste,
            'smtp' => [
                'host' => $cfg['smtp_host'] ?? null,
                'port' => $cfg['smtp_port'] ?? null,
                'usuario' => $cfg['smtp_usuario'] ?? null,
                'de_email' => $cfg['smtp_de_email'] ?? null,
                'seguranca' => $cfg['smtp_seguranca'] ?? null,
                'timeout' => $cfg['timeout'] ?? null,
            ],
            'mysql_error_log_insert' => mysqli_error($db),
        ]);

        retornar_json(false, 'Falha no envio: ' . $e->getMessage(), [
            'host'  => $cfg['smtp_host'],
            'porta' => $cfg['smtp_port'],
            'erro'  => $e->getMessage(),
        ]);
    }
}

// ============================================================
// ALERTAS — LISTAR
// ============================================================
function _alertas_listar($db) {
    $modulo = $_GET['modulo'] ?? '';
    $where  = $modulo ? "WHERE modulo='" . mysqli_real_escape_string($db, $modulo) . "'" : '';
    $res    = mysqli_query($db, "SELECT * FROM email_alertas $where ORDER BY modulo, nome");
    $lista  = [];
    while ($r = mysqli_fetch_assoc($res)) {
        $r['variaveis'] = json_decode($r['variaveis'] ?? '[]', true) ?: [];
        $lista[] = $r;
    }

    // Agrupar por módulo
    $grupos = [];
    foreach ($lista as $a) {
        $grupos[$a['modulo']][] = $a;
    }

    retornar_json(true, 'OK', ['alertas' => $lista, 'grupos' => $grupos, 'total' => count($lista)]);
}

// ============================================================
// ALERTA — SALVAR
// ============================================================
function _alerta_salvar($db) {
    $id      = (int)($_POST['id'] ?? 0);
    $assunto = mysqli_real_escape_string($db, $_POST['assunto']  ?? '');
    $corpo   = mysqli_real_escape_string($db, $_POST['corpo_html'] ?? '');
    $dest_tipo  = in_array($_POST['destinatario_tipo'] ?? '', ['morador','admin','email_fixo','todos_admins'])
                  ? $_POST['destinatario_tipo'] : 'admin';
    $dest_email = mysqli_real_escape_string($db, $_POST['destinatario_email'] ?? '');
    $cc         = mysqli_real_escape_string($db, $_POST['cc_emails'] ?? '');

    if ($id <= 0) retornar_json(false, 'ID do alerta inválido.');

    $sql = "UPDATE email_alertas SET
        assunto='$assunto', corpo_html='$corpo',
        destinatario_tipo='$dest_tipo', destinatario_email='$dest_email',
        cc_emails='$cc'
        WHERE id=$id";

    if (mysqli_query($db, $sql)) {
        retornar_json(true, 'Alerta salvo com sucesso!');
    } else {
        retornar_json(false, 'Erro ao salvar: ' . mysqli_error($db));
    }
}

// ============================================================
// ALERTA — TOGGLE ATIVO/INATIVO
// ============================================================
function _alerta_toggle($db) {
    $id    = (int)($_POST['id'] ?? 0);
    $ativo = (int)($_POST['ativo'] ?? 0);
    if ($id <= 0) retornar_json(false, 'ID inválido.');

    if (mysqli_query($db, "UPDATE email_alertas SET ativo=$ativo WHERE id=$id")) {
        $msg = $ativo ? 'Alerta ativado com sucesso!' : 'Alerta desativado.';
        retornar_json(true, $msg, ['ativo' => $ativo]);
    } else {
        retornar_json(false, 'Erro: ' . mysqli_error($db));
    }
}

// ============================================================
// LOG — LISTAR
// ============================================================
function _log_listar($db) {
    $pagina  = max(1, (int)($_GET['pagina'] ?? 1));
    $limite  = 50;
    $offset  = ($pagina - 1) * $limite;
    $tipo    = $_GET['tipo']   ?? '';
    $status  = $_GET['status'] ?? '';
    $busca   = $_GET['busca']  ?? '';

    $where = ['1=1'];
    if ($tipo)   $where[] = "tipo='"   . mysqli_real_escape_string($db, $tipo)   . "'";
    if ($status) $where[] = "status='" . mysqli_real_escape_string($db, $status) . "'";
    if ($busca)  $where[] = "(destinatario LIKE '%" . mysqli_real_escape_string($db, $busca) . "%' OR assunto LIKE '%" . mysqli_real_escape_string($db, $busca) . "%')";
    $w = implode(' AND ', $where);

    $total = mysqli_fetch_assoc(mysqli_query($db, "SELECT COUNT(*) as t FROM email_log WHERE $w"))['t'];
    $res   = mysqli_query($db, "SELECT * FROM email_log WHERE $w ORDER BY data_envio DESC LIMIT $limite OFFSET $offset");
    $lista = [];
    while ($r = mysqli_fetch_assoc($res)) $lista[] = $r;

    retornar_json(true, 'OK', [
        'logs'          => $lista,
        'total'         => (int)$total,
        'pagina_atual'  => $pagina,
        'total_paginas' => max(1, ceil($total / $limite)),
    ]);
}

// ============================================================
// LOG — LIMPAR
// ============================================================
function _log_limpar($db) {
    $dias = (int)($_POST['dias'] ?? 30);
    if ($dias < 1) $dias = 30;
    mysqli_query($db, "DELETE FROM email_log WHERE data_envio < DATE_SUB(NOW(), INTERVAL $dias DAY)");
    $afetados = mysqli_affected_rows($db);
    retornar_json(true, "$afetados registro(s) removido(s).", ['removidos' => $afetados]);
}

// ============================================================
// PROVEDORES — LISTAR (presets de configuração)
// ============================================================
function _provedores_listar() {
    $provedores = [
        [
            'id' => 'gmail', 'nome' => 'Gmail', 'icone' => 'fab fa-google',
            'cor' => '#EA4335', 'descricao' => 'Google Gmail (requer App Password)',
            'smtp_host' => 'smtp.gmail.com', 'smtp_port' => 587, 'smtp_seguranca' => 'tls',
            'ajuda' => 'Ative a verificação em 2 etapas e gere uma "Senha de App" em myaccount.google.com/apppasswords',
            'link_ajuda' => 'https://myaccount.google.com/apppasswords',
        ],
        [
            'id' => 'outlook', 'nome' => 'Outlook / Hotmail', 'icone' => 'fab fa-microsoft',
            'cor' => '#0078D4', 'descricao' => 'Microsoft Outlook / Hotmail / Office 365',
            'smtp_host' => 'smtp.office365.com', 'smtp_port' => 587, 'smtp_seguranca' => 'tls',
            'ajuda' => 'Use seu e-mail e senha normais do Outlook. Para Office 365 corporativo, pode ser necessário liberar SMTP autenticado.',
            'link_ajuda' => 'https://support.microsoft.com/pt-br/office/configurações-pop-imap-e-smtp-para-outlook-com',
        ],
        [
            'id' => 'sendgrid', 'nome' => 'SendGrid', 'icone' => 'fas fa-paper-plane',
            'cor' => '#1A82E2', 'descricao' => 'Twilio SendGrid (até 100 e-mails/dia grátis)',
            'smtp_host' => 'smtp.sendgrid.net', 'smtp_port' => 587, 'smtp_seguranca' => 'tls',
            'ajuda' => 'Usuário: "apikey" (literal). Senha: sua API Key do SendGrid.',
            'link_ajuda' => 'https://app.sendgrid.com/settings/api_keys',
        ],
        [
            'id' => 'brevo', 'nome' => 'Brevo (Sendinblue)', 'icone' => 'fas fa-envelope-open-text',
            'cor' => '#0092FF', 'descricao' => 'Brevo — até 300 e-mails/dia grátis',
            'smtp_host' => 'smtp-relay.brevo.com', 'smtp_port' => 587, 'smtp_seguranca' => 'tls',
            'ajuda' => 'Use seu e-mail de login como usuário e gere uma chave SMTP em Configurações > SMTP & API.',
            'link_ajuda' => 'https://app.brevo.com/settings/keys/smtp',
        ],
        [
            'id' => 'mailgun', 'nome' => 'Mailgun', 'icone' => 'fas fa-mail-bulk',
            'cor' => '#F06B26', 'descricao' => 'Mailgun — transacional de alta entregabilidade',
            'smtp_host' => 'smtp.mailgun.org', 'smtp_port' => 587, 'smtp_seguranca' => 'tls',
            'ajuda' => 'Usuário: postmaster@seu-dominio.mailgun.org. Senha: SMTP Password do domínio.',
            'link_ajuda' => 'https://app.mailgun.com/app/sending/domains',
        ],
        [
            'id' => 'hostgator', 'nome' => 'HostGator / cPanel', 'icone' => 'fas fa-server',
            'cor' => '#FF6600', 'descricao' => 'SMTP do próprio servidor de hospedagem',
            'smtp_host' => 'mail.seudominio.com.br', 'smtp_port' => 465, 'smtp_seguranca' => 'ssl',
            'ajuda' => 'Use o host de e-mail do seu domínio (ex: mail.seudominio.com.br). Porta 465 (SSL) ou 587 (TLS).',
            'link_ajuda' => '',
        ],
        [
            'id' => 'custom', 'nome' => 'Servidor Personalizado', 'icone' => 'fas fa-cog',
            'cor' => '#64748b', 'descricao' => 'Configure manualmente qualquer servidor SMTP',
            'smtp_host' => '', 'smtp_port' => 587, 'smtp_seguranca' => 'tls',
            'ajuda' => 'Preencha manualmente os dados do seu servidor SMTP.',
            'link_ajuda' => '',
        ],
    ];
    retornar_json(true, 'OK', ['provedores' => $provedores]);
}
