<?php
// =====================================================
// API PARA CRUD DE VISITANTES
// =====================================================

// Limpar qualquer saída anterior
ob_start();

require_once 'config.php';
require_once 'auth_helper.php';

// Limpar buffer e definir headers
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

ob_end_clean();
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-cache, must-revalidate');
header('Access-Control-Allow-Origin: http://erp.asserradaliberdade.ong.br');
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

// Tratar OPTIONS (preflight)
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Verificar autenticação
verificarAutenticacao(true, 'operador');

$metodo = $_SERVER['REQUEST_METHOD'];
$conexao = conectar_banco();

// ========== LISTAR VISITANTES ==========
if ($metodo === 'GET') {
    $busca = isset($_GET['busca']) ? sanitizar($conexao, $_GET['busca']) : '';
    
    $sql = "SELECT id, nome_completo, documento, tipo_documento, cep, endereco, numero, 
            complemento, bairro, cidade, estado, telefone, celular, email, observacao, ativo,
            DATE_FORMAT(data_cadastro, '%d/%m/%Y %H:%i') as data_cadastro_formatada
            FROM visitantes ";
    
    if (!empty($busca)) {
        $sql .= "WHERE nome_completo LIKE '%$busca%' OR documento LIKE '%$busca%' ";
    }
    
    $sql .= "ORDER BY nome_completo ASC";
    
    $resultado = $conexao->query($sql);
    $visitantes = array();
    
    if ($resultado && $resultado->num_rows > 0) {
        while ($row = $resultado->fetch_assoc()) {
            $visitantes[] = $row;
        }
    }
    
    retornar_json(true, "Visitantes listados com sucesso", $visitantes);
}

