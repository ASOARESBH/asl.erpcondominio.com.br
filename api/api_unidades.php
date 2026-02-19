<?php
// =====================================================
// API PARA CRUD DE UNIDADES
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

$metodo = $_SERVER['REQUEST_METHOD'];
$conexao = conectar_banco();

// ========== LISTAR UNIDADES ==========
if ($metodo === 'GET') {
    $apenas_ativas = isset($_GET['ativas']) ? true : false;
    
    $sql = "SELECT id, nome, descricao, bloco, ativo,
            DATE_FORMAT(data_cadastro, '%d/%m/%Y %H:%i') as data_cadastro_formatada
            FROM unidades ";
    
    if ($apenas_ativas) {
        $sql .= "WHERE ativo = 1 ";
    }
    
    $sql .= "ORDER BY nome ASC";
    
    $resultado = $conexao->query($sql);
    $unidades = array();
    
    if ($resultado && $resultado->num_rows > 0) {
        while ($row = $resultado->fetch_assoc()) {
            $unidades[] = $row;
        }
    }
    
    retornar_json(true, "Unidades listadas com sucesso", $unidades);
}

// ========== CRIAR UNIDADE ==========
if ($metodo === 'POST') {
    $dados = json_decode(file_get_contents('php://input'), true);
    
    $nome = sanitizar($conexao, $dados['nome'] ?? '');
    $descricao = sanitizar($conexao, $dados['descricao'] ?? '');
    $bloco = sanitizar($conexao, $dados['bloco'] ?? '');
    
    // Validações
    if (empty($nome)) {
        retornar_json(false, "Nome da unidade é obrigatório");
    }
    
    // Verificar se unidade já existe
    $stmt = $conexao->prepare("SELECT id FROM unidades WHERE nome = ?");
    $stmt->bind_param("s", $nome);
    $stmt->execute();
    $stmt->store_result();
    
    if ($stmt->num_rows > 0) {
        retornar_json(false, "Unidade já cadastrada no sistema");
    }
    $stmt->close();
    
    // Inserir unidade
    $stmt = $conexao->prepare("INSERT INTO unidades (nome, descricao, bloco) VALUES (?, ?, ?)");
    $stmt->bind_param("sss", $nome, $descricao, $bloco);
    
    if ($stmt->execute()) {
        $id = $conexao->insert_id;
        registrar_log($conexao, 'INFO', "Unidade cadastrada: $nome (ID: $id)");
        retornar_json(true, "Unidade cadastrada com sucesso", array('id' => $id));
    } else {
        retornar_json(false, "Erro ao cadastrar unidade: " . $stmt->error);
    }
    
    $stmt->close();
}

// ========== ATUALIZAR UNIDADE ==========
if ($metodo === 'PUT') {
    $dados = json_decode(file_get_contents('php://input'), true);
    
    $id = intval($dados['id'] ?? 0);
    $nome = sanitizar($conexao, $dados['nome'] ?? '');
    $descricao = sanitizar($conexao, $dados['descricao'] ?? '');
    $bloco = sanitizar($conexao, $dados['bloco'] ?? '');
    $ativo = isset($dados['ativo']) ? intval($dados['ativo']) : 1;
    
    if ($id <= 0) {
        retornar_json(false, "ID inválido");
    }
    
    if (empty($nome)) {
        retornar_json(false, "Nome da unidade é obrigatório");
    }
    
    // Verificar se nome já existe em outra unidade
    $stmt = $conexao->prepare("SELECT id FROM unidades WHERE nome = ? AND id != ?");
    $stmt->bind_param("si", $nome, $id);
    $stmt->execute();
    $stmt->store_result();
    
    if ($stmt->num_rows > 0) {
        retornar_json(false, "Nome da unidade já cadastrado");
    }
    $stmt->close();
    
    // Atualizar unidade
    $stmt = $conexao->prepare("UPDATE unidades SET nome = ?, descricao = ?, bloco = ?, ativo = ? WHERE id = ?");
    $stmt->bind_param("sssii", $nome, $descricao, $bloco, $ativo, $id);
    
    if ($stmt->execute()) {
        registrar_log($conexao, 'INFO', "Unidade atualizada: $nome (ID: $id)");
        retornar_json(true, "Unidade atualizada com sucesso");
    } else {
        retornar_json(false, "Erro ao atualizar unidade: " . $stmt->error);
    }
    
    $stmt->close();
}

// ========== EXCLUIR UNIDADE ==========
if ($metodo === 'DELETE') {
    $dados = json_decode(file_get_contents('php://input'), true);
    $id = intval($dados['id'] ?? 0);
    
    if ($id <= 0) {
        retornar_json(false, "ID inválido");
    }
    
    // Verificar se unidade está em uso
    $stmt = $conexao->prepare("SELECT COUNT(*) as total FROM moradores WHERE unidade IN (SELECT nome FROM unidades WHERE id = ?)");
    $stmt->bind_param("i", $id);
    $stmt->execute();
    $resultado = $stmt->get_result();
    $row = $resultado->fetch_assoc();
    $stmt->close();
    
    if ($row['total'] > 0) {
        retornar_json(false, "Não é possível excluir. Existem {$row['total']} morador(es) vinculado(s) a esta unidade.");
    }
    
    // Buscar nome antes de excluir
    $stmt = $conexao->prepare("SELECT nome FROM unidades WHERE id = ?");
    $stmt->bind_param("i", $id);
    $stmt->execute();
    $resultado = $stmt->get_result();
    $unidade = $resultado->fetch_assoc();
    $stmt->close();
    
    if (!$unidade) {
        retornar_json(false, "Unidade não encontrada");
    }
    
    // Excluir unidade
    $stmt = $conexao->prepare("DELETE FROM unidades WHERE id = ?");
    $stmt->bind_param("i", $id);
    
    if ($stmt->execute()) {
        registrar_log($conexao, 'INFO', "Unidade excluída: {$unidade['nome']} (ID: $id)");
        retornar_json(true, "Unidade excluída com sucesso");
    } else {
        retornar_json(false, "Erro ao excluir unidade: " . $stmt->error);
    }
    
    $stmt->close();
}

fechar_conexao($conexao);
