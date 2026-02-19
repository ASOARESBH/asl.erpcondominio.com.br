<?php
/**
 * API de Gerenciamento de Dispositivos (Tablets)
 * CRUD completo para dispositivos autorizados
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Tratar OPTIONS para CORS
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once 'config.php';
require_once 'auth_helper.php';
require_once 'dispositivo_token_manager.php';

// Função para retornar JSON
function retornar_json($sucesso, $mensagem, $dados = null) {
    echo json_encode([
        'sucesso' => $sucesso,
        'mensagem' => $mensagem,
        'dados' => $dados,
        'timestamp' => date('Y-m-d H:i:s')
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$metodo = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

// Criar gerenciador
$dispositivoManager = new DispositivoTokenManager($conexao);

// ========================================
// CADASTRAR DISPOSITIVO
// ========================================
if ($action === 'cadastrar' && $metodo === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    
    $nome = $input['nome'] ?? '';
    $tipo_dispositivo = $input['tipo_dispositivo'] ?? '';
    $localizacao = $input['localizacao'] ?? '';
    $status = $input['status'] ?? 'ativo';
    $responsavel = $input['responsavel'] ?? null;
    $observacao = $input['observacao'] ?? null;
    
    if (empty($nome) || empty($tipo_dispositivo) || empty($localizacao)) {
        retornar_json(false, 'Nome, tipo e localização são obrigatórios');
    }
    
    error_log("[API DISPOSITIVOS] Cadastrando dispositivo: $nome ($tipo_dispositivo)");
    
    $resultado = $dispositivoManager->cadastrarDispositivo($nome, $tipo_dispositivo, $localizacao, $status, $responsavel, $observacao);
    
    if ($resultado['sucesso']) {
        retornar_json(true, $resultado['mensagem'], [
            'dispositivo_id' => $resultado['dispositivo_id'],
            'token' => $resultado['token'],
            'secret' => $resultado['secret']
        ]);
    } else {
        retornar_json(false, $resultado['mensagem']);
    }
}

// ========================================
// LISTAR DISPOSITIVOS
// ========================================
if ($action === 'listar' && $metodo === 'GET') {
    $status = $_GET['status'] ?? null;
    
    error_log("[API DISPOSITIVOS] Listando dispositivos (Status: " . ($status ?? 'todos') . ")");
    
    $dispositivos = $dispositivoManager->listarDispositivos($status);
    
    retornar_json(true, 'Dispositivos listados com sucesso', $dispositivos);
}

// ========================================
// BUSCAR DISPOSITIVO POR ID
// ========================================
if ($action === 'buscar' && $metodo === 'GET') {
    $id = $_GET['id'] ?? 0;
    
    if (!$id) {
        retornar_json(false, 'ID não fornecido');
    }
    
    error_log("[API DISPOSITIVOS] Buscando dispositivo ID: $id");
    
    $dispositivo = $dispositivoManager->buscarPorId($id);
    
    if ($dispositivo) {
        retornar_json(true, 'Dispositivo encontrado', $dispositivo);
    } else {
        retornar_json(false, 'Dispositivo não encontrado');
    }
}

// ========================================
// ATUALIZAR STATUS
// ========================================
if ($action === 'atualizar_status' && $metodo === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    
    $id = $input['id'] ?? 0;
    $status = $input['status'] ?? '';
    
    if (!$id || !in_array($status, ['ativo', 'inativo'])) {
        retornar_json(false, 'Dados inválidos');
    }
    
    error_log("[API DISPOSITIVOS] Atualizando status: ID $id -> $status");
    
    $resultado = $dispositivoManager->atualizarStatus($id, $status);
    
    retornar_json($resultado['sucesso'], $resultado['mensagem']);
}

// ========================================
// ATUALIZAR DISPOSITIVO
// ========================================
if ($action === 'atualizar' && $metodo === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    
    $id = $input['id'] ?? 0;
    $nome = $input['nome'] ?? '';
    $tipo_dispositivo = $input['tipo_dispositivo'] ?? '';
    $localizacao = $input['localizacao'] ?? '';
    $status = $input['status'] ?? 'ativo';
    $responsavel = $input['responsavel'] ?? '';
    $observacao = $input['observacao'] ?? '';
    
    if (!$id || empty($nome) || empty($tipo_dispositivo) || empty($localizacao)) {
        retornar_json(false, 'Dados inválidos');
    }
    
    error_log("[API DISPOSITIVOS] Atualizando dispositivo ID: $id");
    
    $resultado = $dispositivoManager->atualizarDispositivo($id, $nome, $tipo_dispositivo, $localizacao, $status, $responsavel, $observacao);
    
    retornar_json($resultado['sucesso'], $resultado['mensagem']);
}

// ========================================
// DELETAR DISPOSITIVO
// ========================================
if ($action === 'deletar' && $metodo === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    
    $id = $input['id'] ?? 0;
    
    if (!$id) {
        retornar_json(false, 'ID não fornecido');
    }
    
    error_log("[API DISPOSITIVOS] Deletando dispositivo ID: $id");
    
    $resultado = $dispositivoManager->deletarDispositivo($id);
    
    retornar_json($resultado['sucesso'], $resultado['mensagem']);
}

// ========================================
// ESTATÍSTICAS
// ========================================
if ($action === 'estatisticas' && $metodo === 'GET') {
    error_log("[API DISPOSITIVOS] Buscando estatísticas");
    
    $stats = $dispositivoManager->obterEstatisticas();
    
    retornar_json(true, 'Estatísticas obtidas com sucesso', $stats);
}

// ========================================
// HISTÓRICO DE VALIDAÇÕES
// ========================================
if ($action === 'historico' && $metodo === 'GET') {
    $id = $_GET['id'] ?? 0;
    $limite = $_GET['limite'] ?? 100;
    
    if (!$id) {
        retornar_json(false, 'ID não fornecido');
    }
    
    error_log("[API DISPOSITIVOS] Buscando histórico do dispositivo ID: $id");
    
    $historico = $dispositivoManager->obterHistorico($id, $limite);
    
    retornar_json(true, 'Histórico obtido com sucesso', $historico);
}

// ========================================
// VALIDAR TOKEN (USADO PELO CONSOLE)
// ========================================
if ($action === 'validar_token' && $metodo === 'GET') {
    $token = $_GET['token'] ?? '';
    
    if (empty($token)) {
        retornar_json(false, 'Token não fornecido');
    }
    
    error_log("[API DISPOSITIVOS] Validando token: $token");
    
    $resultado = $dispositivoManager->validarDispositivo($token);
    
    if ($resultado['valido']) {
        retornar_json(true, 'Dispositivo autorizado', [
            'dispositivo_id' => $resultado['dispositivo_id'],
            'nome' => $resultado['nome'],
            'local' => $resultado['local']
        ]);
    } else {
        retornar_json(false, $resultado['mensagem'], [
            'motivo' => $resultado['motivo']
        ]);
    }
}

// ========================================
// AÇÃO NÃO RECONHECIDA
// ========================================
retornar_json(false, 'Ação não reconhecida', [
    'action' => $action,
    'acoes_disponiveis' => [
        'cadastrar' => 'Cadastra novo dispositivo (POST)',
        'listar' => 'Lista dispositivos (GET)',
        'buscar' => 'Busca dispositivo por ID (GET)',
        'atualizar_status' => 'Atualiza status do dispositivo (POST)',
        'atualizar' => 'Atualiza dados do dispositivo (POST)',
        'deletar' => 'Deleta dispositivo (POST)',
        'estatisticas' => 'Retorna estatísticas (GET)',
        'historico' => 'Retorna histórico de validações (GET)',
        'validar_token' => 'Valida token do dispositivo (GET)'
    ]
]);
?>
