<?php
// =====================================================
// API PARA CRUD DE USUÁRIOS
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

// Verificar autenticação - apenas admin pode gerenciar usuários
verificarAutenticacao(true, 'admin');

$metodo = $_SERVER['REQUEST_METHOD'];
$conexao = conectar_banco();

// Verificar permissão de admin para todas as operações
verificarPermissao('admin');

// ========== LISTAR USUÁRIOS ==========
if ($metodo === 'GET') {
    if (isset($_GET['id'])) {
        // Buscar usuário específico
        $id = intval($_GET['id']);
        $stmt = $conexao->prepare("SELECT id, nome, email, funcao, departamento, permissao, ativo, DATE_FORMAT(data_criacao, '%d/%m/%Y %H:%i') as data_criacao FROM usuarios WHERE id = ?");
        $stmt->bind_param("i", $id);
        $stmt->execute();
        $resultado = $stmt->get_result();
        
        if ($row = $resultado->fetch_assoc()) {
            retornar_json(true, "Usuário encontrado", $row);
        } else {
            retornar_json(false, "Usuário não encontrado");
        }
    } else {
        // Listar todos os usuários
        $sql = "SELECT id, nome, email, funcao, departamento, permissao, ativo, 
                DATE_FORMAT(data_criacao, '%d/%m/%Y %H:%i') as data_criacao 
                FROM usuarios 
                ORDER BY nome ASC";
        
        $resultado = $conexao->query($sql);
        $usuarios = array();
        
        if ($resultado && $resultado->num_rows > 0) {
            while ($row = $resultado->fetch_assoc()) {
                $usuarios[] = $row;
            }
        }
        
        retornar_json(true, "Usuários listados com sucesso", $usuarios);
    }
}

// ========== CRIAR USUÁRIO ==========
if ($metodo === 'POST') {
    $dados = json_decode(file_get_contents('php://input'), true);
    
    $nome = sanitizar($conexao, $dados['nome'] ?? '');
    $email = sanitizar($conexao, $dados['email'] ?? '');
    $senha = $dados['senha'] ?? '';
    $funcao = sanitizar($conexao, $dados['funcao'] ?? '');
    $departamento = sanitizar($conexao, $dados['departamento'] ?? '');
    $permissao = sanitizar($conexao, $dados['permissao'] ?? 'operador');
    $ativo = isset($dados['ativo']) ? intval($dados['ativo']) : 1;
    
    // Validações
    if (empty($nome) || empty($email) || empty($senha) || empty($funcao)) {
        retornar_json(false, "Todos os campos obrigatórios devem ser preenchidos");
    }
    
    // Verificar se email já existe
    $stmt = $conexao->prepare("SELECT id FROM usuarios WHERE email = ?");
    $stmt->bind_param("s", $email);
    $stmt->execute();
    $stmt->store_result();
    
    if ($stmt->num_rows > 0) {
        $stmt->close();
        retornar_json(false, "Email já cadastrado no sistema");
    }
    $stmt->close();
    
    // Criptografar senha
    $senha_hash = password_hash($senha, PASSWORD_DEFAULT);
    
    // Inserir usuário
    $stmt = $conexao->prepare("INSERT INTO usuarios (nome, email, senha, funcao, departamento, permissao, ativo) VALUES (?, ?, ?, ?, ?, ?, ?)");
    $stmt->bind_param("ssssssi", $nome, $email, $senha_hash, $funcao, $departamento, $permissao, $ativo);
    
    if ($stmt->execute()) {
        $id_inserido = $conexao->insert_id;
        registrar_log('USUARIO_CRIADO', "Usuário criado: $nome (ID: $id_inserido)", $nome);
        retornar_json(true, "Usuário cadastrado com sucesso", array('id' => $id_inserido));
    } else {
        retornar_json(false, "Erro ao cadastrar usuário: " . $stmt->error);
    }
    
    $stmt->close();
}

