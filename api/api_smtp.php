<?php
/**
 * API para gerenciamento de configurações SMTP
 * 
 * Utiliza a classe EmailSender para envio de e-mails
 * 
 * @author Sistema ERP Serra da Liberdade
 * @date 29/12/2025
 */

// Limpar qualquer output anterior
ob_start();

// Habilitar exibição de erros para debug (mas não exibir na tela)
error_reporting(E_ALL);
ini_set('display_errors', 0);
ini_set('log_errors', 1);

// Limpar output buffer antes de enviar JSON
ob_clean();

// Função para retornar JSON
if (!function_exists('retornar_json')) {
    function retornar_json($sucesso, $mensagem, $dados = null) {
        header('Content-Type: application/json; charset=utf-8');
        $resposta = array('sucesso' => $sucesso, 'mensagem' => $mensagem);
        if ($dados !== null) $resposta['dados'] = $dados;
        echo json_encode($resposta, JSON_UNESCAPED_UNICODE);
        exit;
    }
}

header('Content-Type: application/json; charset=utf-8');
require_once 'config.php';
require_once 'auth_helper.php';

// Log de início
error_log("=== API SMTP CHAMADA ===");
error_log("Método: " . $_SERVER['REQUEST_METHOD']);
error_log("POST: " . print_r($_POST, true));
error_log("GET: " . print_r($_GET, true));

// Função para sanitizar entrada
if (!function_exists('sanitizar')) {
function sanitizar($conexao, $valor) {
    return mysqli_real_escape_string($conexao, trim($valor));
}
}

// Função para resposta JSON
function resposta($sucesso, $mensagem, $dados = null) {
    // Limpar qualquer output anterior
    if (ob_get_length()) ob_clean();
    
    $response = [
        'sucesso' => $sucesso,
        'mensagem' => $mensagem,
        'dados' => $dados
    ];
    error_log("Resposta: " . json_encode($response, JSON_UNESCAPED_UNICODE));
    
    // Garantir que só JSON seja enviado
    echo json_encode($response, JSON_UNESCAPED_UNICODE);
    exit;
}

// Conectar ao banco
$conexao = mysqli_connect(DB_HOST, DB_USER, DB_PASS, DB_NAME);
if (!$conexao) {
    error_log("Erro ao conectar ao banco: " . mysqli_connect_error());
    resposta(false, 'Erro ao conectar ao banco de dados');
}
mysqli_set_charset($conexao, 'utf8mb4');
error_log("Conexão com banco estabelecida");

// Verificar se a tabela existe
$sql_check_table = "SHOW TABLES LIKE 'configuracao_smtp'";
$resultado_check = mysqli_query($conexao, $sql_check_table);

