-- ============================================================
-- Migration: Control iD v2 — Campos de comunicação + limpeza
-- Versão: 2.0 — 2026-05-28
-- Descrição:
--   1. Adiciona campos de comunicação à tabela controlid_dispositivos
--      (IP, porta, usuário/senha, tipo de integração, etc.)
--   2. Remove tabelas duplicadas/não utilizadas
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. Adicionar campos de comunicação na tabela controlid_dispositivos
--    (tabela em uso pela api_dispositivos_controlid.php)
-- ─────────────────────────────────────────────────────────────

-- Tipo de integração: bridge_local = script Python na portaria
--                     monitor_nativo = Monitor nativo da Control iD
--                     manual = apenas registro manual
ALTER TABLE `controlid_dispositivos`
  ADD COLUMN IF NOT EXISTS `tipo_integracao`  ENUM('bridge_local','monitor_nativo','manual') NOT NULL DEFAULT 'bridge_local'
    COMMENT 'Método de integração com o servidor',
  ADD COLUMN IF NOT EXISTS `ip_local`         VARCHAR(45)  DEFAULT NULL
    COMMENT 'IP do equipamento na rede local (ex: 192.168.3.150)',
  ADD COLUMN IF NOT EXISTS `porta_local`      SMALLINT UNSIGNED NOT NULL DEFAULT 80
    COMMENT 'Porta HTTP da API Control iD (padrão: 80)',
  ADD COLUMN IF NOT EXISTS `usuario_api`      VARCHAR(100) NOT NULL DEFAULT 'admin'
    COMMENT 'Usuário da API Control iD (padrão: admin)',
  ADD COLUMN IF NOT EXISTS `senha_api`        VARCHAR(255) DEFAULT NULL
    COMMENT 'Senha da API Control iD (armazenada em texto — tráfego apenas local)',
  ADD COLUMN IF NOT EXISTS `modelo`           VARCHAR(100) DEFAULT NULL
    COMMENT 'Modelo do equipamento (ex: IDUHF, iDAccess Nano, iDFlex)',
  ADD COLUMN IF NOT EXISTS `tipo_leitor`      ENUM('uhf','rfid','facial','biometria','qrcode','outro') NOT NULL DEFAULT 'uhf'
    COMMENT 'Tipo de tecnologia de leitura',
  ADD COLUMN IF NOT EXISTS `area_instalacao`  VARCHAR(200) DEFAULT NULL
    COMMENT 'Local de instalação (ex: Portaria Principal — Entrada)',
  ADD COLUMN IF NOT EXISTS `sentido_acesso`   ENUM('entrada','saida','ambos') NOT NULL DEFAULT 'ambos'
    COMMENT 'Sentido de acesso controlado por este dispositivo',
  ADD COLUMN IF NOT EXISTS `device_id_controlid` BIGINT DEFAULT NULL
    COMMENT 'ID numérico do dispositivo na Control iD (usado pelo Monitor nativo)',
  ADD COLUMN IF NOT EXISTS `bridge_api_key`   VARCHAR(255) DEFAULT NULL
    COMMENT 'Chave de autenticação usada pelo bridge local ao enviar eventos',
  ADD COLUMN IF NOT EXISTS `ativo`            TINYINT(1) NOT NULL DEFAULT 1
    COMMENT '1=Ativo, 0=Desativado';

