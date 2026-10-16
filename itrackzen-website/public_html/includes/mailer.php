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


/** Simple branded HTML email body. $paras: array of plain-text paragraphs; $button: [label, url] or null. */
function mail_wrap(string $title, array $paras, ?array $button = null, array $rows = []): array
{
    $h = '<div style="font-family:Arial,Helvetica,sans-serif;max-width:620px;margin:0 auto;color:#0a1f44"><div style="background:#0a1f44;color:#fff;padding:18px 24px;border-radius:10px 10px 0 0"><strong style="font-size:18px">' . e(site('brand')) . '</strong> <span style="color:#9db7e3">by ' . e(site('company')) . '</span></div><div style="border:1px solid #dbe5f5;border-top:0;padding:24px;border-radius:0 0 10px 10px"><h2 style="margin:0 0 14px;font-size:20px">' . e($title) . '</h2>';
    $t = $title . "\n\n";
    foreach ($paras as $p) { $h .= '<p style="line-height:1.6;margin:0 0 14px">' . nl2br(e($p)) . '</p>'; $t .= $p . "\n\n"; }
    if ($rows) {
        $h .= '<table style="width:100%;border-collapse:collapse;margin:0 0 16px">';
        foreach ($rows as $k => $v) { if ($v === '' || $v === null) { continue; } $h .= '<tr><td style="padding:8px 10px;background:#f6f9ff;border:1px solid #e3ecfa;width:170px;font-weight:bold;vertical-align:top">' . e($k) . '</td><td style="padding:8px 10px;border:1px solid #e3ecfa">' . nl2br(e((string)$v)) . '</td></tr>'; $t .= $k . ': ' . $v . "\n"; }
        $h .= '</table>'; $t .= "\n";
    }
    if ($button) { $h .= '<p style="margin:20px 0"><a href="' . e($button[1]) . '" style="background:#1e6bff;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold;display:inline-block">' . e($button[0]) . '</a></p><p style="font-size:12px;color:#6b7ea3;word-break:break-all">If the button does not work, copy this link: ' . e($button[1]) . '</p>'; $t .= $button[0] . ': ' . $button[1] . "\n\n"; }
    $h .= '<p style="font-size:12px;color:#6b7ea3;margin-top:24px">' . e(site('company')) . ' &middot; ' . e(site('emails.info')) . '</p></div></div>';
    return [$t, $h];
}
