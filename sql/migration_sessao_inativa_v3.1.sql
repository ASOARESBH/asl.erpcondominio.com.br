-- ============================================================
-- MIGRAÇÃO v3.1 — Sessão Inativa (Nunca Expira)
-- Data: 2026-05-13
-- ============================================================
-- Execute este script no phpMyAdmin ou via MySQL CLI.
-- É seguro executar múltiplas vezes (idempotente).
-- ============================================================

-- 1. Adicionar campo sessao_inativa na tabela usuarios
--    (0 = sessão normal com timeout, 1 = sessão nunca expira)
ALTER TABLE `usuarios`
    ADD COLUMN IF NOT EXISTS `sessao_inativa` TINYINT(1) NOT NULL DEFAULT 0
        COMMENT 'Se 1, o sistema nunca faz logout automático deste usuário'
    AFTER `ativo`;

-- 2. Garantir que o campo existe mesmo em MySQL < 8 (sem IF NOT EXISTS)
--    Descomente o bloco abaixo se o servidor usar MySQL 5.x:
/*
SET @col_exists = (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'usuarios'
      AND COLUMN_NAME  = 'sessao_inativa'
);
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE `usuarios` ADD COLUMN `sessao_inativa` TINYINT(1) NOT NULL DEFAULT 0 AFTER `ativo`',
    'SELECT "Coluna sessao_inativa já existe — nenhuma alteração necessária"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
*/

-- 3. Garantir que a tabela config_sessao existe (para timeouts globais)
CREATE TABLE IF NOT EXISTS `config_sessao` (
    `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `chave`      VARCHAR(60)  NOT NULL,
    `valor`      VARCHAR(255) NOT NULL,
    `descricao`  VARCHAR(255) DEFAULT NULL,
    `atualizado` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_chave` (`chave`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Configurações globais de sessão do sistema';

-- 4. Inserir/atualizar configurações padrão de timeout
INSERT INTO `config_sessao` (`chave`, `valor`, `descricao`) VALUES
    ('timeout_total_min',       '60',  'Tempo máximo de sessão em minutos (0 = sem limite)')
ON DUPLICATE KEY UPDATE `valor` = VALUES(`valor`);

INSERT INTO `config_sessao` (`chave`, `valor`, `descricao`) VALUES
    ('timeout_inatividade_min', '0',   'Tempo de inatividade em minutos (0 = desabilitado)')
ON DUPLICATE KEY UPDATE `valor` = VALUES(`valor`);

INSERT INTO `config_sessao` (`chave`, `valor`, `descricao`) VALUES
    ('aviso_expiracao_min',     '5',   'Minutos antes da expiração para exibir aviso')
ON DUPLICATE KEY UPDATE `valor` = VALUES(`valor`);

-- 5. Verificação final
SELECT
    'usuarios'       AS tabela,
    COLUMN_NAME      AS coluna,
    COLUMN_TYPE      AS tipo,
    COLUMN_DEFAULT   AS padrao,
    COLUMN_COMMENT   AS comentario
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'usuarios'
  AND COLUMN_NAME  = 'sessao_inativa';

SELECT 'Migração v3.1 concluída com sucesso!' AS status;