if (mysqli_num_rows($resultado_check) == 0) {
    error_log("Tabela configuracao_smtp não existe, criando...");
    
    // Tentar criar a tabela automaticamente
    $sql_create = "CREATE TABLE `configuracao_smtp` (
      `id` int(11) NOT NULL AUTO_INCREMENT,
      `smtp_host` varchar(255) NOT NULL,
      `smtp_port` int(11) NOT NULL DEFAULT 587,
      `smtp_usuario` varchar(255) NOT NULL,
      `smtp_senha` varchar(255) NOT NULL,
      `smtp_de_email` varchar(255) NOT NULL,
      `smtp_de_nome` varchar(255) NOT NULL,
      `smtp_seguranca` enum('tls','ssl','none') NOT NULL DEFAULT 'tls',
      `smtp_ativo` tinyint(1) NOT NULL DEFAULT 1,
      `data_criacao` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      `data_atualizacao` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (`id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";
    
    if (!mysqli_query($conexao, $sql_create)) {
        error_log("Erro ao criar tabela: " . mysqli_error($conexao));
        resposta(false, 'Tabela configuracao_smtp não existe e não foi possível criar');
    }
    error_log("Tabela criada com sucesso");
}

// Obter ação
$acao = $_GET['acao'] ?? $_POST['acao'] ?? '';
error_log("Ação solicitada: $acao");

switch ($acao) {
    case 'buscar':
        buscarConfig($conexao);
        break;
    
    case 'salvar':
        salvarConfig($conexao);
        break;
    
    case 'testar':
        testarSMTP($conexao);
        break;
    
    default:
        error_log("Ação inválida: $acao");
        resposta(false, 'Ação inválida');
}

// =====================================================
// FUNÇÕES
// =====================================================

function buscarConfig($conexao) {
    error_log("Função buscarConfig chamada");
    
    $sql = "SELECT * FROM configuracao_smtp ORDER BY id DESC LIMIT 1";
    $resultado = mysqli_query($conexao, $sql);
    
    if (!$resultado) {
        error_log("Erro na query buscar: " . mysqli_error($conexao));
        resposta(false, 'Erro ao buscar configuração');
    }
    
    if (mysqli_num_rows($resultado) > 0) {
        $dados = mysqli_fetch_assoc($resultado);
        error_log("Configuração encontrada: ID " . $dados['id']);
        resposta(true, 'Configuração carregada', $dados);
    } else {
        error_log("Nenhuma configuração encontrada");
        resposta(true, 'Nenhuma configuração encontrada', null);
    }
}

function salvarConfig($conexao) {
    error_log("Função salvarConfig chamada");
    
    // Obter e sanitizar dados
    $smtp_host = sanitizar($conexao, $_POST['smtp_host'] ?? '');
    $smtp_port = intval($_POST['smtp_port'] ?? 587);
    $smtp_usuario = sanitizar($conexao, $_POST['smtp_usuario'] ?? '');
    $smtp_senha = sanitizar($conexao, $_POST['smtp_senha'] ?? '');
    $smtp_de_email = sanitizar($conexao, $_POST['smtp_de_email'] ?? '');
    $smtp_de_nome = sanitizar($conexao, $_POST['smtp_de_nome'] ?? '');
    $smtp_seguranca = sanitizar($conexao, $_POST['smtp_seguranca'] ?? 'tls');
    $smtp_ativo = intval($_POST['smtp_ativo'] ?? 1);
    
    error_log("Dados recebidos e sanitizados");
    
    // Validar campos obrigatórios
    if (empty($smtp_host)) {
        error_log("Validação falhou: smtp_host vazio");
        resposta(false, 'Servidor SMTP é obrigatório');
    }
    
    if (empty($smtp_usuario)) {
        error_log("Validação falhou: smtp_usuario vazio");
        resposta(false, 'Usuário/E-mail é obrigatório');
    }
    
    if (empty($smtp_senha)) {
        error_log("Validação falhou: smtp_senha vazio");
        resposta(false, 'Senha/Token é obrigatório');
    }
    
    if (empty($smtp_de_email)) {
        error_log("Validação falhou: smtp_de_email vazio");
        resposta(false, 'E-mail Remetente é obrigatório');
    }
    
    if (empty($smtp_de_nome)) {
        error_log("Validação falhou: smtp_de_nome vazio");
        resposta(false, 'Nome Remetente é obrigatório');
    }
    
    error_log("Validação OK");
    
    // Verificar se já existe configuração
    $sql_check = "SELECT id FROM configuracao_smtp LIMIT 1";
    $resultado = mysqli_query($conexao, $sql_check);
    
    if (!$resultado) {
        error_log("Erro ao verificar configuração existente: " . mysqli_error($conexao));
        resposta(false, 'Erro ao verificar configuração existente');
    }
    
    $num_rows = mysqli_num_rows($resultado);
    error_log("Registros existentes: $num_rows");
    
    if ($num_rows > 0) {
        // Atualizar
        $row = mysqli_fetch_assoc($resultado);
        $id = $row['id'];
        
        error_log("Atualizando registro ID: $id");
        
        $sql = "UPDATE configuracao_smtp SET 
                smtp_host = '$smtp_host',
                smtp_port = $smtp_port,
                smtp_usuario = '$smtp_usuario',
                smtp_senha = '$smtp_senha',
                smtp_de_email = '$smtp_de_email',
                smtp_de_nome = '$smtp_de_nome',
                smtp_seguranca = '$smtp_seguranca',
                smtp_ativo = $smtp_ativo
                WHERE id = $id";
        
        error_log("SQL UPDATE gerado");
    } else {
        // Inserir
        error_log("Inserindo novo registro");
        
        $sql = "INSERT INTO configuracao_smtp 
                (smtp_host, smtp_port, smtp_usuario, smtp_senha, smtp_de_email, smtp_de_nome, smtp_seguranca, smtp_ativo)
                VALUES 
                ('$smtp_host', $smtp_port, '$smtp_usuario', '$smtp_senha', '$smtp_de_email', '$smtp_de_nome', '$smtp_seguranca', $smtp_ativo)";
        
        error_log("SQL INSERT gerado");
    }
    
    // Executar query
    if (mysqli_query($conexao, $sql)) {
        $id_salvo = ($num_rows > 0) ? $id : mysqli_insert_id($conexao);
        error_log("Query executada com sucesso! ID: $id_salvo");
        resposta(true, 'Configuração salva com sucesso', ['id' => $id_salvo]);
    } else {
        $erro = mysqli_error($conexao);
        error_log("Erro ao executar query: $erro");
        resposta(false, 'Erro ao salvar configuração: ' . $erro);
    }
}

function testarSMTP($conexao) {
    error_log("Função testarSMTP chamada");
    
    $email_destino = $_GET['email'] ?? '';
    
    if (empty($email_destino) || !filter_var($email_destino, FILTER_VALIDATE_EMAIL)) {
        error_log("Email inválido");
        resposta(false, 'E-mail inválido');
    }
    
    try {
        // Usar a classe EmailSender
        require_once 'EmailSender.php';
        
        $emailSender = new EmailSender($conexao);
        $enviado = $emailSender->enviarTeste($email_destino);
        
        if ($enviado) {
            error_log("Email de teste enviado com sucesso");
            resposta(true, 'E-mail de teste enviado com sucesso!');
        } else {
            error_log("Falha ao enviar email de teste");
            resposta(false, 'Erro ao enviar e-mail de teste. Verifique as configurações.');
        }
        
    } catch (Exception $e) {
        error_log("Exceção ao testar SMTP: " . $e->getMessage());
        resposta(false, 'Erro ao enviar e-mail: ' . $e->getMessage());
    }
}

mysqli_close($conexao);
error_log("=== FIM API SMTP ===");
?>
