<?php
/**
 * EmailSender - Classe wrapper para PHPMailer
 * 
 * Gerencia o envio de e-mails de forma centralizada
 * utilizando configurações SMTP do banco de dados
 * 
 * @author Sistema ERP Serra da Liberdade
 * @date 29/12/2025
 */

require_once __DIR__ . '/email_error_logger.php';
require_once __DIR__ . '/../PHPMailer/PHPMailer.php';
require_once __DIR__ . '/../PHPMailer/SMTP.php';
require_once __DIR__ . '/../PHPMailer/Exception.php';

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\SMTP;
use PHPMailer\PHPMailer\Exception;

class EmailSender {
    
    private $conexao;
    private $config;
    private $mail;
    private $debug = false;
    private $smtpDebugLines = [];
    private $smtpTentativas = [];
    private $debugAuthStage = null;
    
    /**
     * Construtor
     * 
     * @param mysqli $conexao Conexão com o banco de dados
     * @param bool $debug Ativar modo debug (default: false)
     */
    public function __construct($conexao, $debug = false) {
        $this->conexao = $conexao;
        $this->debug = $debug;
        $this->carregarConfiguracao();
        $this->inicializarMailer();
    }
    
    /**
     * Carrega configurações SMTP do banco de dados
     */
    private function carregarConfiguracao() {
        $sql = "SELECT * FROM configuracao_smtp WHERE smtp_ativo = 1 ORDER BY id DESC LIMIT 1";
        $resultado = mysqli_query($this->conexao, $sql);
        
        if (!$resultado || mysqli_num_rows($resultado) == 0) {
            throw new Exception("Nenhuma configuração SMTP ativa encontrada no banco de dados");
        }
        
        $this->config = mysqli_fetch_assoc($resultado);
        
        // Validar configurações obrigatórias
        if (empty($this->config['smtp_host']) || 
            empty($this->config['smtp_usuario']) || 
            empty($this->config['smtp_senha']) || 
            empty($this->config['smtp_de_email'])) {
            throw new Exception("Configuração SMTP incompleta");
        }
    }
    
    /**
     * Inicializa o objeto PHPMailer com as configurações
     */
    private function inicializarMailer() {
        $this->mail = new PHPMailer(true);
        
        try {
            // Configurações do servidor SMTP
            $this->mail->isSMTP();
            $this->mail->Host = $this->config['smtp_host'];
            $this->mail->SMTPAuth = true;
            $this->mail->AuthType = 'LOGIN';
            $this->mail->Username = $this->config['smtp_usuario'];
            $this->mail->Password = $this->config['smtp_senha'];
            
            // Segurança
            if ($this->config['smtp_seguranca'] == 'tls') {
                $this->mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
            } elseif ($this->config['smtp_seguranca'] == 'ssl') {
                $this->mail->SMTPSecure = PHPMailer::ENCRYPTION_SMTPS;
            }
            
            $this->mail->Port = intval($this->config['smtp_port']);
            $this->mail->Timeout = (int)($this->config['timeout'] ?? 30);
            
            // Charset e encoding
            $this->mail->CharSet = 'UTF-8';
            $this->mail->Encoding = 'base64';
            
            // Remetente padrão
            $this->mail->setFrom(
                $this->config['smtp_de_email'], 
                $this->config['smtp_de_nome'] ?? 'Serra da Liberdade'
            );
            
            // Debug (se ativado)
            if ($this->debug) {
                $this->mail->SMTPDebug = SMTP::DEBUG_LOWLEVEL;
                $this->mail->Debugoutput = function($str, $level) {
                    $linha = $this->sanitizarLinhaDebugSMTP($str);
                    $this->smtpDebugLines[] = [
                        'host' => $this->mail ? $this->mail->Host : ($this->config['smtp_host'] ?? null),
                        'level' => $level,
                        'message' => $linha,
                    ];
                    email_error_log('DEBUG', 'PHPMailer SMTP low-level debug', [
                        'host' => $this->mail ? $this->mail->Host : ($this->config['smtp_host'] ?? null),
                        'level' => $level,
                        'message' => $linha,
                    ]);
                };
            }
            
        } catch (Exception $e) {
            email_error_log_exception('ERROR', 'Erro ao inicializar PHPMailer', $e, [
                'smtp' => [
                    'host' => $this->config['smtp_host'] ?? null,
                    'port' => $this->config['smtp_port'] ?? null,
                    'usuario' => $this->config['smtp_usuario'] ?? null,
                    'de_email' => $this->config['smtp_de_email'] ?? null,
                    'seguranca' => $this->config['smtp_seguranca'] ?? null,
                    'timeout' => $this->config['timeout'] ?? null,
                ],
            ]);
            throw new Exception("Erro ao inicializar PHPMailer: " . $e->getMessage());
        }
    }

