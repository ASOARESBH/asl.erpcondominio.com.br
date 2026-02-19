<?php
/**
 * API PARA CRUD DE VEÍCULOS - COM SUPORTE A DEPENDENTES
 * 
 * Funcionalidades:
 * 1. Listar veículos de um morador
 * 2. Listar veículos de um dependente
 * 3. Obter veículo específico
 * 4. Criar veículo (com validações de placa, TAG e dependente)
 * 5. Atualizar veículo
 * 6. Deletar veículo
 * 7. Validar placa duplicada
 * 8. Validar TAG duplicada
 * 9. Validar um veículo por dependente
 */

// Limpar qualquer saída anterior
ob_start();

require_once 'config.php';
require_once 'auth_helper.php';
require_once 'error_logger.php';
require_once 'debug_veiculos.php';

// Registrar debug inicial
registrar_debug('INICIO', 'API de veículos iniciada', array(
    'GET' => $_GET,
    'REQUEST_METHOD' => $_SERVER['REQUEST_METHOD']
));

// Limpar buffer e definir headers
ob_end_clean();
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-cache, must-revalidate');
header('Access-Control-Allow-Origin: http://erp.asserradaliberdade.ong.br');
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

// Tratar OPTIONS (preflight)
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Função para retornar JSON
if (!function_exists('retornar_json')) {
    function retornar_json($sucesso, $mensagem, $dados = null) {
        header('Content-Type: application/json; charset=utf-8');
        $resposta = array(
            'sucesso' => $sucesso,
            'mensagem' => $mensagem
        );
        if ($dados !== null) {
            $resposta['dados'] = $dados;
        }
        echo json_encode($resposta, JSON_UNESCAPED_UNICODE);
        exit;
    }
}

