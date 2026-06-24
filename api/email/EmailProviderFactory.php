<?php
declare(strict_types=1);

require_once __DIR__ . '/EmailProviderInterface.php';
require_once __DIR__ . '/EmailCrypto.php';
require_once __DIR__ . '/BrevoProvider.php';
require_once __DIR__ . '/ResendProvider.php';
require_once __DIR__ . '/SmtpProvider.php';

/**
 * EmailProviderFactory
 *
 * Lê a coluna `email_provider` da configuração e instancia
 * o provider correto. Suporta retrocompatibilidade com
 * instalações que já têm SMTP configurado.
 */
class EmailProviderFactory
{
    /**
     * Instancia o provider a partir de um array de configuração
     * (linha da tabela configuracao_smtp).
     */
    public static function fromConfig(array $config): EmailProviderInterface
    {
        $provider = $config['email_provider'] ?? 'smtp';

        switch ($provider) {
            case 'brevo':
                return new BrevoProvider(
                    self::decryptKey($config['api_key'] ?? ''),
                    $config['sender_email'] ?? $config['smtp_de_email'] ?? '',
                    $config['sender_name']  ?? $config['smtp_de_nome']  ?? ''
                );

            case 'resend':
                return new ResendProvider(
                    self::decryptKey($config['api_key'] ?? ''),
                    $config['sender_email'] ?? $config['smtp_de_email'] ?? '',
                    $config['sender_name']  ?? $config['smtp_de_nome']  ?? ''
                );

            case 'smtp':
            default:
                return new SmtpProvider($config);
        }
    }

    /**
     * Instancia o provider diretamente a partir do banco de dados.
     *
     * @param \mysqli $db Conexão MySQL ativa
     */
    public static function fromDatabase(\mysqli $db): EmailProviderInterface
    {
        $res = mysqli_query($db, "SELECT * FROM configuracao_smtp WHERE smtp_ativo = 1 ORDER BY id DESC LIMIT 1");

        if (!$res || mysqli_num_rows($res) === 0) {
            throw new \RuntimeException('Nenhuma configuração de e-mail ativa encontrada no banco de dados');
        }

        return self::fromConfig(mysqli_fetch_assoc($res));
    }

    private static function decryptKey(string $value): string
    {
        if ($value === '') {
            return '';
        }
        try {
            return EmailCrypto::decrypt($value);
        } catch (\Throwable) {
            return $value;
        }
    }
}
