<?php
// =====================================================
// API PARA CRUD DE HIDRÔMETROS
// =====================================================

ob_start();
require_once 'config.php';
require_once 'auth_helper.php';
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

// ========== LISTAR HIDRÔMETROS ==========
if ($metodo === 'GET') {
    $busca = isset($_GET['busca']) ? sanitizar($conexao, $_GET['busca']) : '';
    $apenas_ativos = isset($_GET['ativos']) ? true : false;
    
    $sql = "SELECT h.*, m.nome as morador_nome, m.cpf as morador_cpf,
            DATE_FORMAT(h.data_instalacao, '%d/%m/%Y %H:%i') as data_instalacao_formatada,
            DATE_FORMAT(h.data_cadastro, '%d/%m/%Y %H:%i') as data_cadastro_formatada,
            (SELECT leitura_atual FROM leituras WHERE hidrometro_id = h.id ORDER BY data_leitura DESC LIMIT 1) as ultima_leitura
            FROM hidrometros h
            INNER JOIN moradores m ON h.morador_id = m.id
            WHERE 1=1 ";
    
    if ($apenas_ativos) {
        $sql .= "AND h.ativo = 1 ";
    }
    
    if (!empty($busca)) {
        $sql .= "AND (h.numero_hidrometro LIKE '%$busca%' 
                 OR h.unidade LIKE '%$busca%' 
                 OR m.nome LIKE '%$busca%') ";
    }
    
    $sql .= "ORDER BY h.unidade ASC, m.nome ASC";
    
    $resultado = $conexao->query($sql);
    $hidrometros = array();
    
    if ($resultado && $resultado->num_rows > 0) {
        while ($row = $resultado->fetch_assoc()) {
            $hidrometros[] = $row;
        }
    }
    
    retornar_json(true, "Hidrômetros listados com sucesso", $hidrometros);
}

// ========== CRIAR HIDRÔMETRO ==========
if ($metodo === 'POST') {
    $dados = json_decode(file_get_contents('php://input'), true);
    
    $morador_id = intval($dados['morador_id'] ?? 0);
    $unidade = sanitizar($conexao, $dados['unidade'] ?? '');
    $numero_hidrometro = sanitizar($conexao, $dados['numero_hidrometro'] ?? '');
    $numero_lacre = sanitizar($conexao, $dados['numero_lacre'] ?? '');
    $data_instalacao = sanitizar($conexao, $dados['data_instalacao'] ?? '');
    
    // Validações
    if ($morador_id <= 0) {
        retornar_json(false, "Morador é obrigatório");
    }
    
    if (empty($numero_hidrometro)) {
        retornar_json(false, "Número do hidrômetro é obrigatório");
    }
    
    if (empty($data_instalacao)) {
        retornar_json(false, "Data de instalação é obrigatória");
    }
    
    // Verificar se número já existe
    $stmt = $conexao->prepare("SELECT id FROM hidrometros WHERE numero_hidrometro = ?");
    $stmt->bind_param("s", $numero_hidrometro);
    $stmt->execute();
    $stmt->store_result();
    
    if ($stmt->num_rows > 0) {
        retornar_json(false, "Número de hidrômetro já cadastrado no sistema");
    }
    $stmt->close();
    
    // Inserir hidrômetro
    $stmt = $conexao->prepare("INSERT INTO hidrometros (morador_id, unidade, numero_hidrometro, numero_lacre, data_instalacao) VALUES (?, ?, ?, ?, ?)");
    $stmt->bind_param("issss", $morador_id, $unidade, $numero_hidrometro, $numero_lacre, $data_instalacao);
    
    if ($stmt->execute()) {
        $id = $conexao->insert_id;
        registrar_log($conexao, 'INFO', "Hidrômetro cadastrado: $numero_hidrometro (ID: $id)");
        retornar_json(true, "Hidrômetro cadastrado com sucesso", array('id' => $id));
    } else {
        retornar_json(false, "Erro ao cadastrar hidrômetro: " . $stmt->error);
    }
    
    $stmt->close();
}

