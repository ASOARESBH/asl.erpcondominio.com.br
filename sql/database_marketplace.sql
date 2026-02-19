-- ================================================================================
-- SISTEMA DE MARKETPLACE - FORNECEDORES E MORADORES
-- Data: 02/12/2025
-- Versão: 1.0.0
-- ================================================================================

-- ================================================================================
-- 1. TABELA: ramos_atividade
-- Descrição: Categorias de atividades dos fornecedores
-- ================================================================================

CREATE TABLE IF NOT EXISTS ramos_atividade (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100) NOT NULL UNIQUE,
    descricao TEXT,
    icone VARCHAR(50) DEFAULT 'fa-briefcase',
    ativo TINYINT(1) DEFAULT 1,
    data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_ativo (ativo),
    INDEX idx_nome (nome)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Inserir ramos de atividade padrão
INSERT INTO ramos_atividade (nome, descricao, icone) VALUES
('Vidraçaria', 'Serviços de instalação e manutenção de vidros', 'fa-window-restore'),
('Encanador', 'Serviços hidráulicos e encanamento', 'fa-wrench'),
('Eletricista', 'Serviços elétricos e instalações', 'fa-bolt'),
('Pintor', 'Serviços de pintura residencial e comercial', 'fa-paint-roller'),
('Marceneiro', 'Móveis planejados e serviços de marcenaria', 'fa-hammer'),
('Jardineiro', 'Serviços de jardinagem e paisagismo', 'fa-leaf'),
('Limpeza', 'Serviços de limpeza residencial e comercial', 'fa-broom'),
('Ar Condicionado', 'Instalação e manutenção de ar condicionado', 'fa-fan'),
('Serralheiro', 'Serviços de serralheria e metalurgia', 'fa-tools'),
('Pedreiro', 'Serviços de construção e reforma', 'fa-hard-hat'),
('Chaveiro', 'Serviços de chaveiro 24h', 'fa-key'),
('Dedetização', 'Controle de pragas e dedetização', 'fa-bug'),
('Gás', 'Instalação e manutenção de gás', 'fa-fire'),
('Informática', 'Serviços de TI e suporte técnico', 'fa-laptop'),
('Delivery', 'Entrega de alimentos e produtos', 'fa-motorcycle'),
('Outros', 'Outros serviços e produtos', 'fa-ellipsis-h')
ON DUPLICATE KEY UPDATE nome=nome;

-- ================================================================================
-- 2. TABELA: fornecedores
-- Descrição: Cadastro de fornecedores do marketplace
-- ================================================================================

