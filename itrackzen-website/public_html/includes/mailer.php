<?php
/**
 * Minimal, dependency-free mailer.
 * Uses authenticated SMTP when SMTP_HOST is set in config.local.php (recommended on Hostinger),
 * otherwise falls back to PHP mail().
 */

function mail_from_address(): string
{
    if (MAIL_FROM !== '') { return MAIL_FROM; }
    if (SMTP_USER !== '' && str_contains(SMTP_USER, '@')) { return SMTP_USER; }
    $host = parse_url(base_url(), PHP_URL_HOST) ?: 'itrackzen.net';
    return 'no-reply@' . preg_replace('/^www\./', '', $host);
}

function mime_header(string $s): string
{
    return preg_match('/[^\x20-\x7E]/', $s) ? '=?UTF-8?B?' . base64_encode($s) . '?=' : $s;
}

function clean_header(string $s): string { return trim(preg_replace('/[\r\n\t]+/', ' ', $s)); }

/** @return array{0:bool,1:string} */
function send_mail(array $to, string $subject, string $text, string $html, string $replyEmail = '', string $replyName = ''): array
{
    $from = mail_from_address();
    $fromName = site('brand') . ' Website';
    $boundary = 'b' . bin2hex(random_bytes(12));
    $msgId = '<' . bin2hex(random_bytes(10)) . '@' . (parse_url(base_url(), PHP_URL_HOST) ?: 'itrackzen.net') . '>';
    $h = [];
    $h[] = 'Date: ' . date('r');
    $h[] = 'From: ' . mime_header($fromName) . ' <' . $from . '>';
    $h[] = 'To: ' . implode(', ', $to);
    if ($replyEmail !== '' && filter_var($replyEmail, FILTER_VALIDATE_EMAIL)) {
        $h[] = 'Reply-To: ' . ($replyName !== '' ? mime_header(clean_header($replyName)) . ' ' : '') . '<' . $replyEmail . '>';
    }
    $h[] = 'Subject: ' . mime_header(clean_header($subject));
    $h[] = 'Message-ID: ' . $msgId;
    $h[] = 'MIME-Version: 1.0';
    $h[] = 'X-Mailer: ITrackZen-Web';
    $h[] = 'Content-Type: multipart/alternative; boundary="' . $boundary . '"';
    $body = "--$boundary\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n"
        . chunk_split(base64_encode($text)) . "--$boundary\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n"
        . chunk_split(base64_encode($html)) . "--$boundary--\r\n";

    if (SMTP_HOST !== '') {
        return smtp_send($from, $to, implode("\r\n", $h) . "\r\n\r\n" . $body);
    }
    // Fallback: PHP mail() - works on Hostinger when sending from a mailbox on the same domain.
    $headers = array_filter($h, fn($l) => !preg_match('/^(To|Subject):/i', $l));
    $ok = @mail(implode(', ', $to), mime_header(clean_header($subject)), $body, implode("\r\n", $headers), '-f' . $from);
    return [$ok, $ok ? '' : 'mail() returned false'];
}

function smtp_read($fp): string
{
    $out = '';
    while (($line = fgets($fp, 1024)) !== false) {
        $out .= $line;
        if (strlen($line) < 4 || $line[3] === ' ') { break; }
    }
    return $out;
}

function smtp_cmd($fp, string $cmd, array $expect): array
{
    if ($cmd !== '') { fwrite($fp, $cmd . "\r\n"); }
    $resp = smtp_read($fp);
    $code = (int)substr($resp, 0, 3);
    return [in_array($code, $expect, true), trim($resp)];
}

function smtp_send(string $from, array $to, string $data): array
{
    $secure = strtolower(SMTP_SECURE);
    $scheme = $secure === 'ssl' ? 'ssl://' : 'tcp://';
    $ctx = stream_context_create(['ssl' => ['verify_peer' => true, 'verify_peer_name' => true, 'SNI_enabled' => true]]);
    $fp = @stream_socket_client($scheme . SMTP_HOST . ':' . SMTP_PORT, $errno, $errstr, 15, STREAM_CLIENT_CONNECT, $ctx);
    if (!$fp) { return [false, "connect failed: $errstr ($errno)"]; }
    stream_set_timeout($fp, 20);
    $ehlo = parse_url(base_url(), PHP_URL_HOST) ?: 'localhost';
    try {
        [$ok, $r] = smtp_cmd($fp, '', [220]); if (!$ok) { throw new RuntimeException("greeting: $r"); }
        [$ok, $r] = smtp_cmd($fp, "EHLO $ehlo", [250]); if (!$ok) { throw new RuntimeException("EHLO: $r"); }
        if ($secure === 'tls') {
            [$ok, $r] = smtp_cmd($fp, 'STARTTLS', [220]); if (!$ok) { throw new RuntimeException("STARTTLS: $r"); }
            if (!stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) { throw new RuntimeException('TLS negotiation failed'); }
            [$ok, $r] = smtp_cmd($fp, "EHLO $ehlo", [250]); if (!$ok) { throw new RuntimeException("EHLO2: $r"); }
        }
        if (SMTP_USER !== '') {
            [$ok, $r] = smtp_cmd($fp, 'AUTH LOGIN', [334]); if (!$ok) { throw new RuntimeException("AUTH: $r"); }
            [$ok, $r] = smtp_cmd($fp, base64_encode(SMTP_USER), [334]); if (!$ok) { throw new RuntimeException("AUTH user: $r"); }
            [$ok, $r] = smtp_cmd($fp, base64_encode(SMTP_PASS), [235]); if (!$ok) { throw new RuntimeException("AUTH pass rejected: $r"); }
        }
        [$ok, $r] = smtp_cmd($fp, "MAIL FROM:<$from>", [250]); if (!$ok) { throw new RuntimeException("MAIL FROM: $r"); }
        $accepted = 0;
        foreach ($to as $rcpt) {
            [$ok, $r] = smtp_cmd($fp, "RCPT TO:<$rcpt>", [250, 251]);
            if ($ok) { $accepted++; }
        }
        if ($accepted === 0) { throw new RuntimeException('no recipient accepted'); }
        [$ok, $r] = smtp_cmd($fp, 'DATA', [354]); if (!$ok) { throw new RuntimeException("DATA: $r"); }
        $data = preg_replace('/(?<!\r)\n/', "\r\n", $data);
        $data = preg_replace('/^\./m', '..', $data);
        fwrite($fp, $data . "\r\n.\r\n");
        [$ok, $r] = smtp_cmd($fp, '', [250]); if (!$ok) { throw new RuntimeException("send: $r"); }
        smtp_cmd($fp, 'QUIT', [221]);
        fclose($fp);
        return [true, ''];
    } catch (Throwable $e) {
        @fwrite($fp, "QUIT\r\n");
        @fclose($fp);
        return [false, $e->getMessage()];
    }
}