try {
    // Verificar autenticação
    verificarAutenticacao(true, 'operador');
    
    $metodo = $_SERVER['REQUEST_METHOD'];
    $conexao = conectar_banco();
    
    if (!$conexao) {
        throw new Exception("Erro ao conectar ao banco de dados");
    }
    
    // Para operações de escrita, verificar permissão de admin
    if ($metodo !== 'GET') {
        verificarPermissao('admin');
    }
    
    // ========== LISTAR TODOS OS VEÍCULOS (COM SUPORTE A FILTROS) ==========
    if ($metodo === 'GET' && !isset($_GET['morador_id']) && !isset($_GET['id'])) {
        registrar_debug('LISTAR_TODOS', 'Listando todos os veículos');
        
        try {
            // Construir query com filtros opcionais
            $query = "
                SELECT v.id, v.placa, v.modelo, v.cor, v.tag, v.morador_id, v.dependente_id, 
                       v.ativo, DATE_FORMAT(v.data_cadastro, '%d/%m/%Y %H:%i') as data_cadastro,
                       m.nome as morador_nome,
                       d.nome_completo as dependente_nome
                FROM veiculos v
                INNER JOIN moradores m ON v.morador_id = m.id
                LEFT JOIN dependentes d ON v.dependente_id = d.id
                WHERE 1=1
            ";
            
            $params = array();
            $tipos = '';
            
            // Filtro por placa
            if (!empty($_GET['placa'])) {
                $placa_filtro = '%' . sanitizar($conexao, $_GET['placa']) . '%';
                $query .= " AND v.placa LIKE ?";
                $params[] = $placa_filtro;
                $tipos .= 's';
            }
            
            // Filtro por nome do morador
            if (!empty($_GET['morador_nome'])) {
                $morador_nome_filtro = '%' . sanitizar($conexao, $_GET['morador_nome']) . '%';
                $query .= " AND m.nome LIKE ?";
                $params[] = $morador_nome_filtro;
                $tipos .= 's';
            }
            
            // Filtro por dependente
            if (!empty($_GET['dependente'])) {
                $dependente_filtro = '%' . sanitizar($conexao, $_GET['dependente']) . '%';
                $query .= " AND d.nome_completo LIKE ?";
                $params[] = $dependente_filtro;
                $tipos .= 's';
            }
            
            $query .= " ORDER BY v.data_cadastro DESC";
            
            $stmt = $conexao->prepare($query);
            
            if (!$stmt) {
                throw new Exception("Erro ao preparar query: " . $conexao->error);
            }
            
            // Bind dos parâmetros de filtro
            if (!empty($params)) {
                $stmt->bind_param($tipos, ...$params);
            }
            
            $stmt->execute();
            $resultado = $stmt->get_result();
            $veiculos = array();
            
            if ($resultado && $resultado->num_rows > 0) {
                while ($row = $resultado->fetch_assoc()) {
                    $veiculos[] = $row;
                }
            }
            
            $stmt->close();
            
            registrar_debug('LISTAR_TODOS_SUCESSO', 'Veículos listados', array(
                'total' => count($veiculos)
            ));
            
            retornar_json(true, "Veículos listados com sucesso", $veiculos);
        } catch (Exception $e) {
            registrar_debug('LISTAR_TODOS_ERRO', $e->getMessage());
            $errorLogger->registrarErroAPI('listar_todos', $e->getMessage());
            throw $e;
        }
    }
    
    // ========== LISTAR VEÍCULOS DE UM MORADOR ==========
    if ($metodo === 'GET' && isset($_GET['morador_id'])) {
        $morador_id = intval($_GET['morador_id']);
        
        if ($morador_id <= 0) {
            retornar_json(false, "ID do morador inválido");
        }
        
        try {
            $stmt = $conexao->prepare("
                SELECT v.id, v.placa, v.modelo, v.cor, v.tag, v.morador_id, v.dependente_id, 
                       v.ativo, DATE_FORMAT(v.data_cadastro, '%d/%m/%Y %H:%i') as data_cadastro,
                       d.nome_completo as dependente_nome
                FROM veiculos v
                LEFT JOIN dependentes d ON v.dependente_id = d.id
                WHERE v.morador_id = ?
                ORDER BY v.data_cadastro DESC
            ");
            
            if (!$stmt) {
                throw new Exception("Erro ao preparar query: " . $conexao->error);
            }
            
            $stmt->bind_param("i", $morador_id);
            $stmt->execute();
            $resultado = $stmt->get_result();
            $veiculos = array();
            
            if ($resultado && $resultado->num_rows > 0) {
                while ($row = $resultado->fetch_assoc()) {
                    $veiculos[] = $row;
                }
            }
            
            $stmt->close();
            
            retornar_json(true, "Veículos listados com sucesso", $veiculos);
        } catch (Exception $e) {
            $errorLogger->registrarErroAPI('listar', $e->getMessage(), array('morador_id' => $morador_id));
            throw $e;
        }
    }
    
    // ========== OBTER VEÍCULO ESPECÍFICO ==========
    if ($metodo === 'GET' && isset($_GET['id'])) {
        $id = intval($_GET['id']);
        
        if ($id <= 0) {
            retornar_json(false, "ID inválido");
        }
        
        try {
            $stmt = $conexao->prepare("
                SELECT v.id, v.placa, v.modelo, v.cor, v.tag, v.morador_id, v.dependente_id, 
                       v.ativo, DATE_FORMAT(v.data_cadastro, '%d/%m/%Y %H:%i') as data_cadastro,
                       d.nome_completo as dependente_nome
                FROM veiculos v
                LEFT JOIN dependentes d ON v.dependente_id = d.id
                WHERE v.id = ?
            ");
            
            if (!$stmt) {
                throw new Exception("Erro ao preparar query: " . $conexao->error);
            }
            
            $stmt->bind_param("i", $id);
            $stmt->execute();
            $resultado = $stmt->get_result();
            
            if ($resultado && $resultado->num_rows > 0) {
                $veiculo = $resultado->fetch_assoc();
                $stmt->close();
                retornar_json(true, "Veículo obtido com sucesso", $veiculo);
            } else {
                $stmt->close();
                retornar_json(false, "Veículo não encontrado");
            }
        } catch (Exception $e) {
            $errorLogger->registrarErroAPI('obter', $e->getMessage(), array('id' => $id));
            throw $e;
        }
    }
    
    // ========== CRIAR VEÍCULO ==========
    if ($metodo === 'POST') {
        $errorLogger->registrarInfo('Iniciando criacao de veiculo', array('metodo' => 'POST'));
        $dados = json_decode(file_get_contents('php://input'), true);
        
        if (!is_array($dados)) {
            retornar_json(false, "Dados inválidos. Esperado JSON válido");
        }
        
        $placa = sanitizar($conexao, strtoupper($dados['placa'] ?? ''));
        $modelo = sanitizar($conexao, $dados['modelo'] ?? '');
        $cor = sanitizar($conexao, $dados['cor'] ?? '');
        $tag = sanitizar($conexao, $dados['tag'] ?? '');
        $morador_id = intval($dados['morador_id'] ?? 0);
        $dependente_id = isset($dados['dependente_id']) && !empty($dados['dependente_id']) ? intval($dados['dependente_id']) : null;
        
        // Validações
        if (empty($placa) || empty($modelo) || empty($tag) || $morador_id <= 0) {
            retornar_json(false, "Placa, modelo, TAG e morador são obrigatórios");
        }
        
        try {
            // Verificar se morador existe
            $stmt = $conexao->prepare("SELECT id FROM moradores WHERE id = ?");
            if (!$stmt) {
                throw new Exception("Erro ao preparar query: " . $conexao->error);
            }
            $stmt->bind_param("i", $morador_id);
            $stmt->execute();
            $stmt->store_result();
            
            if ($stmt->num_rows == 0) {
                $stmt->close();
                retornar_json(false, "Morador não encontrado");
            }
            $stmt->close();
            
            // Se dependente_id foi informado, verificar se existe e pertence ao morador
            if ($dependente_id !== null) {
                $stmt = $conexao->prepare("SELECT id FROM dependentes WHERE id = ? AND morador_id = ?");
                if (!$stmt) {
                    throw new Exception("Erro ao preparar query: " . $conexao->error);
                }
                $stmt->bind_param("ii", $dependente_id, $morador_id);
                $stmt->execute();
                $stmt->store_result();
                
                if ($stmt->num_rows == 0) {
                    $stmt->close();
                    retornar_json(false, "Dependente não encontrado ou não pertence ao morador");
                }
                $stmt->close();
                
                // Verificar se dependente já tem um veículo
                $stmt = $conexao->prepare("SELECT id FROM veiculos WHERE dependente_id = ?");
                if (!$stmt) {
                    throw new Exception("Erro ao preparar query: " . $conexao->error);
                }
                $stmt->bind_param("i", $dependente_id);
                $stmt->execute();
                $stmt->store_result();
                
                if ($stmt->num_rows > 0) {
                    $stmt->close();
                    retornar_json(false, "Este dependente já possui um veículo cadastrado. Máximo de 1 veículo por dependente");
                }
                $stmt->close();
            }
            
            // Verificar se placa já existe
            $stmt = $conexao->prepare("SELECT id FROM veiculos WHERE placa = ?");
            if (!$stmt) {
                throw new Exception("Erro ao preparar query: " . $conexao->error);
            }
            $stmt->bind_param("s", $placa);
            $stmt->execute();
            $stmt->store_result();
            
            if ($stmt->num_rows > 0) {
                $stmt->close();
                retornar_json(false, "Placa já cadastrada no sistema");
            }
            $stmt->close();
            
            // Verificar se TAG já existe
            $stmt = $conexao->prepare("SELECT id FROM veiculos WHERE tag = ?");
            if (!$stmt) {
                throw new Exception("Erro ao preparar query: " . $conexao->error);
            }
            $stmt->bind_param("s", $tag);
            $stmt->execute();
            $stmt->store_result();
            
            if ($stmt->num_rows > 0) {
                $stmt->close();
                retornar_json(false, "TAG já cadastrada no sistema");
            }
            $stmt->close();
            
            // Inserir veículo
            if ($dependente_id !== null) {
                $stmt = $conexao->prepare("INSERT INTO veiculos (placa, modelo, cor, tag, morador_id, dependente_id, ativo) VALUES (?, ?, ?, ?, ?, ?, 1)");
                if (!$stmt) {
                    throw new Exception("Erro ao preparar insert: " . $conexao->error);
                }
                $stmt->bind_param("ssssii", $placa, $modelo, $cor, $tag, $morador_id, $dependente_id);
            } else {
                $stmt = $conexao->prepare("INSERT INTO veiculos (placa, modelo, cor, tag, morador_id, ativo) VALUES (?, ?, ?, ?, ?, 1)");
                if (!$stmt) {
                    throw new Exception("Erro ao preparar insert: " . $conexao->error);
                }
                $stmt->bind_param("ssssi", $placa, $modelo, $cor, $tag, $morador_id);
            }
            
            if ($stmt->execute()) {
                $id_inserido = $conexao->insert_id;
                registrar_log('VEICULO_CRIADO', "Veículo criado: $placa (ID: $id_inserido)", $placa);
                $errorLogger->registrarInfo('Veículo criado com sucesso', array('id' => $id_inserido, 'placa' => $placa, 'tag' => $tag, 'morador_id' => $morador_id, 'dependente_id' => $dependente_id));
                retornar_json(true, "Veículo cadastrado com sucesso", array('id' => $id_inserido));
            } else {
                $errorLogger->registrarErroAPI('criar', "Erro ao cadastrar veículo: " . $stmt->error, array('placa' => $placa, 'tag' => $tag, 'morador_id' => $morador_id, 'dependente_id' => $dependente_id));
                throw new Exception("Erro ao cadastrar veículo: " . $stmt->error);
            }
            
            $stmt->close();
        } catch (Exception $e) {
            $errorLogger->registrarErroAPI('criar', $e->getMessage(), array('placa' => $placa, 'tag' => $tag, 'morador_id' => $morador_id, 'dependente_id' => $dependente_id));
            throw $e;
        }
    }
    
    // ========== ATUALIZAR VEÍCULO ==========
    if ($metodo === 'PUT') {
        $errorLogger->registrarInfo('Iniciando atualizacao de veiculo', array('metodo' => 'PUT'));
        $dados = json_decode(file_get_contents('php://input'), true);
        
        if (!is_array($dados)) {
            retornar_json(false, "Dados inválidos. Esperado JSON válido");
        }
        
        $id = intval($dados['id'] ?? 0);
        $placa = sanitizar($conexao, strtoupper($dados['placa'] ?? ''));
        $modelo = sanitizar($conexao, $dados['modelo'] ?? '');
        $cor = sanitizar($conexao, $dados['cor'] ?? '');
        $tag = sanitizar($conexao, $dados['tag'] ?? '');
        
        // Validações
        if ($id <= 0 || empty($placa) || empty($modelo) || empty($tag)) {
            retornar_json(false, "Dados inválidos para atualização");
        }
        
        try {
            // Verificar se placa já existe em outro veículo
            $stmt = $conexao->prepare("SELECT id FROM veiculos WHERE placa = ? AND id != ?");
            if (!$stmt) {
                throw new Exception("Erro ao preparar query: " . $conexao->error);
            }
            $stmt->bind_param("si", $placa, $id);
            $stmt->execute();
            $stmt->store_result();
            
            if ($stmt->num_rows > 0) {
                $stmt->close();
                retornar_json(false, "Placa já cadastrada para outro veículo");
            }
            $stmt->close();
            
            // Verificar se TAG já existe em outro veículo
            $stmt = $conexao->prepare("SELECT id FROM veiculos WHERE tag = ? AND id != ?");
            if (!$stmt) {
                throw new Exception("Erro ao preparar query: " . $conexao->error);
            }
            $stmt->bind_param("si", $tag, $id);
            $stmt->execute();
            $stmt->store_result();
            
            if ($stmt->num_rows > 0) {
                $stmt->close();
                retornar_json(false, "TAG já cadastrada para outro veículo");
            }
            $stmt->close();
            
            // Atualizar veículo
            $stmt = $conexao->prepare("UPDATE veiculos SET placa=?, modelo=?, cor=?, tag=? WHERE id=?");
            if (!$stmt) {
                throw new Exception("Erro ao preparar update: " . $conexao->error);
            }
            $stmt->bind_param("ssssi", $placa, $modelo, $cor, $tag, $id);
            
            if ($stmt->execute()) {
                registrar_log('VEICULO_ATUALIZADO', "Veículo atualizado: $placa (ID: $id)", $placa);
                $errorLogger->registrarInfo('Veículo atualizado com sucesso', array('id' => $id, 'placa' => $placa, 'tag' => $tag));
                retornar_json(true, "Veículo atualizado com sucesso");
            } else {
                $errorLogger->registrarErroAPI('atualizar', "Erro ao atualizar veículo: " . $stmt->error, array('id' => $id, 'placa' => $placa, 'tag' => $tag));
                throw new Exception("Erro ao atualizar veículo: " . $stmt->error);
            }
            
            $stmt->close();
        } catch (Exception $e) {
            $errorLogger->registrarErroAPI('atualizar', $e->getMessage(), array('id' => $id, 'placa' => $placa, 'tag' => $tag));
            throw $e;
        }
    }
    
    // ========== DELETAR VEÍCULO ==========
    if ($metodo === 'DELETE') {
        $errorLogger->registrarInfo('Iniciando delecao de veiculo', array('metodo' => 'DELETE'));
        $dados = json_decode(file_get_contents('php://input'), true);
        
        if (!is_array($dados)) {
            retornar_json(false, "Dados inválidos. Esperado JSON válido");
        }
        
        $id = intval($dados['id'] ?? 0);
        
        if ($id <= 0) {
            retornar_json(false, "ID inválido");
        }
        
        try {
            // Buscar placa do veículo antes de excluir
            $stmt = $conexao->prepare("SELECT placa FROM veiculos WHERE id = ?");
            if (!$stmt) {
                throw new Exception("Erro ao preparar query: " . $conexao->error);
            }
            $stmt->bind_param("i", $id);
            $stmt->execute();
            $resultado = $stmt->get_result();
            $veiculo = $resultado->fetch_assoc();
            $placa_veiculo = $veiculo['placa'] ?? 'Desconhecida';
            $stmt->close();
            
            // Excluir veículo
            $stmt = $conexao->prepare("DELETE FROM veiculos WHERE id = ?");
            if (!$stmt) {
                throw new Exception("Erro ao preparar delete: " . $conexao->error);
            }
            $stmt->bind_param("i", $id);
            
            if ($stmt->execute()) {
                registrar_log('VEICULO_DELETADO', "Veículo deletado: $placa_veiculo (ID: $id)", $placa_veiculo);
                $errorLogger->registrarInfo('Veículo deletado com sucesso', array('id' => $id, 'placa' => $placa_veiculo));
                retornar_json(true, "Veículo deletado com sucesso");
            } else {
                $errorLogger->registrarErroAPI('deletar', "Erro ao deletar veículo: " . $stmt->error, array('id' => $id));
                throw new Exception("Erro ao deletar veículo: " . $stmt->error);
            }
            
            $stmt->close();
        } catch (Exception $e) {
            $errorLogger->registrarErroAPI('deletar', $e->getMessage(), array('id' => $id));
            throw $e;
        }
    }
    
    // ========== ALTERAR STATUS DO VEÍCULO ==========
    if ($metodo === 'POST' && isset($_POST['acao']) && $_POST['acao'] === 'alternar_status') {
        $id = intval($_POST['id'] ?? 0);
        
        if ($id <= 0) {
            retornar_json(false, "ID inválido");
        }
        
        try {
            // Obter status atual
            $stmt = $conexao->prepare("SELECT ativo FROM veiculos WHERE id = ?");
            if (!$stmt) {
                throw new Exception("Erro ao preparar query: " . $conexao->error);
            }
            $stmt->bind_param("i", $id);
            $stmt->execute();
            $resultado = $stmt->get_result();
            $veiculo = $resultado->fetch_assoc();
            $stmt->close();
            
            if (!$veiculo) {
                retornar_json(false, "Veículo não encontrado");
            }
            
            $novo_status = $veiculo['ativo'] == 1 ? 0 : 1;
            
            // Atualizar status
            $stmt = $conexao->prepare("UPDATE veiculos SET ativo = ? WHERE id = ?");
            if (!$stmt) {
                throw new Exception("Erro ao preparar update: " . $conexao->error);
            }
            $stmt->bind_param("ii", $novo_status, $id);
            
            if ($stmt->execute()) {
                $status_texto = $novo_status == 1 ? 'Ativado' : 'Desativado';
                registrar_log('VEICULO_STATUS', "Veículo $status_texto (ID: $id)", "ID: $id");
                $errorLogger->registrarInfo("Veículo $status_texto com sucesso", array('id' => $id, 'novo_status' => $novo_status));
                retornar_json(true, "Veículo $status_texto com sucesso");
            } else {
                $errorLogger->registrarErroAPI('alterar_status', "Erro ao alterar status: " . $stmt->error, array('id' => $id));
                throw new Exception("Erro ao alterar status: " . $stmt->error);
            }
            
            $stmt->close();
        } catch (Exception $e) {
            $errorLogger->registrarErroAPI('alterar_status', $e->getMessage(), array('id' => $id));
            throw $e;
        }
    }
    
    // Se nenhuma ação foi executada
    retornar_json(false, "Ação não reconhecida");
    
} catch (Exception $e) {
    $errorLogger->registrarErroAPI('geral', $e->getMessage(), array());
    retornar_json(false, "Erro: " . $e->getMessage());
}
?>