    private function sanitizarLinhaDebugSMTP($linha) {
        $linha = trim((string)$linha);

        if (stripos($linha, 'AUTH PLAIN') !== false) {
            return preg_replace('/AUTH PLAIN\s+\S+/i', 'AUTH PLAIN [REDACTED]', $linha);
        }
        if (stripos($linha, 'AUTH LOGIN') !== false) {
            $this->debugAuthStage = 'username_prompt';
            return $linha;
        }
        if (stripos($linha, '334 VXNlcm5hbWU6') !== false) {
            $this->debugAuthStage = 'username_value';
            return $linha;
        }
        if (stripos($linha, '334 UGFzc3dvcmQ6') !== false) {
            $this->debugAuthStage = 'password_value';
            return $linha;
        }
        if (stripos($linha, 'CLIENT -> SERVER:') !== false) {
            if ($this->debugAuthStage === 'username_value') {
                $this->debugAuthStage = null;
                return 'CLIENT -> SERVER: [USERNAME_BASE64_REDACTED]';
            }
            if ($this->debugAuthStage === 'password_value') {
                $this->debugAuthStage = null;
                return 'CLIENT -> SERVER: [PASSWORD_BASE64_REDACTED]';
            }
        }

        return $linha;
    }

    private function hostsSMTPParaTentativa() {
        $principal = trim((string)$this->config['smtp_host']);
        $hosts = [$principal];
        $usuario = strtolower((string)$this->config['smtp_usuario']);
        $isMicrosoft = strpos($principal, 'office365.com') !== false
            || strpos($principal, 'outlook.com') !== false
            || strpos($usuario, '@outlook.com') !== false
            || strpos($usuario, '@hotmail.com') !== false
            || strpos($usuario, '@live.com') !== false;

        if ($isMicrosoft && strcasecmp($principal, 'smtp.office365.com') === 0) {
            $hosts[] = 'smtp-mail.outlook.com';
        } elseif ($isMicrosoft && strcasecmp($principal, 'smtp-mail.outlook.com') === 0) {
            $hosts[] = 'smtp.office365.com';
        }

        return array_values(array_unique(array_filter($hosts)));
    }

    private function aplicarHostSMTP($host) {
        $this->mail->Host = $host;
        $this->mail->SMTPAuth = true;
        $this->mail->AuthType = 'LOGIN';
        $this->mail->Username = trim((string)$this->config['smtp_usuario']);
        $this->mail->Password = (string)$this->config['smtp_senha'];
        $this->debugAuthStage = null;
    }

    public function diagnosticoSMTP($hostAtual = null, $erroServidor = null) {
        return [
            'host' => $hostAtual ?: ($this->config['smtp_host'] ?? null),
            'porta' => (int)($this->config['smtp_port'] ?? 0),
            'seguranca' => $this->config['smtp_seguranca'] ?? null,
            'usuario' => $this->config['smtp_usuario'] ?? null,
            'senha_tamanho' => strlen((string)($this->config['smtp_senha'] ?? '')),
            'auth_type' => 'LOGIN',
            'smtp_auth' => true,
            'timeout' => (int)($this->config['timeout'] ?? 30),
            'resposta_servidor' => $erroServidor,
            'tentativas' => $this->smtpTentativas,
            'debug_tail' => array_slice($this->smtpDebugLines, -60),
        ];
    }

