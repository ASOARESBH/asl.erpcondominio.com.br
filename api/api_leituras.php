<?php
// =====================================================
// API PARA LEITURAS DE HIDRÔMETROS
// =====================================================

// Segurança: garantir que falhas internas retornem JSON (nunca HTML)
ini_set('display_errors', 0);
ini_set('log_errors', 1);

// Capturar exceções e erros fatais e retornar JSON padronizado
set_exception_handler(function ($e) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    error_log('Exception em api_leituras: ' . $e->getMessage());
    echo json_encode(['sucesso' => false, 'mensagem' => 'Erro interno no servidor'], JSON_UNESCAPED_UNICODE);
    exit;
});

register_shutdown_function(function () {
    $err = error_get_last();
    if ($err && in_array($err['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR])) {
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
        error_log('Fatal error em api_leituras: ' . print_r($err, true));
        echo json_encode(['sucesso' => false, 'mensagem' => 'Erro fatal no servidor'], JSON_UNESCAPED_UNICODE);
        exit;
    }
});

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

// Constantes
define('VALOR_METRO_CUBICO', 6.16);
define('VALOR_MINIMO', 61.60);
define('CONSUMO_MINIMO', 10);

// ========== LISTAR LEITURAS ==========
if ($metodo === 'GET' && !isset($_GET['ultima_leitura']) && !isset($_GET['hidrometros_ativos'])) {
    $data_inicial = isset($_GET['data_inicial']) ? sanitizar($conexao, $_GET['data_inicial']) : '';
    $data_final = isset($_GET['data_final']) ? sanitizar($conexao, $_GET['data_final']) : '';
    $unidade = isset($_GET['unidade']) ? sanitizar($conexao, $_GET['unidade']) : '';
    $morador_id = isset($_GET['morador_id']) ? intval($_GET['morador_id']) : 0;
    
    $sql = "SELECT l.*, h.numero_hidrometro, h.numero_lacre, m.nome as morador_nome,
            DATE_FORMAT(l.data_leitura, '%d/%m/%Y %H:%i') as data_leitura_formatada,
            CASE 
                WHEN l.lancado_por_tipo = 'usuario' THEN CONCAT('👤 ', l.lancado_por_nome, ' (Operador)')
                WHEN l.lancado_por_tipo = 'morador' THEN CONCAT('🏠 ', l.lancado_por_nome, ' (Morador)')
                ELSE 'Sistema'
            END as lancado_por_descricao
            FROM leituras l
            INNER JOIN hidrometros h ON l.hidrometro_id = h.id
            INNER JOIN moradores m ON l.morador_id = m.id
            WHERE 1=1 ";
    
    if (!empty($data_inicial)) {
        $sql .= "AND DATE(l.data_leitura) >= '$data_inicial' ";
    }
    
    if (!empty($data_final)) {
        $sql .= "AND DATE(l.data_leitura) <= '$data_final' ";
    }
    
    if (!empty($unidade)) {
        $sql .= "AND l.unidade = '$unidade' ";
    }
    
    if ($morador_id > 0) {
        $sql .= "AND l.morador_id = $morador_id ";
    }
    
    $sql .= "ORDER BY l.data_leitura DESC, l.unidade ASC";
    
    $resultado = $conexao->query($sql);
    $leituras = array();
    
    if ($resultado && $resultado->num_rows > 0) {
        while ($row = $resultado->fetch_assoc()) {
            $leituras[] = $row;
        }
    }
    
    retornar_json(true, "Leituras listadas com sucesso", $leituras);
}

// ========== BUSCAR ÚLTIMA LEITURA DE UM HIDRÔMETRO ==========
if ($metodo === 'GET' && isset($_GET['ultima_leitura'])) {
    $hidrometro_id = intval($_GET['ultima_leitura']);
    
    $sql = "SELECT leitura_atual, DATE_FORMAT(data_leitura, '%d/%m/%Y %H:%i') as data_leitura_formatada
            FROM leituras 
            WHERE hidrometro_id = $hidrometro_id 
            ORDER BY data_leitura DESC 
            LIMIT 1";
    
    $resultado = $conexao->query($sql);
    
    if ($resultado && $resultado->num_rows > 0) {
        $leitura = $resultado->fetch_assoc();
        retornar_json(true, "Última leitura encontrada", $leitura);
    } else {
        retornar_json(true, "Nenhuma leitura anterior", array('leitura_atual' => 0));
    }
}

// ========== LISTAR HIDRÔMETROS ATIVOS PARA LEITURA COLETIVA ==========
if ($metodo === 'GET' && isset($_GET['hidrometros_ativos'])) {
    $pagina = isset($_GET['pagina']) ? intval($_GET['pagina']) : 1;
    $por_pagina = 20;
    $offset = ($pagina - 1) * $por_pagina;
    
    // Contar total
    $sql_count = "SELECT COUNT(*) as total FROM hidrometros WHERE ativo = 1";
    $resultado_count = $conexao->query($sql_count);
    $total = $resultado_count->fetch_assoc()['total'];
    $total_paginas = ceil($total / $por_pagina);
    
    // Buscar hidrômetros
    $sql = "SELECT h.id, h.numero_hidrometro, h.numero_lacre, h.unidade, 
            m.id as morador_id, m.nome as morador_nome,
            (SELECT leitura_atual FROM leituras WHERE hidrometro_id = h.id ORDER BY data_leitura DESC LIMIT 1) as leitura_anterior
            FROM hidrometros h
            INNER JOIN moradores m ON h.morador_id = m.id
            WHERE h.ativo = 1
            ORDER BY h.unidade ASC, m.nome ASC
            LIMIT $por_pagina OFFSET $offset";
    
    $resultado = $conexao->query($sql);
    $hidrometros = array();
    
    if ($resultado && $resultado->num_rows > 0) {
        while ($row = $resultado->fetch_assoc()) {
            if ($row['leitura_anterior'] === null) {
                $row['leitura_anterior'] = 0;
            }
            $hidrometros[] = $row;
        }
    }
    
    retornar_json(true, "Hidrômetros carregados", array(
        'hidrometros' => $hidrometros,
        'pagina_atual' => $pagina,
        'total_paginas' => $total_paginas,
        'total_registros' => $total
    ));
}

// ========== CALCULAR VALOR ==========
function calcularValor($consumo) {
    if ($consumo <= CONSUMO_MINIMO) {
        return VALOR_MINIMO;
    } else {
        return $consumo * VALOR_METRO_CUBICO;
    }
}

// ========== CRIAR LEITURA (INDIVIDUAL OU COLETIVA) ==========
if ($metodo === 'POST') {
    $dados = json_decode(file_get_contents('php://input'), true);
    
    // Verificar se é leitura coletiva
    if (isset($dados['leituras']) && is_array($dados['leituras'])) {
        // LEITURA COLETIVA
        $sucesso = 0;
        $erros = array();
        
        foreach ($dados['leituras'] as $leitura) {
            $hidrometro_id = intval($leitura['hidrometro_id'] ?? 0);
            $leitura_atual = floatval($leitura['leitura_atual'] ?? 0);
            $data_leitura = sanitizar($conexao, $leitura['data_leitura'] ?? '');
            
            if ($hidrometro_id <= 0 || $leitura_atual <= 0) {
                continue;
            }
            
            // Buscar dados do hidrômetro
            $stmt = $conexao->prepare("SELECT morador_id, unidade FROM hidrometros WHERE id = ?");
            $stmt->bind_param("i", $hidrometro_id);
            $stmt->execute();
            $resultado = $stmt->get_result();
            $hidrometro = $resultado->fetch_assoc();
            $stmt->close();
            
            if (!$hidrometro) {
                continue;
            }
            
            // Buscar última leitura
            $stmt = $conexao->prepare("SELECT leitura_atual FROM leituras WHERE hidrometro_id = ? ORDER BY data_leitura DESC LIMIT 1");
            $stmt->bind_param("i", $hidrometro_id);
            $stmt->execute();
            $resultado = $stmt->get_result();
            $ultima = $resultado->fetch_assoc();
            $leitura_anterior = $ultima ? floatval($ultima['leitura_atual']) : 0;
            $stmt->close();
            
            // Calcular consumo e valor
            $consumo = $leitura_atual - $leitura_anterior;
            $valor_total = calcularValor($consumo);
            
            // Inserir leitura
            $stmt = $conexao->prepare("INSERT INTO leituras (hidrometro_id, morador_id, unidade, leitura_anterior, leitura_atual, consumo, valor_metro_cubico, valor_minimo, valor_total, data_leitura) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $valor_mc = VALOR_METRO_CUBICO;
            $valor_min = VALOR_MINIMO;
            $stmt->bind_param("iisddddds", $hidrometro_id, $hidrometro['morador_id'], $hidrometro['unidade'], $leitura_anterior, $leitura_atual, $consumo, $valor_mc, $valor_min, $valor_total, $data_leitura);
            
            if ($stmt->execute()) {
                $sucesso++;
            } else {
                $erros[] = "Erro no hidrômetro ID $hidrometro_id";
            }
            $stmt->close();
        }
        
        registrar_log($conexao, 'INFO', "Leitura coletiva: $sucesso leituras registradas");
        retornar_json(true, "$sucesso leituras registradas com sucesso", array('sucesso' => $sucesso, 'erros' => $erros));
        
    } else {
        // LEITURA INDIVIDUAL
        $hidrometro_id = intval($dados['hidrometro_id'] ?? 0);
        $leitura_atual = floatval($dados['leitura_atual'] ?? 0);
        $data_leitura = sanitizar($conexao, $dados['data_leitura'] ?? '');
        $observacao = sanitizar($conexao, $dados['observacao'] ?? '');
        $lancado_por_tipo = sanitizar($conexao, $dados['lancado_por_tipo'] ?? 'usuario'); // 'usuario' ou 'morador'
        $lancado_por_id = intval($dados['lancado_por_id'] ?? 0);
        $lancado_por_nome = sanitizar($conexao, $dados['lancado_por_nome'] ?? '');
        
        if ($hidrometro_id <= 0) {
            retornar_json(false, "Hidrômetro é obrigatório");
        }
        
        if ($leitura_atual <= 0) {
            retornar_json(false, "Leitura atual é obrigatória");
        }
        
        if (empty($data_leitura)) {
            retornar_json(false, "Data da leitura é obrigatória");
        }
        
        // VALIDAR: 1 leitura por mês (usuário OU morador)
        $mes = date('m', strtotime($data_leitura));
        $ano = date('Y', strtotime($data_leitura));
        
        $stmt_check = $conexao->prepare("
            SELECT id, lancado_por_tipo, lancado_por_nome, DATE_FORMAT(data_leitura, '%d/%m/%Y %H:%i') as data_formatada
            FROM leituras 
            WHERE hidrometro_id = ? 
            AND MONTH(data_leitura) = ? 
            AND YEAR(data_leitura) = ?
            LIMIT 1
        ");
        $stmt_check->bind_param("iii", $hidrometro_id, $mes, $ano);
        $stmt_check->execute();
        $leitura_existente = $stmt_check->get_result()->fetch_assoc();
        $stmt_check->close();
        
        if ($leitura_existente) {
            $tipo_descricao = $leitura_existente['lancado_por_tipo'] === 'morador' ? 'morador' : 'operador';
            retornar_json(false, "Já existe leitura para este mês lançada por {$leitura_existente['lancado_por_nome']} ({$tipo_descricao}) em {$leitura_existente['data_formatada']}");
        }
        
        // Buscar dados do hidrômetro
        $stmt = $conexao->prepare("SELECT morador_id, unidade, numero_hidrometro FROM hidrometros WHERE id = ?");
        $stmt->bind_param("i", $hidrometro_id);
        $stmt->execute();
        $resultado = $stmt->get_result();
        $hidrometro = $resultado->fetch_assoc();
        $stmt->close();
        
        if (!$hidrometro) {
            retornar_json(false, "Hidrômetro não encontrado");
        }
        
        // Buscar última leitura
        $stmt = $conexao->prepare("SELECT leitura_atual FROM leituras WHERE hidrometro_id = ? ORDER BY data_leitura DESC LIMIT 1");
        $stmt->bind_param("i", $hidrometro_id);
        $stmt->execute();
        $resultado = $stmt->get_result();
        $ultima = $resultado->fetch_assoc();
        $leitura_anterior = $ultima ? floatval($ultima['leitura_atual']) : 0;
        $stmt->close();
        
        // Validar leitura atual: maior que anterior OU primeira leitura (anterior = 0)
        if ($leitura_atual < $leitura_anterior && $leitura_anterior != 0) {
            retornar_json(false, "Leitura atual ($leitura_atual) não pode ser menor que a leitura anterior ($leitura_anterior)");
        }
        
        // Calcular consumo e valor
        $consumo = $leitura_atual - $leitura_anterior;
        $valor_total = calcularValor($consumo);
        
        // Inserir leitura com log de quem lançou
        $stmt = $conexao->prepare("INSERT INTO leituras (hidrometro_id, morador_id, unidade, leitura_anterior, leitura_atual, consumo, valor_metro_cubico, valor_minimo, valor_total, data_leitura, observacao, lancado_por_tipo, lancado_por_id, lancado_por_nome) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $valor_mc = VALOR_METRO_CUBICO;
        $valor_min = VALOR_MINIMO;
        $stmt->bind_param("iisddddddsssis", $hidrometro_id, $hidrometro['morador_id'], $hidrometro['unidade'], $leitura_anterior, $leitura_atual, $consumo, $valor_mc, $valor_min, $valor_total, $data_leitura, $observacao, $lancado_por_tipo, $lancado_por_id, $lancado_por_nome);
        
        if ($stmt->execute()) {
            $id = $conexao->insert_id;
            registrar_log($conexao, 'INFO', "Leitura registrada: Hidrômetro {$hidrometro['numero_hidrometro']} - Consumo: {$consumo}m³ - Valor: R$ {$valor_total}");
            retornar_json(true, "Leitura registrada com sucesso", array(
                'id' => $id,
                'consumo' => $consumo,
                'valor_total' => $valor_total
            ));
        } else {
            retornar_json(false, "Erro ao registrar leitura: " . $stmt->error);
        }
        
        $stmt->close();
    }
}

fechar_conexao($conexao);
