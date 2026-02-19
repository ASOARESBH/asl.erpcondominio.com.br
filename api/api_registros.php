<?php
// =====================================================
// API PARA REGISTROS DE ACESSO
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

// ========== LISTAR REGISTROS ==========
if ($metodo === 'GET') {
    $limite = intval($_GET['limite'] ?? 100);
    
    $sql = "SELECT r.id, 
            DATE_FORMAT(r.data_hora, '%d/%m/%Y %H:%i:%s') as data_hora_formatada,
            r.data_hora,
            r.placa, r.modelo, r.cor, r.tag, r.tipo, 
            r.nome_visitante, r.unidade_destino, r.dias_permanencia,
            r.status, r.liberado, r.observacao,
            m.nome as morador_nome, m.unidade as morador_unidade
            FROM registros_acesso r
            LEFT JOIN moradores m ON r.morador_id = m.id
            ORDER BY r.data_hora DESC
            LIMIT ?";
    
    $stmt = $conexao->prepare($sql);
    $stmt->bind_param("i", $limite);
    $stmt->execute();
    $resultado = $stmt->get_result();
    
    $registros = array();
    
    if ($resultado && $resultado->num_rows > 0) {
        while ($row = $resultado->fetch_assoc()) {
            $registros[] = $row;
        }
    }
    
    $stmt->close();
    retornar_json(true, "Registros listados com sucesso", $registros);
}

// ========== CRIAR REGISTRO MANUAL ==========
if ($metodo === 'POST') {
    $dados = json_decode(file_get_contents('php://input'), true);
    
    $data_hora = $dados['data_hora'] ?? date('Y-m-d H:i:s');
    $placa = strtoupper(sanitizar($conexao, $dados['placa'] ?? ''));
    $modelo = sanitizar($conexao, $dados['modelo'] ?? '');
    $cor = sanitizar($conexao, $dados['cor'] ?? '');
    $tipo = sanitizar($conexao, $dados['tipo'] ?? '');
    $unidade_destino = sanitizar($conexao, $dados['unidade_destino'] ?? '');
    $dias_permanencia = intval($dados['dias_permanencia'] ?? 0);
    $nome_visitante = sanitizar($conexao, $dados['nome_visitante'] ?? '');
    $observacao = sanitizar($conexao, $dados['observacao'] ?? '');
    
    // Validações
    if (empty($placa) || empty($tipo)) {
        retornar_json(false, "Placa e tipo são obrigatórios");
    }
    
    if (!in_array($tipo, ['Morador', 'Visitante', 'Prestador'])) {
        retornar_json(false, "Tipo inválido");
    }
    
    $morador_id = null;
    $tag = null;
    $liberado = 0;
    $status = '';
    
    // Se for morador, buscar no banco
    if ($tipo === 'Morador') {
        $stmt = $conexao->prepare("SELECT v.tag, v.morador_id, m.nome, m.unidade 
                                   FROM veiculos v 
                                   INNER JOIN moradores m ON v.morador_id = m.id 
                                   WHERE v.placa = ? AND v.ativo = 1");
        $stmt->bind_param("s", $placa);
        $stmt->execute();
        $resultado = $stmt->get_result();
        
        if ($resultado->num_rows > 0) {
            $veiculo = $resultado->fetch_assoc();
            $morador_id = $veiculo['morador_id'];
            $tag = $veiculo['tag'];
            $liberado = 1;
            $status = "✅ Acesso liberado - " . $veiculo['nome'];
            $unidade_destino = $veiculo['unidade'];
        } else {
            $status = "❌ Acesso negado - Placa não cadastrada";
            $liberado = 0;
        }
        $stmt->close();
    } else {
        // Visitante ou Prestador
        $status = "🟨 Registro manual - $tipo";
        $liberado = 1; // Pode ser liberado manualmente
    }
    
    // Inserir registro
    $stmt = $conexao->prepare("INSERT INTO registros_acesso 
                              (data_hora, placa, modelo, cor, tag, tipo, morador_id, 
                               nome_visitante, unidade_destino, dias_permanencia, status, liberado, observacao) 
                              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    
    $stmt->bind_param("ssssssississs", 
        $data_hora, $placa, $modelo, $cor, $tag, $tipo, $morador_id,
        $nome_visitante, $unidade_destino, $dias_permanencia, $status, $liberado, $observacao
    );
    
    if ($stmt->execute()) {
        $id_inserido = $conexao->insert_id;
        registrar_log('REGISTRO_CRIADO', "Registro manual criado: $placa ($tipo)");
        retornar_json(true, $status, array('id' => $id_inserido, 'liberado' => $liberado, 'status' => $status));
    } else {
        retornar_json(false, "Erro ao criar registro: " . $stmt->error);
    }
    
    $stmt->close();
}

// ========== ATUALIZAR REGISTRO ==========
if ($metodo === 'PUT') {
    $dados = json_decode(file_get_contents('php://input'), true);
    
    $id = intval($dados['id'] ?? 0);
    $observacao = sanitizar($conexao, $dados['observacao'] ?? '');
    $status = sanitizar($conexao, $dados['status'] ?? '');
    
    if ($id <= 0) {
        retornar_json(false, "ID inválido");
    }
    
    $stmt = $conexao->prepare("UPDATE registros_acesso SET observacao=?, status=? WHERE id=?");
    $stmt->bind_param("ssi", $observacao, $status, $id);
    
    if ($stmt->execute()) {
        registrar_log('REGISTRO_ATUALIZADO', "Registro atualizado: ID $id");
        retornar_json(true, "Registro atualizado com sucesso");
    } else {
        retornar_json(false, "Erro ao atualizar registro: " . $stmt->error);
    }
    
    $stmt->close();
}

// ========== EXCLUIR REGISTRO ==========
if ($metodo === 'DELETE') {
    $dados = json_decode(file_get_contents('php://input'), true);
    $id = intval($dados['id'] ?? 0);
    
    if ($id <= 0) {
        retornar_json(false, "ID inválido");
    }
    
    $stmt = $conexao->prepare("DELETE FROM registros_acesso WHERE id = ?");
    $stmt->bind_param("i", $id);
    
    if ($stmt->execute()) {
        registrar_log('REGISTRO_EXCLUIDO', "Registro excluído: ID $id");
        retornar_json(true, "Registro excluído com sucesso");
    } else {
        retornar_json(false, "Erro ao excluir registro: " . $stmt->error);
    }
    
    $stmt->close();
}

fechar_conexao($conexao);