    private function diagnosticarErroMicrosoft($erro) {
        $erro = (string)$erro;
        $regras = [
            '535 5.7.3' => 'Autenticacao Microsoft recusada. Verifique usuario completo, senha de aplicativo e SMTP AUTH habilitado para a caixa postal.',
            '535 5.7.57' => 'SMTP AUTH provavelmente esta desabilitado no tenant, na caixa postal ou por Security Defaults/Conditional Access.',
            '535 5.7.139' => 'Autenticacao bloqueada por politica Microsoft, MFA/Modern Auth ou credencial basica nao aceita neste fluxo.',
            '550' => 'Remetente/destinatario rejeitado. Confirme se smtp_de_email e igual ao usuario autenticado ou se a conta tem permissao Send As.',
            '554' => 'Mensagem ou politica de envio rejeitada pelo servidor Microsoft.',
        ];

        foreach ($regras as $codigo => $mensagem) {
            if (stripos($erro, $codigo) !== false) {
                return ['codigo' => $codigo, 'mensagem' => $mensagem];
            }
        }
        if (stripos($erro, 'TLS') !== false || stripos($erro, 'STARTTLS') !== false) {
            return ['codigo' => 'TLS', 'mensagem' => 'Falha na negociacao TLS/STARTTLS. Verifique porta 587, OpenSSL do PHP e bloqueios da hospedagem.'];
        }
        if (stripos($erro, 'SMTP AUTH') !== false || stripos($erro, 'authentication unsuccessful') !== false) {
            return ['codigo' => 'SMTP_AUTH', 'mensagem' => 'Falha de SMTP AUTH. Confirme se Authenticated SMTP esta habilitado e se a senha de aplicativo ainda e valida.'];
        }

        return ['codigo' => 'SMTP', 'mensagem' => 'Erro SMTP nao classificado. Consulte resposta_servidor e debug_tail.'];
    }

    /**
     * Envia um e-mail
     * 
     * @param string $destinatario E-mail do destinatário
     * @param string $assunto Assunto do e-mail
     * @param string $corpo Corpo do e-mail (HTML)
     * @param string $nomeDestinatario Nome do destinatário (opcional)
     * @param array $anexos Array de caminhos de arquivos para anexar (opcional)
     * @return bool True se enviado com sucesso
     * @throws Exception Em caso de erro
     */
    public function enviar($destinatario, $assunto, $corpo, $nomeDestinatario = '', $anexos = []) {
        try {
            // Limpar destinatários anteriores
            $this->mail->clearAddresses();
            $this->mail->clearAttachments();
            $this->mail->clearReplyTos();
            
            // Validar e-mail destinatário
            if (!filter_var($destinatario, FILTER_VALIDATE_EMAIL)) {
                throw new Exception("E-mail destinatário inválido: $destinatario");
            }
            
            // Adicionar destinatário
            if (!empty($nomeDestinatario)) {
                $this->mail->addAddress($destinatario, $nomeDestinatario);
            } else {
                $this->mail->addAddress($destinatario);
            }
            
            // Configurar conteúdo
            $this->mail->isHTML(true);
            $this->mail->Subject = $assunto;
            $this->mail->Body = $corpo;
            
            // Versão texto alternativa (strip HTML)
            $this->mail->AltBody = strip_tags($corpo);
            
            // Adicionar anexos (se houver)
            if (!empty($anexos) && is_array($anexos)) {
                foreach ($anexos as $anexo) {
                    if (file_exists($anexo)) {
                        $this->mail->addAttachment($anexo);
                    } else {
                        email_error_log('WARNING', 'E-mail attachment not found', [
                            'anexo' => $anexo,
                            'destinatario' => $destinatario,
                            'assunto' => $assunto,
                        ]);
                    }
                }
            }
            
            // Enviar com fallback automatico para hosts Microsoft.
            $ultimoErro = null;
            foreach ($this->hostsSMTPParaTentativa() as $hostSMTP) {
                $this->aplicarHostSMTP($hostSMTP);
                email_error_log('INFO', 'SMTP send attempt started', [
                    'destinatario' => $destinatario,
                    'assunto' => $assunto,
                    'diagnostico_smtp' => $this->diagnosticoSMTP($hostSMTP),
                ]);

                try {
                    $resultado = $this->mail->send();
                    $this->smtpTentativas[] = [
                        'host' => $hostSMTP,
                        'status' => 'enviado',
                    ];
                    email_error_log('INFO', 'SMTP send attempt succeeded', [
                        'destinatario' => $destinatario,
                        'assunto' => $assunto,
                        'diagnostico_smtp' => $this->diagnosticoSMTP($hostSMTP),
                    ]);
                    $this->registrarLog($destinatario, $assunto, 'enviado');
                    return $resultado;
                } catch (Exception $tentativaErro) {
                    $ultimoErro = $tentativaErro;
                    $respostaServidor = $this->mail->ErrorInfo ?: $tentativaErro->getMessage();
                    $diagnosticoMicrosoft = $this->diagnosticarErroMicrosoft($respostaServidor);
                    $this->smtpTentativas[] = [
                        'host' => $hostSMTP,
                        'status' => 'erro',
                        'erro' => $respostaServidor,
                        'diagnostico_microsoft' => $diagnosticoMicrosoft,
                    ];
                    email_error_log_exception('ERROR', 'SMTP send attempt failed', $tentativaErro, [
                        'destinatario' => $destinatario,
                        'assunto' => $assunto,
                        'diagnostico_smtp' => $this->diagnosticoSMTP($hostSMTP, $respostaServidor),
                        'diagnostico_microsoft' => $diagnosticoMicrosoft,
                    ]);
                    $this->mail->smtpClose();
                }
            }

            throw new Exception($ultimoErro ? $ultimoErro->getMessage() : 'Falha desconhecida no envio SMTP');
            
        } catch (Exception $e) {
            // Registrar erro no log
            $this->registrarLog($destinatario, $assunto, 'erro', $e->getMessage());
            $respostaServidor = $this->mail ? ($this->mail->ErrorInfo ?: $e->getMessage()) : $e->getMessage();
            $diagnosticoMicrosoft = $this->diagnosticarErroMicrosoft($respostaServidor);

            email_error_log_exception('ERROR', 'Erro ao enviar e-mail', $e, [
                'destinatario' => $destinatario,
                'assunto' => $assunto,
                'phpmailer_error' => $this->mail ? $this->mail->ErrorInfo : null,
                'diagnostico_smtp' => $this->diagnosticoSMTP(null, $respostaServidor),
                'diagnostico_microsoft' => $diagnosticoMicrosoft,
            ]);
            throw new Exception("Erro ao enviar e-mail: " . $respostaServidor . " | " . $diagnosticoMicrosoft['mensagem']);
        }
    }
    