// ========== CRIAR VISITANTE ==========
if ($metodo === 'POST') {
    // Verificar permissão de escrita
    verificarPermissao('operador');
    $dados = json_decode(file_get_contents('php://input'), true);
    
    $nome_completo = sanitizar($conexao, $dados['nome_completo'] ?? '');
    $documento = sanitizar($conexao, $dados['documento'] ?? '');
    $tipo_documento = sanitizar($conexao, $dados['tipo_documento'] ?? 'CPF');
    $cep = sanitizar($conexao, $dados['cep'] ?? '');
    $endereco = sanitizar($conexao, $dados['endereco'] ?? '');
    $numero = sanitizar($conexao, $dados['numero'] ?? '');
    $complemento = sanitizar($conexao, $dados['complemento'] ?? '');
    $bairro = sanitizar($conexao, $dados['bairro'] ?? '');
    $cidade = sanitizar($conexao, $dados['cidade'] ?? '');
    $estado = sanitizar($conexao, $dados['estado'] ?? '');
    $telefone = sanitizar($conexao, $dados['telefone'] ?? '');
    $celular = sanitizar($conexao, $dados['celular'] ?? '');
    $email = sanitizar($conexao, $dados['email'] ?? '');
    $observacao = sanitizar($conexao, $dados['observacao'] ?? '');
    
    // Validações
    if (empty($nome_completo) || empty($documento)) {
        retornar_json(false, "Nome completo e documento são obrigatórios");
    }
    
    // Verificar se documento já existe
    $stmt = $conexao->prepare("SELECT id FROM visitantes WHERE documento = ?");
    $stmt->bind_param("s", $documento);
    $stmt->execute();
    $stmt->store_result();
    
    if ($stmt->num_rows > 0) {
        retornar_json(false, "Documento já cadastrado no sistema");
    }
    $stmt->close();
    
    // Inserir visitante
    $stmt = $conexao->prepare("INSERT INTO visitantes (nome_completo, documento, tipo_documento, cep, endereco, numero, complemento, bairro, cidade, estado, telefone, celular, email, observacao) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    $stmt->bind_param("ssssssssssssss", $nome_completo, $documento, $tipo_documento, $cep, $endereco, $numero, $complemento, $bairro, $cidade, $estado, $telefone, $celular, $email, $observacao);
    
    if ($stmt->execute()) {
        $id = $conexao->insert_id;
        registrar_log($conexao, 'INFO', "Visitante cadastrado: $nome_completo (ID: $id)");
        retornar_json(true, "Visitante cadastrado com sucesso", array('id' => $id));
    } else {
        retornar_json(false, "Erro ao cadastrar visitante: " . $stmt->error);
    }
    
    $stmt->close();
}

// ========== ATUALIZAR VISITANTE ==========
if ($metodo === 'PUT') {
    // Verificar permissão de escrita
    verificarPermissao('operador');
    $dados = json_decode(file_get_contents('php://input'), true);
    
    $id = intval($dados['id'] ?? 0);
    $nome_completo = sanitizar($conexao, $dados['nome_completo'] ?? '');
    $documento = sanitizar($conexao, $dados['documento'] ?? '');
    $tipo_documento = sanitizar($conexao, $dados['tipo_documento'] ?? 'CPF');
    $cep = sanitizar($conexao, $dados['cep'] ?? '');
    $endereco = sanitizar($conexao, $dados['endereco'] ?? '');
    $numero = sanitizar($conexao, $dados['numero'] ?? '');
    $complemento = sanitizar($conexao, $dados['complemento'] ?? '');
    $bairro = sanitizar($conexao, $dados['bairro'] ?? '');
    $cidade = sanitizar($conexao, $dados['cidade'] ?? '');
    $estado = sanitizar($conexao, $dados['estado'] ?? '');
    $telefone = sanitizar($conexao, $dados['telefone'] ?? '');
    $celular = sanitizar($conexao, $dados['celular'] ?? '');
    $email = sanitizar($conexao, $dados['email'] ?? '');
    $observacao = sanitizar($conexao, $dados['observacao'] ?? '');
    
    if ($id <= 0) {
        retornar_json(false, "ID inválido");
    }
    
    // Verificar se documento já existe em outro visitante
    $stmt = $conexao->prepare("SELECT id FROM visitantes WHERE documento = ? AND id != ?");
    $stmt->bind_param("si", $documento, $id);
    $stmt->execute();
    $stmt->store_result();
    
    if ($stmt->num_rows > 0) {
        retornar_json(false, "Documento já cadastrado para outro visitante");
    }
    $stmt->close();
    
    // Atualizar visitante
    $stmt = $conexao->prepare("UPDATE visitantes SET nome_completo = ?, documento = ?, tipo_documento = ?, cep = ?, endereco = ?, numero = ?, complemento = ?, bairro = ?, cidade = ?, estado = ?, telefone = ?, celular = ?, email = ?, observacao = ? WHERE id = ?");
    $stmt->bind_param("ssssssssssssssi", $nome_completo, $documento, $tipo_documento, $cep, $endereco, $numero, $complemento, $bairro, $cidade, $estado, $telefone, $celular, $email, $observacao, $id);
    
    if ($stmt->execute()) {
        registrar_log('INFO', "Visitante atualizado: $nome_completo (ID: $id)");
        retornar_json(true, "Visitante atualizado com sucesso");
    } else {
        registrar_log('ERRO', "Erro ao atualizar visitante: " . $stmt->error);
        retornar_json(false, "Erro ao atualizar visitante: " . $stmt->error);
    }
    
    $stmt->close();
}

// ========== EXCLUIR VISITANTE ==========
if ($metodo === 'DELETE') {
    // Verificar permissão de admin
    verificarPermissao('admin');
    $dados = json_decode(file_get_contents('php://input'), true);
    $id = intval($dados['id'] ?? 0);
    
    if ($id <= 0) {
        retornar_json(false, "ID inválido");
    }
    
    // Buscar nome antes de excluir
    $stmt = $conexao->prepare("SELECT nome_completo FROM visitantes WHERE id = ?");
    $stmt->bind_param("i", $id);
    $stmt->execute();
    $resultado = $stmt->get_result();
    $visitante = $resultado->fetch_assoc();
    $stmt->close();
    
    if (!$visitante) {
        retornar_json(false, "Visitante não encontrado");
    }
    
    // Excluir visitante
    $stmt = $conexao->prepare("DELETE FROM visitantes WHERE id = ?");
    $stmt->bind_param("i", $id);
    
    if ($stmt->execute()) {
        registrar_log('INFO', "Visitante excluído: " . $visitante['nome_completo'] . " (ID: $id)");
        retornar_json(true, "Visitante excluído com sucesso");
    } else {
        registrar_log('ERRO', "Erro ao excluir visitante: " . $stmt->error);
        retornar_json(false, "Erro ao excluir visitante: " . $stmt->error);
    }
    
    $stmt->close();
}

fechar_conexao($conexao);
