<?php
/**
 * API de Gerenciamento de Sessão do Fornecedor
 * 
 * Ações disponíveis:
 * - verificar: Verifica se fornecedor está logado
 * - dados: Retorna dados do fornecedor logado
 * - logout: Faz logout do fornecedor
 */

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

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Iniciar sessão
session_start();

// Incluir arquivo de configuração
require_once 'config.php';
require_once 'auth_helper.php';

// Obter ação
$acao = $_GET['acao'] ?? $_POST['acao'] ?? '';
$metodo = $_SERVER['REQUEST_METHOD'];

try {
    switch ($acao) {
        case 'verificar':
            verificarSessao();
            break;
            
        case 'dados':
            obterDadosFornecedor();
            break;
            
        case 'logout':
            fazerLogout();
            break;
            
        default:
            http_response_code(400);
            echo json_encode([
                'sucesso' => false,
                'mensagem' => 'Ação inválida ou não especificada'
            ]);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'sucesso' => false,
        'mensagem' => 'Erro no servidor: ' . $e->getMessage()
    ]);
}

/**
 * Verifica se fornecedor está logado
 */
function verificarSessao() {
    if (!isset($_SESSION['fornecedor_id'])) {
        http_response_code(401);
        echo json_encode([
            'sucesso' => false,
            'logado' => false,
            'mensagem' => 'Fornecedor não autenticado'
        ]);
        exit;
    }

    echo json_encode([
        'sucesso' => true,
        'logado' => true,
        'fornecedor_id' => $_SESSION['fornecedor_id'],
        'email' => $_SESSION['fornecedor_email'] ?? null,
        'nome' => $_SESSION['fornecedor_nome'] ?? null
    ]);
}

/**
 * Obtém dados do fornecedor logado
 */
function obterDadosFornecedor() {
    if (!isset($_SESSION['fornecedor_id'])) {
        http_response_code(401);
        echo json_encode([
            'sucesso' => false,
            'mensagem' => 'Fornecedor não autenticado'
        ]);
        exit;
    }

    global $conn;

    $fornecedor_id = $_SESSION['fornecedor_id'];

    // Preparar query
    $stmt = $conn->prepare("
        SELECT 
            id,
            nome_estabelecimento,
            email,
            telefone,
            endereco,
            cidade,
            estado,
            cep,
            cnpj,
            data_cadastro,
            ativo
        FROM fornecedores
        WHERE id = ?
        LIMIT 1
    ");

    if (!$stmt) {
        http_response_code(500);
        echo json_encode([
            'sucesso' => false,
            'mensagem' => 'Erro ao preparar query: ' . $conn->error
        ]);
        exit;
    }

    $stmt->bind_param('i', $fornecedor_id);
    $stmt->execute();
    $result = $stmt->get_result();

    if ($result->num_rows === 0) {
        http_response_code(404);
        echo json_encode([
            'sucesso' => false,
            'mensagem' => 'Fornecedor não encontrado'
        ]);
        $stmt->close();
        exit;
    }

    $fornecedor = $result->fetch_assoc();
    $stmt->close();

    echo json_encode([
        'sucesso' => true,
        'dados' => $fornecedor
    ]);
}

/**
 * Faz logout do fornecedor
 */
function fazerLogout() {
    // Registrar logout em logs (apenas se a conexão estiver disponível)
    if (isset($_SESSION['fornecedor_id']) && isset($GLOBALS['conn'])) {
        global $conn;
        
        // Verificar se a conexão é válida
        if ($conn !== null && $conn->ping()) {
            $fornecedor_id = $_SESSION['fornecedor_id'];
            $data_hora = date('Y-m-d H:i:s');
            
            // Registrar em logs_sistema se tabela existir
            // Usar try-catch para evitar erros se a tabela não existir
            try {
                $stmt = $conn->prepare("
                    INSERT INTO logs_sistema (tipo, descricao, usuario_id, data_hora)
                    VALUES ('logout', 'Fornecedor fez logout', ?, ?)
                ");
                
                if ($stmt) {
                    $stmt->bind_param('is', $fornecedor_id, $data_hora);
                    $stmt->execute();
                    $stmt->close();
                }
            } catch (Exception $e) {
                // Silenciosamente ignora erros de log (não impede o logout)
                error_log("Erro ao registrar log de logout: " . $e->getMessage());
            }
        }
    }

    // Destruir sessão
    $_SESSION = [];
    
    // Se estiver usando cookies de sessão, limpe também
    if (ini_get("session.use_cookies")) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000,
            $params["path"], $params["domain"],
            $params["secure"], $params["httponly"]
        );
    }
    
    session_destroy();

    echo json_encode([
        'sucesso' => true,
        'mensagem' => 'Logout realizado com sucesso',
        'redirecionar' => 'login_fornecedor.html'
    ]);
}

?>