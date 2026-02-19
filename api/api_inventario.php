<?php
// =====================================================
// API PARA CRUD DE INVENTÁRIO/PATRIMÔNIO
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

// ========== LISTAR INVENTÁRIO ==========
if ($metodo === 'GET') {
    // Filtros de busca
    $filtro_numero_patrimonio = isset($_GET['numero_patrimonio']) ? trim($_GET['numero_patrimonio']) : '';
    $filtro_nf = isset($_GET['nf']) ? trim($_GET['nf']) : '';
    $filtro_situacao = isset($_GET['situacao']) ? trim($_GET['situacao']) : '';
    $filtro_status = isset($_GET['status']) ? trim($_GET['status']) : '';
    $filtro_tutela = isset($_GET['tutela']) ? intval($_GET['tutela']) : 0;
    
    $sql = "SELECT i.*, 
            u.nome as tutela_nome,
            DATE_FORMAT(i.data_compra, '%d/%m/%Y') as data_compra_formatada,
            DATE_FORMAT(i.data_baixa, '%d/%m/%Y') as data_baixa_formatada,
            DATE_FORMAT(i.data_cadastro, '%d/%m/%Y %H:%i') as data_cadastro_formatada
            FROM inventario i
            LEFT JOIN usuarios u ON i.tutela_usuario_id = u.id
            WHERE 1=1";
    
    // Aplicar filtros
    if ($filtro_numero_patrimonio) {
        $sql .= " AND i.numero_patrimonio LIKE '%" . $conexao->real_escape_string($filtro_numero_patrimonio) . "%'";
    }
    
    if ($filtro_nf) {
        $sql .= " AND i.nf LIKE '%" . $conexao->real_escape_string($filtro_nf) . "%'";
    }
    
    if ($filtro_situacao) {
        $sql .= " AND i.situacao = '" . $conexao->real_escape_string($filtro_situacao) . "'";
    }
    
    if ($filtro_status) {
        $sql .= " AND i.status = '" . $conexao->real_escape_string($filtro_status) . "'";
    }
    
    if ($filtro_tutela > 0) {
        $sql .= " AND i.tutela_usuario_id = " . $filtro_tutela;
    }
    
    $sql .= " ORDER BY i.numero_patrimonio ASC";
    
    $resultado = $conexao->query($sql);
    $itens = array();
    
    if ($resultado && $resultado->num_rows > 0) {
        while ($row = $resultado->fetch_assoc()) {
            $itens[] = $row;
        }
    }
    
    retornar_json(true, "Inventário listado com sucesso", $itens);
}

