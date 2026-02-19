<?php
ob_start();
error_reporting(E_ALL);
ini_set('display_errors', 0);
ini_set('log_errors', 1);
ob_clean();

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-cache, must-revalidate');
header('Access-Control-Allow-Origin: http://erp.asserradaliberdade.ong.br');
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

require_once 'config.php';
require_once 'auth_helper.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

function resposta($sucesso, $mensagem, $dados = null) {
    if (ob_get_length()) ob_clean();
    $response = array(
        'sucesso' => $sucesso,
        'mensagem' => $mensagem,
        'dados' => $dados
    );
    echo json_encode($response, JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    verificarAutenticacao(true, 'admin');
    verificarPermissao('admin');
    
    $conexao = mysqli_connect(DB_HOST, DB_USER, DB_PASS, DB_NAME);
    if (!$conexao) {
        resposta(false, 'Erro ao conectar ao banco de dados');
    }
    mysqli_set_charset($conexao, 'utf8mb4');
    
    $acao = $_GET['acao'] ?? $_POST['acao'] ?? '';
    
    if (empty($acao)) {
        resposta(false, 'Acao nao especificada');
    }
    
    switch ($acao) {
        case 'listar_todos':
            listarTodos($conexao);
            break;
        case 'alternar_status':
            alternarStatus($conexao);
            break;
        case 'alternar_aprovacao':
            alternarAprovacao($conexao);
            break;
        case 'estatisticas':
            obterEstatisticas($conexao);
            break;
        default:
            resposta(false, 'Acao invalida: ' . $acao);
    }
    
    mysqli_close($conexao);
    
} catch (Exception $e) {
    error_log('Erro em api_admin_fornecedores.php: ' . $e->getMessage());
    http_response_code(500);
    resposta(false, 'Erro ao processar requisicao: ' . $e->getMessage());
}

function listarTodos($conexao) {
    $sql = 'SELECT f.id, f.cpf_cnpj, f.nome_estabelecimento, f.nome_responsavel, f.ramo_atividade_id, r.nome as ramo_atividade, r.icone as ramo_icone, f.endereco, f.telefone, f.email, f.logo, f.descricao_negocio, f.horario_funcionamento, f.ativo, f.aprovado, DATE_FORMAT(f.data_cadastro, \'%d/%m/%Y %H:%i\') as data_cadastro, DATE_FORMAT(f.data_atualizacao, \'%d/%m/%Y %H:%i\') as data_atualizacao, DATE_FORMAT(f.ultimo_acesso, \'%d/%m/%Y %H:%i\') as ultimo_acesso FROM fornecedores f LEFT JOIN ramos_atividade r ON f.ramo_atividade_id = r.id ORDER BY f.data_cadastro DESC';
    
    $resultado = mysqli_query($conexao, $sql);
    
    if (!$resultado) {
        resposta(false, 'Erro ao buscar fornecedores: ' . mysqli_error($conexao));
    }
    
    $fornecedores = array();
    while ($row = mysqli_fetch_assoc($resultado)) {
        $fornecedores[] = $row;
    }
    
    resposta(true, 'Fornecedores listados com sucesso', $fornecedores);
}

function alternarStatus($conexao) {
    $dados = json_decode(file_get_contents('php://input'), true);
    
    if (!is_array($dados) || !isset($dados['id'])) {
        resposta(false, 'Dados invalidos');
    }
    
    $id = intval($dados['id']);
    
    if ($id <= 0) {
        resposta(false, 'ID invalido');
    }
    
    $stmt = mysqli_prepare($conexao, 'SELECT ativo, nome_estabelecimento FROM fornecedores WHERE id = ?');
    mysqli_stmt_bind_param($stmt, 'i', $id);
    mysqli_stmt_execute($stmt);
    $resultado = mysqli_stmt_get_result($stmt);
    
    if (mysqli_num_rows($resultado) == 0) {
        resposta(false, 'Fornecedor nao encontrado');
    }
    
    $fornecedor = mysqli_fetch_assoc($resultado);
    $novo_status = $fornecedor['ativo'] == 1 ? 0 : 1;
    mysqli_stmt_close($stmt);
    
    $stmt = mysqli_prepare($conexao, 'UPDATE fornecedores SET ativo = ? WHERE id = ?');
    mysqli_stmt_bind_param($stmt, 'ii', $novo_status, $id);
    
    if (mysqli_stmt_execute($stmt)) {
        $mensagem = $novo_status == 1 ? 'Fornecedor ativado!' : 'Fornecedor desativado!';
        resposta(true, $mensagem, array('id' => $id, 'novo_status' => $novo_status));
    } else {
        resposta(false, 'Erro ao alterar status: ' . mysqli_error($conexao));
    }
    
    mysqli_stmt_close($stmt);
}

function alternarAprovacao($conexao) {
    $dados = json_decode(file_get_contents('php://input'), true);
    
    if (!is_array($dados) || !isset($dados['id'])) {
        resposta(false, 'Dados invalidos');
    }
    
    $id = intval($dados['id']);
    
    if ($id <= 0) {
        resposta(false, 'ID invalido');
    }
    
    $stmt = mysqli_prepare($conexao, 'SELECT aprovado, nome_estabelecimento FROM fornecedores WHERE id = ?');
    mysqli_stmt_bind_param($stmt, 'i', $id);
    mysqli_stmt_execute($stmt);
    $resultado = mysqli_stmt_get_result($stmt);
    
    if (mysqli_num_rows($resultado) == 0) {
        resposta(false, 'Fornecedor nao encontrado');
    }
    
    $fornecedor = mysqli_fetch_assoc($resultado);
    $novo_status = $fornecedor['aprovado'] == 1 ? 0 : 1;
    mysqli_stmt_close($stmt);
    
    $stmt = mysqli_prepare($conexao, 'UPDATE fornecedores SET aprovado = ? WHERE id = ?');
    mysqli_stmt_bind_param($stmt, 'ii', $novo_status, $id);
    
    if (mysqli_stmt_execute($stmt)) {
        $mensagem = $novo_status == 1 ? 'Fornecedor aprovado!' : 'Aprovacao removida!';
        resposta(true, $mensagem, array('id' => $id, 'novo_status' => $novo_status));
    } else {
        resposta(false, 'Erro ao alterar aprovacao: ' . mysqli_error($conexao));
    }
    
    mysqli_stmt_close($stmt);
}

function obterEstatisticas($conexao) {
    $sql = 'SELECT COUNT(*) as total_fornecedores, SUM(CASE WHEN ativo = 1 THEN 1 ELSE 0 END) as fornecedores_ativos, SUM(CASE WHEN ativo = 0 THEN 1 ELSE 0 END) as fornecedores_inativos, SUM(CASE WHEN aprovado = 1 THEN 1 ELSE 0 END) as fornecedores_aprovados, SUM(CASE WHEN aprovado = 0 THEN 1 ELSE 0 END) as fornecedores_pendentes FROM fornecedores';
    
    $resultado = mysqli_query($conexao, $sql);
    
    if (!$resultado) {
        resposta(false, 'Erro ao buscar estatisticas: ' . mysqli_error($conexao));
    }
    
    $stats = mysqli_fetch_assoc($resultado);
    
    $stats['total_fornecedores'] = intval($stats['total_fornecedores']);
    $stats['fornecedores_ativos'] = intval($stats['fornecedores_ativos']);
    $stats['fornecedores_inativos'] = intval($stats['fornecedores_inativos']);
    $stats['fornecedores_aprovados'] = intval($stats['fornecedores_aprovados']);
    $stats['fornecedores_pendentes'] = intval($stats['fornecedores_pendentes']);
    
    resposta(true, 'Estatisticas carregadas', $stats);
}
?>