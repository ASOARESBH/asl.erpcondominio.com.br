<?php
// =====================================================
// API PARA LISTAR PROTOCOLOS DO MORADOR LOGADO
// =====================================================

session_start();

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

// Verificar se o morador está logado
if (!isset($_SESSION['morador_logado']) || $_SESSION['morador_logado'] !== true) {
    retornar_json(false, "Sessão inválida. Faça login novamente.");
}

$metodo = $_SERVER['REQUEST_METHOD'];
$conexao = conectar_banco();
$morador_id = $_SESSION['morador_id'];

// ========== LISTAR PROTOCOLOS DO MORADOR ==========
if ($metodo === 'GET') {
    // Filtro de status (opcional)
    $filtro_status = isset($_GET['status']) ? trim($_GET['status']) : '';
    
    $sql = "SELECT p.id, p.descricao_mercadoria, p.codigo_nf, p.pagina, 
            DATE_FORMAT(p.data_hora_recebimento, '%d/%m/%Y %H:%i') as data_hora_recebimento,
            p.recebedor_portaria, p.status, p.nome_recebedor_morador,
            DATE_FORMAT(p.data_hora_entrega, '%d/%m/%Y %H:%i') as data_hora_entrega,
            u.nome as unidade_nome
            FROM protocolos p
            LEFT JOIN unidades u ON p.unidade_id = u.id
            WHERE p.morador_id = ?";
    
    // Aplicar filtro de status se fornecido
    if ($filtro_status && in_array($filtro_status, ['pendente', 'entregue'])) {
        $sql .= " AND p.status = '" . $conexao->real_escape_string($filtro_status) . "'";
    }
    
    $sql .= " ORDER BY p.data_hora_recebimento DESC";
    
    $stmt = $conexao->prepare($sql);
    $stmt->bind_param("i", $morador_id);
    $stmt->execute();
    $resultado = $stmt->get_result();
    
    $protocolos = array();
    if ($resultado && $resultado->num_rows > 0) {
        while ($row = $resultado->fetch_assoc()) {
            $protocolos[] = $row;
        }
    }
    
    $stmt->close();
    fechar_conexao($conexao);
    retornar_json(true, "Protocolos listados com sucesso", $protocolos);
}

fechar_conexao($conexao);
retornar_json(false, "Método não permitido");