// ========== ATUALIZAR USUÁRIO ==========
if ($metodo === 'PUT') {
    $dados = json_decode(file_get_contents('php://input'), true);
    
    $id = intval($dados['id'] ?? 0);
    $nome = sanitizar($conexao, $dados['nome'] ?? '');
    $email = sanitizar($conexao, $dados['email'] ?? '');
    $funcao = sanitizar($conexao, $dados['funcao'] ?? '');
    $departamento = sanitizar($conexao, $dados['departamento'] ?? '');
    $permissao = sanitizar($conexao, $dados['permissao'] ?? 'operador');
    $ativo = isset($dados['ativo']) ? intval($dados['ativo']) : 1;
    
    // Validações
    if ($id <= 0 || empty($nome) || empty($email) || empty($funcao)) {
        retornar_json(false, "Dados inválidos para atualização");
    }
    
    // Verificar se email já existe em outro usuário
    $stmt = $conexao->prepare("SELECT id FROM usuarios WHERE email = ? AND id != ?");
    $stmt->bind_param("si", $email, $id);
    $stmt->execute();
    $stmt->store_result();
    
    if ($stmt->num_rows > 0) {
        $stmt->close();
        retornar_json(false, "Email já cadastrado para outro usuário");
    }
    $stmt->close();
    
    // Atualizar com ou sem senha
    if (isset($dados['senha']) && !empty($dados['senha']) && $dados['senha'] !== '********') {
        $senha_hash = password_hash($dados['senha'], PASSWORD_DEFAULT);
        $stmt = $conexao->prepare("UPDATE usuarios SET nome=?, email=?, senha=?, funcao=?, departamento=?, permissao=?, ativo=? WHERE id=?");
        $stmt->bind_param("ssssssii", $nome, $email, $senha_hash, $funcao, $departamento, $permissao, $ativo, $id);
    } else {
        $stmt = $conexao->prepare("UPDATE usuarios SET nome=?, email=?, funcao=?, departamento=?, permissao=?, ativo=? WHERE id=?");
        $stmt->bind_param("sssssii", $nome, $email, $funcao, $departamento, $permissao, $ativo, $id);
    }
    
    if ($stmt->execute()) {
        registrar_log('USUARIO_ATUALIZADO', "Usuário atualizado: $nome (ID: $id)", $nome);
        retornar_json(true, "Usuário atualizado com sucesso");
    } else {
        retornar_json(false, "Erro ao atualizar usuário: " . $stmt->error);
    }
    
    $stmt->close();
}

// ========== EXCLUIR USUÁRIO ==========
if ($metodo === 'DELETE') {
    $dados = json_decode(file_get_contents('php://input'), true);
    $id = intval($dados['id'] ?? 0);
    
    if ($id <= 0) {
        retornar_json(false, "ID inválido");
    }
    
    // Não permitir excluir o primeiro usuário (admin)
    if ($id == 1) {
        retornar_json(false, "Não é possível excluir o administrador principal");
    }
    
    // Buscar nome do usuário antes de excluir
    $stmt = $conexao->prepare("SELECT nome FROM usuarios WHERE id = ?");
    $stmt->bind_param("i", $id);
    $stmt->execute();
    $resultado = $stmt->get_result();
    $usuario = $resultado->fetch_assoc();
    $nome_usuario = $usuario['nome'] ?? 'Desconhecido';
    $stmt->close();
    
    // Excluir usuário
    $stmt = $conexao->prepare("DELETE FROM usuarios WHERE id = ?");
    $stmt->bind_param("i", $id);
    
    if ($stmt->execute()) {
        registrar_log('USUARIO_EXCLUIDO', "Usuário excluído: $nome_usuario (ID: $id)", $nome_usuario);
        retornar_json(true, "Usuário excluído com sucesso");
    } else {
        retornar_json(false, "Erro ao excluir usuário: " . $stmt->error);
    }
    
    $stmt->close();
}

fechar_conexao($conexao);