// ========== ATUALIZAR HIDRÔMETRO ==========
if ($metodo === 'PUT') {
    $dados = json_decode(file_get_contents('php://input'), true);
    
    $id = intval($dados['id'] ?? 0);
    $morador_id = intval($dados['morador_id'] ?? 0);
    $unidade = sanitizar($conexao, $dados['unidade'] ?? '');
    $numero_hidrometro = sanitizar($conexao, $dados['numero_hidrometro'] ?? '');
    $numero_lacre = sanitizar($conexao, $dados['numero_lacre'] ?? '');
    $data_instalacao = sanitizar($conexao, $dados['data_instalacao'] ?? '');
    $ativo = isset($dados['ativo']) ? intval($dados['ativo']) : 1;
    $observacao = sanitizar($conexao, $dados['observacao'] ?? '');
    
    if ($id <= 0) {
        retornar_json(false, "ID inválido");
    }
    
    if (empty($observacao)) {
        retornar_json(false, "Observação é obrigatória para edição");
    }
    
    // Buscar dados anteriores
    $stmt = $conexao->prepare("SELECT * FROM hidrometros WHERE id = ?");
    $stmt->bind_param("i", $id);
    $stmt->execute();
    $resultado = $stmt->get_result();
    $anterior = $resultado->fetch_assoc();
    $stmt->close();
    
    if (!$anterior) {
        retornar_json(false, "Hidrômetro não encontrado");
    }
    
    // Verificar se número já existe em outro hidrômetro
    $stmt = $conexao->prepare("SELECT id FROM hidrometros WHERE numero_hidrometro = ? AND id != ?");
    $stmt->bind_param("si", $numero_hidrometro, $id);
    $stmt->execute();
    $stmt->store_result();
    
    if ($stmt->num_rows > 0) {
        retornar_json(false, "Número de hidrômetro já cadastrado");
    }
    $stmt->close();
    
    // Registrar histórico de alterações
    $campos_alterados = array();
    
    if ($anterior['morador_id'] != $morador_id) {
        $campos_alterados[] = array('campo' => 'morador_id', 'anterior' => $anterior['morador_id'], 'novo' => $morador_id);
    }
    if ($anterior['numero_hidrometro'] != $numero_hidrometro) {
        $campos_alterados[] = array('campo' => 'numero_hidrometro', 'anterior' => $anterior['numero_hidrometro'], 'novo' => $numero_hidrometro);
    }
    if ($anterior['numero_lacre'] != $numero_lacre) {
        $campos_alterados[] = array('campo' => 'numero_lacre', 'anterior' => $anterior['numero_lacre'], 'novo' => $numero_lacre);
    }
    if ($anterior['ativo'] != $ativo) {
        $campos_alterados[] = array('campo' => 'ativo', 'anterior' => $anterior['ativo'], 'novo' => $ativo);
    }
    
    // Inserir histórico
    foreach ($campos_alterados as $campo) {
        $stmt = $conexao->prepare("INSERT INTO hidrometros_historico (hidrometro_id, campo_alterado, valor_anterior, valor_novo, observacao) VALUES (?, ?, ?, ?, ?)");
        $stmt->bind_param("issss", $id, $campo['campo'], $campo['anterior'], $campo['novo'], $observacao);
        $stmt->execute();
        $stmt->close();
    }
    
    // Atualizar hidrômetro
    $stmt = $conexao->prepare("UPDATE hidrometros SET morador_id = ?, unidade = ?, numero_hidrometro = ?, numero_lacre = ?, data_instalacao = ?, ativo = ? WHERE id = ?");
    $stmt->bind_param("issssii", $morador_id, $unidade, $numero_hidrometro, $numero_lacre, $data_instalacao, $ativo, $id);
    
    if ($stmt->execute()) {
        registrar_log($conexao, 'INFO', "Hidrômetro atualizado: $numero_hidrometro (ID: $id) - Motivo: $observacao");
        retornar_json(true, "Hidrômetro atualizado com sucesso");
    } else {
        retornar_json(false, "Erro ao atualizar hidrômetro: " . $stmt->error);
    }
    
    $stmt->close();
}

// ========== BUSCAR HISTÓRICO ==========
if ($metodo === 'GET' && isset($_GET['historico'])) {
    $hidrometro_id = intval($_GET['historico']);
    
    $sql = "SELECT *, DATE_FORMAT(data_alteracao, '%d/%m/%Y %H:%i:%s') as data_formatada
            FROM hidrometros_historico 
            WHERE hidrometro_id = $hidrometro_id 
            ORDER BY data_alteracao DESC";
    
    $resultado = $conexao->query($sql);
    $historico = array();
    
    if ($resultado && $resultado->num_rows > 0) {
        while ($row = $resultado->fetch_assoc()) {
            $historico[] = $row;
        }
    }
    
    retornar_json(true, "Histórico carregado", $historico);
}

fechar_conexao($conexao);