-- ─────────────────────────────────────────────────────────────
-- 2. Garantir que a tabela controlid_dispositivos existe
--    (caso ainda não tenha sido criada no banco de produção)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `controlid_dispositivos` (
  `id`                    INT(11)      NOT NULL AUTO_INCREMENT,
  `nome_dispositivo`      VARCHAR(200) NOT NULL COMMENT 'Nome identificador (ex: Leitor UHF Portaria)',
  `serial_number`         VARCHAR(100) NOT NULL COMMENT 'Serial Number / Device ID do equipamento',
  `descricao`             TEXT         DEFAULT NULL,
  `token_autenticacao`    VARCHAR(255) DEFAULT NULL COMMENT 'Token gerado pelo ERP para autenticar o bridge',
  `ultimo_keep_alive`     DATETIME     DEFAULT NULL COMMENT 'Último heartbeat recebido do bridge',
  `tipo_integracao`       ENUM('bridge_local','monitor_nativo','manual') NOT NULL DEFAULT 'bridge_local',
  `ip_local`              VARCHAR(45)  DEFAULT NULL,
  `porta_local`           SMALLINT UNSIGNED NOT NULL DEFAULT 80,
  `usuario_api`           VARCHAR(100) NOT NULL DEFAULT 'admin',
  `senha_api`             VARCHAR(255) DEFAULT NULL,
  `modelo`                VARCHAR(100) DEFAULT NULL,
  `tipo_leitor`           ENUM('uhf','rfid','facial','biometria','qrcode','outro') NOT NULL DEFAULT 'uhf',
  `area_instalacao`       VARCHAR(200) DEFAULT NULL,
  `sentido_acesso`        ENUM('entrada','saida','ambos') NOT NULL DEFAULT 'ambos',
  `device_id_controlid`   BIGINT       DEFAULT NULL,
  `bridge_api_key`        VARCHAR(255) DEFAULT NULL,
  `ativo`                 TINYINT(1)   NOT NULL DEFAULT 1,
  `criado_em`             TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `atualizado_em`         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_serial_number` (`serial_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Dispositivos Control iD cadastrados no sistema';

-- ─────────────────────────────────────────────────────────────
-- 3. Garantir que as tabelas de eventos e fila existem
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `controlid_eventos_acesso` (
  `id`              INT(11)      NOT NULL AUTO_INCREMENT,
  `serial_number`   VARCHAR(100) NOT NULL COMMENT 'Serial do dispositivo que gerou o evento',
  `user_id`         BIGINT       DEFAULT NULL COMMENT 'ID do usuário no Control iD',
  `card_value`      VARCHAR(100) DEFAULT NULL COMMENT 'Valor da TAG/cartão lido',
  `data_hora`       DATETIME     NOT NULL COMMENT 'Data/hora do evento (do equipamento)',
  `tipo_evento`     TINYINT      DEFAULT NULL COMMENT '6=Acesso concedido, 5=Negado',
  `veiculo_id`      INT(11)      DEFAULT NULL,
  `morador_id`      INT(11)      DEFAULT NULL,
  `acesso_liberado` TINYINT(1)   DEFAULT 0,
  `criado_em`       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_serial` (`serial_number`),
  KEY `idx_data_hora` (`data_hora`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `controlid_fila_comandos` (
  `id`            INT(11)      NOT NULL AUTO_INCREMENT,
  `serial_number` VARCHAR(100) NOT NULL,
  `verbo`         ENUM('GET','POST','PUT','DELETE','PATCH') NOT NULL DEFAULT 'POST',
  `endpoint`      VARCHAR(500) NOT NULL,
  `corpo_json`    TEXT         DEFAULT NULL,
  `status`        ENUM('pendente','enviado','cancelado') NOT NULL DEFAULT 'pendente',
  `criado_em`     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `enviado_em`    DATETIME     DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_serial_status` (`serial_number`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────
-- 4. Remover tabelas duplicadas/não utilizadas
--    ATENÇÃO: Execute apenas após confirmar que não há dados
--    importantes nessas tabelas em produção.
-- ─────────────────────────────────────────────────────────────

-- Tabela antiga (versão 1 com IP/porta/senha — substituída por controlid_dispositivos)
DROP TABLE IF EXISTS `dispositivos_controlid`;
DROP TABLE IF EXISTS `dispositivos_controlid_sync_log`;
DROP TABLE IF EXISTS `dispositivos_controlid_leituras`;

-- Tabelas do bridge_receiver (versão antiga do bridge — substituídas pelas controlid_*)
-- DESCOMENTE apenas se tiver certeza que bridge_receiver.php não está mais em uso:
-- DROP TABLE IF EXISTS `bridge_eventos_log`;
-- DROP TABLE IF EXISTS `bridge_fila_comandos`;

-- Tabelas de dispositivos de segurança (câmeras/alarmes — módulo não ativo)
-- DROP TABLE IF EXISTS `dispositivos_seguranca`;
-- DROP TABLE IF EXISTS `dispositivos_tablets`;
-- DROP TABLE IF EXISTS `marcas_dispositivo`;
-- DROP TABLE IF EXISTS `modelos_dispositivo`;
-- DROP TABLE IF EXISTS `tipos_dispositivo`;
-- DROP TABLE IF EXISTS `dispositivos_console`;
-- DROP TABLE IF EXISTS `logs_validacoes_dispositivo`;
-- DROP TABLE IF EXISTS `validacoes_acesso`;

-- ─────────────────────────────────────────────────────────────
-- 5. Adicionar colunas de sincronização na tabela veiculos
--    (para rastrear se a TAG foi sincronizada com o equipamento)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE `veiculos`
  ADD COLUMN IF NOT EXISTS `controlid_user_id`      BIGINT   DEFAULT NULL
    COMMENT 'ID do usuário criado no equipamento Control iD',
  ADD COLUMN IF NOT EXISTS `controlid_tag_id`        BIGINT   DEFAULT NULL
    COMMENT 'ID da tag UHF criada no equipamento Control iD',
  ADD COLUMN IF NOT EXISTS `controlid_sincronizado`  TINYINT(1) DEFAULT 0
    COMMENT '1=TAG sincronizada com Control iD',
  ADD COLUMN IF NOT EXISTS `controlid_sync_data`     DATETIME DEFAULT NULL
    COMMENT 'Data da última sincronização com Control iD';