    /**
     * Envia e-mail de recuperação de senha
     * 
     * @param string $destinatario E-mail do destinatário
     * @param string $nomeDestinatario Nome do destinatário
     * @param string $token Token de recuperação
     * @param int $moradorId ID do morador (para log)
     * @return bool True se enviado com sucesso
     */
    public function enviarRecuperacaoSenha($destinatario, $nomeDestinatario, $token, $moradorId = null) {
        // Buscar template de e-mail
        $sql = "SELECT * FROM email_templates WHERE tipo = 'recuperacao_senha' AND ativo = 1 LIMIT 1";
        $resultado = mysqli_query($this->conexao, $sql);
        
        if ($resultado && mysqli_num_rows($resultado) > 0) {
            $template = mysqli_fetch_assoc($resultado);
            $assunto = $template['assunto'];
            $corpo = $template['corpo'];
        } else {
            // Template padrão
            $assunto = 'Recuperação de Senha - Serra da Liberdade';
            $corpo = $this->getTemplateRecuperacaoSenhaPadrao();
        }
        
        // Gerar link de recuperação
        $protocolo = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http';
        $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
        $diretorio = dirname($_SERVER['PHP_SELF']);
        $link_recuperacao = $protocolo . '://' . $host . $diretorio . '/redefinir_senha.html?token=' . $token;
        
        // Substituir variáveis no template
        $corpo = str_replace('{{nome}}', $nomeDestinatario, $corpo);
        $corpo = str_replace('{{link_recuperacao}}', $link_recuperacao, $corpo);
        $corpo = str_replace('{{token}}', $token, $corpo);
        
        // Enviar
        $enviado = $this->enviar($destinatario, $assunto, $corpo, $nomeDestinatario);
        
        // Registrar no log específico de recuperação
        if ($moradorId) {
            $status = $enviado ? 'enviado' : 'erro';
            $sql_log = "INSERT INTO email_log (morador_id, destinatario, assunto, tipo, status) 
                        VALUES ($moradorId, '$destinatario', '$assunto', 'recuperacao_senha', '$status')";
            mysqli_query($this->conexao, $sql_log);
        }
        
        return $enviado;
    }
    
