<?php
// =====================================================
// VERIFICAÇÃO DE SESSÃO COMPLETA E CENTRALIZADA - CORRIGIDA
// =====================================================
// 
// CORREÇÕES IMPLEMENTADAS:
// - Melhor tratamento de erros
// - Suporte para fornecedores e usuários comuns
// - Headers CORS melhorados
// - Validação robusta de sessão
// - Logs de debug

// Configurações de sessão
ini_set('session.cookie_httponly', 1);
ini_set('session.use_only_cookies', 1);
ini_set('session.cookie_samesite', 'Lax');
ini_set('session.gc_maxlifetime', 7200); // 2 horas

// Iniciar sessão se não estiver iniciada
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

// Headers para API
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

// Tratar requisições OPTIONS (CORS preflight)
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

/**
 * Verificar se usuário está logado
 */
function verificar_sessao_ativa() {
    // Verificar se variáveis de sessão existem
    if (!isset($_SESSION['usuario_logado']) || $_SESSION['usuario_logado'] !== true) {
        return false;
    }
    
    // Verificar se ID do usuário existe
    if (!isset($_SESSION['usuario_id']) || empty($_SESSION['usuario_id'])) {
        return false;
    }
    
    // Verificar timeout da sessão (2 horas)
    if (isset($_SESSION['login_timestamp'])) {
        $tempo_decorrido = time() - $_SESSION['login_timestamp'];
        
        // Se passou mais de 2 horas, sessão expirou
        if ($tempo_decorrido > 7200) {
            return false;
        }
        
        // Atualizar timestamp se passou mais de 5 minutos
        if ($tempo_decorrido > 300) {
            $_SESSION['login_timestamp'] = time();
        }
    }
    
    return true;
}

/**
 * Obter dados do usuário da sessão
 */
function obter_dados_usuario_sessao() {
    return [
        'id' => $_SESSION['usuario_id'] ?? null,
        'nome' => $_SESSION['usuario_nome'] ?? null,
        'email' => $_SESSION['usuario_email'] ?? null,
        'funcao' => $_SESSION['usuario_funcao'] ?? null,
        'departamento' => $_SESSION['usuario_departamento'] ?? null,
        'permissao' => $_SESSION['usuario_permissao'] ?? null,
        'tipo' => $_SESSION['usuario_tipo'] ?? 'comum', // ✅ NOVO: Tipo de usuário
        'login_timestamp' => $_SESSION['login_timestamp'] ?? null
    ];
}

/**
 * Destruir sessão
 */
function destruir_sessao() {
    $_SESSION = array();
    
    if (ini_get("session.use_cookies")) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000,
            $params["path"], $params["domain"],
            $params["secure"], $params["httponly"]
        );
    }
    
    session_destroy();
}

/**
 * Retornar resposta JSON com erro
 */
function retornar_erro($mensagem, $codigo_http = 400) {
    http_response_code($codigo_http);
    echo json_encode([
        'sucesso' => false,
        'mensagem' => $mensagem,
        'timestamp' => date('Y-m-d H:i:s')
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * Retornar resposta JSON com sucesso
 */
function retornar_sucesso($dados = []) {
    echo json_encode(array_merge([
        'sucesso' => true,
        'timestamp' => date('Y-m-d H:i:s')
    ], $dados), JSON_UNESCAPED_UNICODE);
    exit;
}

// Se for requisição GET, retornar status da sessão
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $sessao_ativa = verificar_sessao_ativa();
    
    if ($sessao_ativa) {
        $dados_usuario = obter_dados_usuario_sessao();
        
        // Calcular tempo restante
        $tempo_decorrido = time() - ($dados_usuario['login_timestamp'] ?? time());
        $tempo_restante = 7200 - $tempo_decorrido;
        
        retornar_sucesso([
            'sessao_ativa' => true,
            'usuario' => $dados_usuario,
            'tempo_restante_segundos' => max(0, $tempo_restante),
            'tempo_restante_formatado' => gmdate("H:i:s", max(0, $tempo_restante)),
            'session_id' => session_id()
        ]);
    } else {
        retornar_erro('Sessão expirada ou inválida', 401);
    }
}

// Se for requisição POST
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $acao = isset($_POST['acao']) ? trim($_POST['acao']) : '';
    
    // Validar ação
    if (empty($acao)) {
        retornar_erro('Ação não especificada', 400);
    }
    
    // Ação: logout
    if ($acao === 'logout') {
        destruir_sessao();
        
        retornar_sucesso([
            'mensagem' => 'Logout realizado com sucesso'
        ]);
    }
    
    // Ação: renovar sessão
    if ($acao === 'renovar') {
        if (verificar_sessao_ativa()) {
            $_SESSION['login_timestamp'] = time();
            
            retornar_sucesso([
                'mensagem' => 'Sessão renovada com sucesso',
                'novo_timestamp' => $_SESSION['login_timestamp']
            ]);
        } else {
            retornar_erro('Sessão inválida', 401);
        }
    }
    
    // Ação desconhecida
    retornar_erro('Ação não reconhecida: ' . htmlspecialchars($acao), 400);
}

// Método não suportado
http_response_code(405);
echo json_encode([
    'sucesso' => false,
    'mensagem' => 'Método não permitido. Use GET ou POST.',
    'timestamp' => date('Y-m-d H:i:s')
], JSON_UNESCAPED_UNICODE);
?>
