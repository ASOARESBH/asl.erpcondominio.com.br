<?php
// =====================================================
// API PARA DADOS DE HIDRÔMETRO DO MORADOR LOGADO
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

// ========== OBTER DADOS DO HIDRÔMETRO DO MORADOR ==========
if ($metodo === 'GET') {
    // Buscar TODOS os hidrômetros do morador (para histórico)
    $sql_todos = "SELECT h.id, h.numero_hidrometro, h.numero_lacre, h.unidade, h.ativo,
            DATE_FORMAT(h.data_instalacao, '%d/%m/%Y') as data_instalacao,
            DATE_FORMAT(h.data_instalacao, '%Y-%m-%d %H:%i:%s') as data_instalacao_raw
            FROM hidrometros h
            WHERE h.morador_id = ?
            ORDER BY h.ativo DESC, h.data_instalacao DESC";
    
    $stmt_todos = $conexao->prepare($sql_todos);
    $stmt_todos->bind_param("i", $morador_id);
    $stmt_todos->execute();
    $resultado_todos = $stmt_todos->get_result();
    
    $todos_hidrometros = array();
    $hidrometro_ativo = null;
    
    if ($resultado_todos && $resultado_todos->num_rows > 0) {
        while ($row = $resultado_todos->fetch_assoc()) {
            $todos_hidrometros[] = $row;
            
            // Capturar o hidrômetro ativo
            if ($row['ativo'] == 1 && $hidrometro_ativo === null) {
                $hidrometro_ativo = $row;
            }
        }
    }
    
    $stmt_todos->close();
    
    // Se não houver hidrômetro ativo, retornar vazio
    if ($hidrometro_ativo === null) {
        fechar_conexao($conexao);
        retornar_json(true, "Nenhum hidrômetro ativo encontrado", array(
            'todos_hidrometros' => $todos_hidrometros,
            'hidrometro_ativo' => null,
            'leituras' => array()
        ));
    }
    
    $hidrometro_id = $hidrometro_ativo['id'];
    
    // Buscar histórico de leituras do morador
    $sql_leituras = "SELECT 
        l.id,
        DATE_FORMAT(l.data_leitura, '%d/%m/%Y %H:%i') as data_leitura,
        l.leitura_anterior,
        l.leitura_atual,
        l.consumo,
        l.valor_total,
        l.observacao,
        h.numero_hidrometro,
        h.numero_lacre,
        h.ativo as hidrometro_ativo,
        DATE_FORMAT(h.data_instalacao, '%d/%m/%Y') as data_instalacao_hidrometro
        FROM leituras l
        INNER JOIN hidrometros h ON l.hidrometro_id = h.id
        WHERE l.morador_id = ?
        ORDER BY l.data_leitura DESC
        LIMIT 24";
    
    $stmt_leituras = $conexao->prepare($sql_leituras);
    $stmt_leituras->bind_param("i", $morador_id);
    $stmt_leituras->execute();
    $resultado_leituras = $stmt_leituras->get_result();
    
    $leituras = array();
    if ($resultado_leituras && $resultado_leituras->num_rows > 0) {
        while ($row = $resultado_leituras->fetch_assoc()) {
            // Converter valores numéricos
            $row['leitura_anterior'] = floatval($row['leitura_anterior']);
            $row['leitura_atual'] = floatval($row['leitura_atual']);
            $row['consumo'] = floatval($row['consumo']);
            $row['valor_total'] = floatval($row['valor_total']);
            $row['hidrometro_ativo'] = intval($row['hidrometro_ativo']);
            
            $leituras[] = $row;
        }
    }
    
    $stmt_leituras->close();
    
    // Retornar dados completos
    $dados = array(
        'todos_hidrometros' => $todos_hidrometros,
        'hidrometro_ativo' => $hidrometro_ativo,
        'leituras' => $leituras
    );
    
    fechar_conexao($conexao);
    retornar_json(true, "Dados obtidos com sucesso", $dados);
}

fechar_conexao($conexao);
retornar_json(false, "Método não permitido");
?>