// ========== CRIAR ITEM DE INVENTÁRIO ==========
if ($metodo === 'POST') {
    $dados = json_decode(file_get_contents('php://input'), true);
    
    $numero_patrimonio = sanitizar($conexao, $dados['numero_patrimonio'] ?? '');
    $nome_item = sanitizar($conexao, $dados['nome_item'] ?? '');
    $fabricante = sanitizar($conexao, $dados['fabricante'] ?? '');
    $modelo = sanitizar($conexao, $dados['modelo'] ?? '');
    $numero_serie = sanitizar($conexao, $dados['numero_serie'] ?? '');
    $nf = sanitizar($conexao, $dados['nf'] ?? '');
    $data_compra = sanitizar($conexao, $dados['data_compra'] ?? '');
    $situacao = sanitizar($conexao, $dados['situacao'] ?? 'imobilizado');
    $valor = isset($dados['valor']) ? floatval($dados['valor']) : 0.00;
    $status = sanitizar($conexao, $dados['status'] ?? 'ativo');
    $motivo_baixa = sanitizar($conexao, $dados['motivo_baixa'] ?? '');
    $data_baixa = sanitizar($conexao, $dados['data_baixa'] ?? '');
    $tutela_usuario_id = isset($dados['tutela_usuario_id']) && $dados['tutela_usuario_id'] > 0 ? intval($dados['tutela_usuario_id']) : null;
    $observacoes = sanitizar($conexao, $dados['observacoes'] ?? '');
    
    // Validações
    if (empty($numero_patrimonio)) {
        retornar_json(false, "Número de patrimônio é obrigatório");
    }
    
    if (empty($nome_item)) {
        retornar_json(false, "Nome do item é obrigatório");
    }
    
    if (!in_array($situacao, ['imobilizado', 'circulante'])) {
        retornar_json(false, "Situação inválida");
    }
    
    if (!in_array($status, ['ativo', 'inativo'])) {
        retornar_json(false, "Status inválido");
    }
    
    // Se status = inativo, motivo de baixa é obrigatório
    if ($status === 'inativo' && empty($motivo_baixa)) {
        retornar_json(false, "Motivo de baixa é obrigatório para itens inativos");
    }
    
    // Verificar se número de patrimônio já existe
    $stmt = $conexao->prepare("SELECT id FROM inventario WHERE numero_patrimonio = ?");
    $stmt->bind_param("s", $numero_patrimonio);
    $stmt->execute();
    $stmt->store_result();
    
    if ($stmt->num_rows > 0) {
        $stmt->close();
        retornar_json(false, "Número de patrimônio já cadastrado no sistema");
    }
    $stmt->close();
    
    // Inserir item
    if ($tutela_usuario_id !== null) {
        $stmt = $conexao->prepare("INSERT INTO inventario 
            (numero_patrimonio, nome_item, fabricante, modelo, numero_serie, nf, 
             data_compra, situacao, valor, status, motivo_baixa, data_baixa, 
             tutela_usuario_id, observacoes) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $stmt->bind_param("ssssssssdsssss", 
            $numero_patrimonio, $nome_item, $fabricante, $modelo, $numero_serie, 
            $nf, $data_compra, $situacao, $valor, $status, $motivo_baixa, 
            $data_baixa, $tutela_usuario_id, $observacoes
        );
    } else {
        $stmt = $conexao->prepare("INSERT INTO inventario 
            (numero_patrimonio, nome_item, fabricante, modelo, numero_serie, nf, 
             data_compra, situacao, valor, status, motivo_baixa, data_baixa, observacoes) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $stmt->bind_param("ssssssssdssss", 
            $numero_patrimonio, $nome_item, $fabricante, $modelo, $numero_serie, 
            $nf, $data_compra, $situacao, $valor, $status, $motivo_baixa, 
            $data_baixa, $observacoes
        );
    }
    
    if ($stmt->execute()) {
        $id_inserido = $conexao->insert_id;
        registrar_log('INVENTARIO_CRIADO', "Item de inventário criado: $nome_item (Patrimônio: $numero_patrimonio)", 'Sistema');
        retornar_json(true, "Item cadastrado com sucesso", array('id' => $id_inserido));
    } else {
        retornar_json(false, "Erro ao cadastrar item: " . $stmt->error);
    }
    
    $stmt->close();
}

// ========== ATUALIZAR ITEM DE INVENTÁRIO ==========
if ($metodo === 'PUT') {
    $dados = json_decode(file_get_contents('php://input'), true);
    
    $id = intval($dados['id'] ?? 0);
    $numero_patrimonio = sanitizar($conexao, $dados['numero_patrimonio'] ?? '');
    $nome_item = sanitizar($conexao, $dados['nome_item'] ?? '');
    $fabricante = sanitizar($conexao, $dados['fabricante'] ?? '');
    $modelo = sanitizar($conexao, $dados['modelo'] ?? '');
    $numero_serie = sanitizar($conexao, $dados['numero_serie'] ?? '');
    $nf = sanitizar($conexao, $dados['nf'] ?? '');
    $data_compra = sanitizar($conexao, $dados['data_compra'] ?? '');
    $situacao = sanitizar($conexao, $dados['situacao'] ?? 'imobilizado');
    $valor = isset($dados['valor']) ? floatval($dados['valor']) : 0.00;
    $status = sanitizar($conexao, $dados['status'] ?? 'ativo');
    $motivo_baixa = sanitizar($conexao, $dados['motivo_baixa'] ?? '');
    $data_baixa = sanitizar($conexao, $dados['data_baixa'] ?? '');
    $tutela_usuario_id = isset($dados['tutela_usuario_id']) && $dados['tutela_usuario_id'] > 0 ? intval($dados['tutela_usuario_id']) : null;
    $observacoes = sanitizar($conexao, $dados['observacoes'] ?? '');
    
    // Validações
    if ($id <= 0) {
        retornar_json(false, "ID inválido");
    }
    
    if (empty($numero_patrimonio)) {
        retornar_json(false, "Número de patrimônio é obrigatório");
    }
    
    if (empty($nome_item)) {
        retornar_json(false, "Nome do item é obrigatório");
    }
    
    // Se status = inativo, motivo de baixa é obrigatório
    if ($status === 'inativo' && empty($motivo_baixa)) {
        retornar_json(false, "Motivo de baixa é obrigatório para itens inativos");
    }
    
    // Verificar se número de patrimônio já existe em outro item
    $stmt = $conexao->prepare("SELECT id FROM inventario WHERE numero_patrimonio = ? AND id != ?");
    $stmt->bind_param("si", $numero_patrimonio, $id);
    $stmt->execute();
    $stmt->store_result();
    
    if ($stmt->num_rows > 0) {
        $stmt->close();
        retornar_json(false, "Número de patrimônio já cadastrado para outro item");
    }
    $stmt->close();
    
    // Atualizar item
    if ($tutela_usuario_id !== null) {
        $stmt = $conexao->prepare("UPDATE inventario SET 
            numero_patrimonio=?, nome_item=?, fabricante=?, modelo=?, numero_serie=?, 
            nf=?, data_compra=?, situacao=?, valor=?, status=?, motivo_baixa=?, 
            data_baixa=?, tutela_usuario_id=?, observacoes=? 
            WHERE id=?");
        $stmt->bind_param("ssssssssdsssssi", 
            $numero_patrimonio, $nome_item, $fabricante, $modelo, $numero_serie, 
            $nf, $data_compra, $situacao, $valor, $status, $motivo_baixa, 
            $data_baixa, $tutela_usuario_id, $observacoes, $id
        );
    } else {
        $stmt = $conexao->prepare("UPDATE inventario SET 
            numero_patrimonio=?, nome_item=?, fabricante=?, modelo=?, numero_serie=?, 
            nf=?, data_compra=?, situacao=?, valor=?, status=?, motivo_baixa=?, 
            data_baixa=?, tutela_usuario_id=NULL, observacoes=? 
            WHERE id=?");
        $stmt->bind_param("ssssssssdssssi", 
            $numero_patrimonio, $nome_item, $fabricante, $modelo, $numero_serie, 
            $nf, $data_compra, $situacao, $valor, $status, $motivo_baixa, 
            $data_baixa, $observacoes, $id
        );
    }
    
    if ($stmt->execute()) {
        registrar_log('INVENTARIO_ATUALIZADO', "Item de inventário atualizado: $nome_item (Patrimônio: $numero_patrimonio)", 'Sistema');
        retornar_json(true, "Item atualizado com sucesso");
    } else {
        retornar_json(false, "Erro ao atualizar item: " . $stmt->error);
    }
    
    $stmt->close();
}

// ========== EXCLUIR ITEM DE INVENTÁRIO ==========
if ($metodo === 'DELETE') {
    $dados = json_decode(file_get_contents('php://input'), true);
    $id = intval($dados['id'] ?? 0);
    
    if ($id <= 0) {
        retornar_json(false, "ID inválido");
    }
    
    // Buscar informações antes de excluir
    $stmt = $conexao->prepare("SELECT numero_patrimonio, nome_item FROM inventario WHERE id = ?");
    $stmt->bind_param("i", $id);
    $stmt->execute();
    $resultado = $stmt->get_result();
    $item = $resultado->fetch_assoc();
    $stmt->close();
    
    if (!$item) {
        retornar_json(false, "Item não encontrado");
    }
    
    // Excluir item
    $stmt = $conexao->prepare("DELETE FROM inventario WHERE id = ?");
    $stmt->bind_param("i", $id);
    
    if ($stmt->execute()) {
        registrar_log('INVENTARIO_EXCLUIDO', "Item de inventário excluído: {$item['nome_item']} (Patrimônio: {$item['numero_patrimonio']})", 'Sistema');
        retornar_json(true, "Item excluído com sucesso");
    } else {
        retornar_json(false, "Erro ao excluir item: " . $stmt->error);
    }
    
    $stmt->close();
}

fechar_conexao($conexao);