    /**
     * Envia e-mail de teste
     * 
     * @param string $destinatario E-mail de destino
     * @return bool True se enviado com sucesso
     */
    public function enviarTeste($destinatario) {
        $assunto = 'Teste de Configuração SMTP - Serra da Liberdade';
        $corpo = '
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%); color: #fff; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
                .content { background: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; }
                .success-icon { font-size: 48px; text-align: center; margin: 20px 0; }
                .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #64748b; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>✅ Teste de Configuração SMTP</h1>
                </div>
                <div class="content">
                    <div class="success-icon">🎉</div>
                    <h2 style="color: #2563eb; text-align: center;">Parabéns!</h2>
                    <p>Este é um e-mail de teste para verificar se as configurações SMTP estão corretas.</p>
                    <p><strong>Se você recebeu este e-mail, significa que o servidor SMTP está configurado corretamente!</strong></p>
                    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
                    <p><strong>Informações do teste:</strong></p>
                    <ul>
                        <li><strong>Data/Hora:</strong> ' . date('d/m/Y H:i:s') . '</li>
                        <li><strong>Servidor:</strong> ' . $this->config['smtp_host'] . '</li>
                        <li><strong>Porta:</strong> ' . $this->config['smtp_port'] . '</li>
                        <li><strong>Segurança:</strong> ' . strtoupper($this->config['smtp_seguranca']) . '</li>
                    </ul>
                </div>
                <div class="footer">
                    <p>Serra da Liberdade - Sistema de Controle de Acesso</p>
                    <p>Este é um e-mail automático, não responda.</p>
                </div>
            </div>
        </body>
        </html>';
        
        return $this->enviar($destinatario, $assunto, $corpo);
    }
    
    /**
     * Registra envio de e-mail no log
     */
    private function registrarLog($destinatario, $assunto, $status, $erro = null) {
        $destinatario = mysqli_real_escape_string($this->conexao, $destinatario);
        $assunto = mysqli_real_escape_string($this->conexao, $assunto);
        $status = mysqli_real_escape_string($this->conexao, $status);
        
        $sql = "INSERT INTO email_log (destinatario, assunto, tipo, status, erro_mensagem) 
                VALUES ('$destinatario', '$assunto', 'outro', '$status', " . 
                ($erro ? "'" . mysqli_real_escape_string($this->conexao, $erro) . "'" : "NULL") . ")";
        
        mysqli_query($this->conexao, $sql);
    }
    
    /**
     * Template padrão de recuperação de senha
     */
    private function getTemplateRecuperacaoSenhaPadrao() {
        return '
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%); color: #fff; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
                .content { background: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; }
                .button { display: inline-block; padding: 12px 30px; background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%); color: #fff; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }
                .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px; }
                .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #64748b; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🔐 Recuperação de Senha</h1>
                </div>
                <div class="content">
                    <p>Olá, <strong>{{nome}}</strong>!</p>
                    <p>Recebemos uma solicitação de recuperação de senha para sua conta no sistema Serra da Liberdade.</p>
                    <p>Para redefinir sua senha, clique no botão abaixo:</p>
                    <div style="text-align: center;">
                        <a href="{{link_recuperacao}}" class="button">Redefinir Senha</a>
                    </div>
                    <div class="warning">
                        <p><strong>⚠️ Importante:</strong></p>
                        <ul>
                            <li>Este link é válido por <strong>24 horas</strong></li>
                            <li>Pode ser usado apenas <strong>uma vez</strong></li>
                            <li>Se você não solicitou esta recuperação, ignore este e-mail</li>
                        </ul>
                    </div>
                    <p>Se o botão não funcionar, copie e cole o link abaixo no seu navegador:</p>
                    <p style="word-break: break-all; background: #e2e8f0; padding: 10px; border-radius: 4px; font-size: 12px;">{{link_recuperacao}}</p>
                </div>
                <div class="footer">
                    <p>Serra da Liberdade - Sistema de Controle de Acesso</p>
                    <p>Este é um e-mail automático, não responda.</p>
                </div>
            </div>
        </body>
        </html>';
    }
    
    /**
     * Obtém informações da configuração atual
     */
    public function getConfiguracao() {
        return [
            'host' => $this->config['smtp_host'],
            'port' => $this->config['smtp_port'],
            'usuario' => $this->config['smtp_usuario'],
            'de_email' => $this->config['smtp_de_email'],
            'de_nome' => $this->config['smtp_de_nome'],
            'seguranca' => $this->config['smtp_seguranca']
        ];
    }
}
?>