CREATE TABLE IF NOT EXISTS fornecedores (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cpf_cnpj VARCHAR(18) NOT NULL UNIQUE,
    nome_estabelecimento VARCHAR(200) NOT NULL,
    nome_responsavel VARCHAR(150),
    ramo_atividade_id INT NOT NULL,
    endereco TEXT,
    telefone VARCHAR(20),
    email VARCHAR(150) NOT NULL UNIQUE,
    senha VARCHAR(255) NOT NULL,
    logo VARCHAR(255),
    descricao_negocio TEXT,
    horario_funcionamento VARCHAR(200),
    ativo TINYINT(1) DEFAULT 1,
    aprovado TINYINT(1) DEFAULT 0,
    data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    ultimo_acesso TIMESTAMP NULL,
    FOREIGN KEY (ramo_atividade_id) REFERENCES ramos_atividade(id),
    INDEX idx_cpf_cnpj (cpf_cnpj),
    INDEX idx_email (email),
    INDEX idx_ramo (ramo_atividade_id),
    INDEX idx_ativo (ativo),
    INDEX idx_aprovado (aprovado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ================================================================================
-- 3. TABELA: produtos_servicos
-- Descrição: Produtos e serviços oferecidos pelos fornecedores
-- ================================================================================

CREATE TABLE IF NOT EXISTS produtos_servicos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    fornecedor_id INT NOT NULL,
    nome VARCHAR(200) NOT NULL,
    tipo ENUM('produto', 'servico') NOT NULL,
    descricao TEXT,
    valor DECIMAL(10,2) NULL,
    valor_negociavel TINYINT(1) DEFAULT 0,
    imagem VARCHAR(255),
    ativo TINYINT(1) DEFAULT 1,
    data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (fornecedor_id) REFERENCES fornecedores(id) ON DELETE CASCADE,
    INDEX idx_fornecedor (fornecedor_id),
    INDEX idx_tipo (tipo),
    INDEX idx_ativo (ativo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ================================================================================
-- 4. TABELA: pedidos
-- Descrição: Pedidos realizados pelos moradores aos fornecedores
-- ================================================================================

CREATE TABLE IF NOT EXISTS pedidos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    morador_id INT NOT NULL,
    fornecedor_id INT NOT NULL,
    produto_servico_id INT NULL,
    descricao_pedido TEXT NOT NULL,
    valor_proposto DECIMAL(10,2) NULL,
    status ENUM(
        'enviado',
        'em_analise',
        'aceito',
        'recusado',
        'em_execucao',
        'finalizado_morador',
        'finalizado_fornecedor',
        'concluido',
        'cancelado'
    ) DEFAULT 'enviado',
    motivo_recusa TEXT NULL,
    data_pedido TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    data_aceite TIMESTAMP NULL,
    data_inicio_execucao TIMESTAMP NULL,
    data_finalizacao TIMESTAMP NULL,
    data_conclusao TIMESTAMP NULL,
    FOREIGN KEY (morador_id) REFERENCES moradores(id),
    FOREIGN KEY (fornecedor_id) REFERENCES fornecedores(id),
    FOREIGN KEY (produto_servico_id) REFERENCES produtos_servicos(id) ON DELETE SET NULL,
    INDEX idx_morador (morador_id),
    INDEX idx_fornecedor (fornecedor_id),
    INDEX idx_status (status),
    INDEX idx_data_pedido (data_pedido)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ================================================================================
-- 5. TABELA: avaliacoes
-- Descrição: Avaliações mútuas entre moradores e fornecedores
-- ================================================================================

CREATE TABLE IF NOT EXISTS avaliacoes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    pedido_id INT NOT NULL,
    avaliador_tipo ENUM('morador', 'fornecedor') NOT NULL,
    avaliador_id INT NOT NULL,
    avaliado_tipo ENUM('morador', 'fornecedor') NOT NULL,
    avaliado_id INT NOT NULL,
    nota INT NOT NULL CHECK (nota BETWEEN 1 AND 5),
    comentario TEXT,
    data_avaliacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE,
    INDEX idx_pedido (pedido_id),
    INDEX idx_avaliado (avaliado_tipo, avaliado_id),
    INDEX idx_nota (nota),
    UNIQUE KEY unique_avaliacao (pedido_id, avaliador_tipo, avaliador_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ================================================================================
-- 6. TABELA: historico_status_pedido
-- Descrição: Histórico de mudanças de status dos pedidos
-- ================================================================================

CREATE TABLE IF NOT EXISTS historico_status_pedido (
    id INT AUTO_INCREMENT PRIMARY KEY,
    pedido_id INT NOT NULL,
    status_anterior VARCHAR(50),
    status_novo VARCHAR(50) NOT NULL,
    usuario_tipo ENUM('morador', 'fornecedor', 'admin') NOT NULL,
    usuario_id INT NOT NULL,
    observacao TEXT,
    data_mudanca TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE,
    INDEX idx_pedido (pedido_id),
    INDEX idx_data (data_mudanca)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ================================================================================
-- 7. VIEW: v_fornecedores_completo
-- Descrição: View com dados completos dos fornecedores
-- ================================================================================

CREATE OR REPLACE VIEW v_fornecedores_completo AS
SELECT 
    f.id,
    f.cpf_cnpj,
    f.nome_estabelecimento,
    f.nome_responsavel,
    f.ramo_atividade_id,
    r.nome as ramo_atividade,
    r.icone as ramo_icone,
    f.endereco,
    f.telefone,
    f.email,
    f.logo,
    f.descricao_negocio,
    f.horario_funcionamento,
    f.ativo,
    f.aprovado,
    f.data_cadastro,
    f.ultimo_acesso,
    COUNT(DISTINCT ps.id) as total_produtos_servicos,
    COUNT(DISTINCT p.id) as total_pedidos,
    COALESCE(AVG(a.nota), 0) as media_avaliacoes,
    COUNT(DISTINCT a.id) as total_avaliacoes
FROM fornecedores f
LEFT JOIN ramos_atividade r ON f.ramo_atividade_id = r.id
LEFT JOIN produtos_servicos ps ON f.id = ps.fornecedor_id AND ps.ativo = 1
LEFT JOIN pedidos p ON f.id = p.fornecedor_id
LEFT JOIN avaliacoes a ON f.id = a.avaliado_id AND a.avaliado_tipo = 'fornecedor'
GROUP BY f.id;

-- ================================================================================
-- 8. VIEW: v_produtos_servicos_completo
-- Descrição: View com dados completos de produtos e serviços
-- ================================================================================

CREATE OR REPLACE VIEW v_produtos_servicos_completo AS
SELECT 
    ps.id,
    ps.fornecedor_id,
    f.nome_estabelecimento as fornecedor_nome,
    f.telefone as fornecedor_telefone,
    f.email as fornecedor_email,
    r.nome as ramo_atividade,
    ps.nome,
    ps.tipo,
    ps.descricao,
    ps.valor,
    ps.valor_negociavel,
    ps.imagem,
    ps.ativo,
    ps.data_criacao,
    COALESCE(AVG(a.nota), 0) as media_avaliacoes_fornecedor,
    COUNT(DISTINCT a.id) as total_avaliacoes_fornecedor
FROM produtos_servicos ps
INNER JOIN fornecedores f ON ps.fornecedor_id = f.id
INNER JOIN ramos_atividade r ON f.ramo_atividade_id = r.id
LEFT JOIN avaliacoes a ON f.id = a.avaliado_id AND a.avaliado_tipo = 'fornecedor'
GROUP BY ps.id;

-- ================================================================================
-- 9. VIEW: v_pedidos_completo
-- Descrição: View com dados completos dos pedidos
-- ================================================================================

CREATE OR REPLACE VIEW v_pedidos_completo AS
SELECT 
    p.id,
    p.morador_id,
    m.nome as morador_nome,
    m.unidade as morador_unidade,
    m.telefone as morador_telefone,
    p.fornecedor_id,
    f.nome_estabelecimento as fornecedor_nome,
    f.telefone as fornecedor_telefone,
    f.email as fornecedor_email,
    p.produto_servico_id,
    ps.nome as produto_servico_nome,
    ps.tipo as produto_servico_tipo,
    p.descricao_pedido,
    p.valor_proposto,
    p.status,
    p.motivo_recusa,
    p.data_pedido,
    p.data_aceite,
    p.data_inicio_execucao,
    p.data_finalizacao,
    p.data_conclusao,
    CASE 
        WHEN p.status = 'concluido' THEN TIMESTAMPDIFF(DAY, p.data_pedido, p.data_conclusao)
        ELSE NULL
    END as dias_para_conclusao
FROM pedidos p
INNER JOIN moradores m ON p.morador_id = m.id
INNER JOIN fornecedores f ON p.fornecedor_id = f.id
LEFT JOIN produtos_servicos ps ON p.produto_servico_id = ps.id;

-- ================================================================================
-- 10. VIEW: v_estatisticas_fornecedor
-- Descrição: Estatísticas por fornecedor
-- ================================================================================

CREATE OR REPLACE VIEW v_estatisticas_fornecedor AS
SELECT 
    f.id as fornecedor_id,
    f.nome_estabelecimento,
    COUNT(DISTINCT ps.id) as total_produtos_servicos,
    COUNT(DISTINCT CASE WHEN p.status = 'enviado' THEN p.id END) as pedidos_novos,
    COUNT(DISTINCT CASE WHEN p.status = 'em_analise' THEN p.id END) as pedidos_em_analise,
    COUNT(DISTINCT CASE WHEN p.status IN ('aceito', 'em_execucao') THEN p.id END) as pedidos_em_andamento,
    COUNT(DISTINCT CASE WHEN p.status = 'concluido' THEN p.id END) as pedidos_concluidos,
    COUNT(DISTINCT CASE WHEN p.status = 'recusado' THEN p.id END) as pedidos_recusados,
    COUNT(DISTINCT CASE WHEN p.status = 'cancelado' THEN p.id END) as pedidos_cancelados,
    COALESCE(AVG(a.nota), 0) as media_avaliacoes,
    COUNT(DISTINCT a.id) as total_avaliacoes,
    SUM(CASE WHEN p.status = 'concluido' AND p.valor_proposto IS NOT NULL THEN p.valor_proposto ELSE 0 END) as valor_total_vendas
FROM fornecedores f
LEFT JOIN produtos_servicos ps ON f.id = ps.fornecedor_id AND ps.ativo = 1
LEFT JOIN pedidos p ON f.id = p.fornecedor_id
LEFT JOIN avaliacoes a ON f.id = a.avaliado_id AND a.avaliado_tipo = 'fornecedor'
GROUP BY f.id;

-- ================================================================================
-- FIM DO SCRIPT
-- ================================================================================

-- Verificações finais
SELECT 'Tabelas criadas com sucesso!' as Mensagem;
