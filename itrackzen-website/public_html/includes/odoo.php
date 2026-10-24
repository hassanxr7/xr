<?php
/**
 * ITrackZen management system (Odoo) bridge.
 *  - single sign-on: staff sign in once in the management system; this admin area trusts a short-lived signed token
 *  - events: enquiries and account-deletion requests are delivered to the management system (queued, retried)
 *  - summary: dashboard figures for the signed-in person, limited by their role in the management system
 * Everything here is switched off until ODOO_URL and ODOO_SSO_SECRET are set in includes/config.local.php.
 */

function odoo_enabled(): bool { return ODOO_URL !== '' && ODOO_SSO_SECRET !== ''; }
function odoo_url(string $path = ''): string { return rtrim(ODOO_URL, '/') . $path; }
/** Public address of this admin area (must match "Allowed sign-in return addresses" in the management system). */
function admin_base_url(): string { return ODOO_ADMIN_URL !== '' ? rtrim(ODOO_ADMIN_URL, '/') . '/' : abs_url('/admin/'); }
function odoo_b64d(string $s): string { return (string)base64_decode(strtr($s, '-_', '+/') . str_repeat('=', (4 - strlen($s) % 4) % 4)); }

/** Verify the login token created by the management system. Returns the claims or null. */
function odoo_verify_token(string $token): ?array
{
    if (!odoo_enabled() || substr_count($token, '.') !== 1) { return null; }
    [$body, $sig] = explode('.', $token, 2);
    if (!hash_equals(hash_hmac('sha256', $body, ODOO_SSO_SECRET), $sig)) { return null; }
    $claims = json_decode(odoo_b64d($body), true);
    if (!is_array($claims) || (int)($claims['exp'] ?? 0) < time() || (int)($claims['iat'] ?? 0) > time() + 60 || (int)($claims['v'] ?? 0) !== 1) { return null; }
    return $claims;
}

/** Low-level HTTP request. Returns [httpCode, body, error]. */
function odoo_http(string $method, string $url, ?string $body = null, array $headers = []): array
{
    if (!function_exists('curl_init')) { return [0, '', 'PHP curl extension missing']; }
    $ch = curl_init($url);
    $opts = [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => ODOO_TIMEOUT, CURLOPT_CONNECTTIMEOUT => 3, CURLOPT_HTTPHEADER => $headers, CURLOPT_CUSTOMREQUEST => $method];
    if ($body !== null) { $opts[CURLOPT_POSTFIELDS] = $body; }
    curl_setopt_array($ch, $opts);
    $resp = curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); $err = curl_error($ch); curl_close($ch);
    return [$code, (string)$resp, $err];
}

/**
 * Queue an event for the management system and try to deliver it right away.
 * If the management system is down the event stays in the outbox and is retried (odoo_outbox_flush).
 */
function odoo_push(string $type, array $data, string $key): void
{
    if (!odoo_enabled() || !ODOO_PUSH) { return; }
    try {
        $eventId = $type . ':' . $key;
        $body = json_encode(['id' => $eventId, 'type' => $type, 'data' => $data, 'sent_at' => gmdate('c')], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if (db_val('SELECT COUNT(*) FROM odoo_outbox WHERE event_id=?', [$eventId])) { return; }
        $id = db_insert('odoo_outbox', ['event_id' => $eventId, 'body' => $body, 'attempts' => 0, 'next_try' => now_utc(), 'created_at' => now_utc()]);
        odoo_deliver($id);
    } catch (Throwable $e) { error_log('[ITrackZen] odoo_push: ' . $e->getMessage()); }
}

function odoo_deliver(int $id): bool
{
    $row = db_one('SELECT * FROM odoo_outbox WHERE id=? AND sent_at IS NULL', [$id]);
    if (!$row) { return true; }
    $sig = hash_hmac('sha256', $row['body'], ODOO_SSO_SECRET);
    [$code, $resp, $err] = odoo_http('POST', odoo_url('/itz/website/event'), $row['body'], ['Content-Type: application/json', 'X-ITZ-Signature: ' . $sig]);
    if ($code >= 200 && $code < 300) { db_update('odoo_outbox', $id, ['sent_at' => now_utc(), 'last_error' => null]); return true; }
    $attempts = (int)$row['attempts'] + 1;
    $delay = min(60 * (2 ** $attempts), 6 * 3600);
    db_update('odoo_outbox', $id, ['attempts' => $attempts, 'last_error' => $err ?: ('HTTP ' . $code . ' ' . mb_substr($resp, 0, 200)), 'next_try' => gmdate('Y-m-d H:i:s', time() + $delay)]);
    return false;
}

/** Retry queued events (called from the admin area and from tools/flush-outbox.php). */
function odoo_outbox_flush(int $max = 10): int
{
    if (!odoo_enabled()) { return 0; }
    $sent = 0;
    foreach (db_all('SELECT id FROM odoo_outbox WHERE sent_at IS NULL AND attempts < 12 AND next_try <= ? ORDER BY id LIMIT ' . (int)$max, [now_utc()]) as $r) {
        if (odoo_deliver((int)$r['id'])) { $sent++; }
    }
    return $sent;
}

/** Dashboard figures from the management system for this person. Cached in the session for 60 seconds. */
function odoo_summary(int $odooUid): ?array
{
    if (!odoo_enabled()) { return null; }
    $c = $_SESSION['odoo_summary'] ?? null;
    if (is_array($c) && (time() - ($c['at'] ?? 0)) < 60 && ($c['uid'] ?? 0) === $odooUid) { return $c['data']; }
    $ts = (string)time();
    $sig = hash_hmac('sha256', 'summary|' . $odooUid . '|' . $ts, ODOO_SSO_SECRET);
    [$code, $resp] = odoo_http('GET', odoo_url('/itz/api/summary?uid=' . $odooUid . '&ts=' . $ts . '&sig=' . $sig), null, ['Accept: application/json']);
    $data = $code === 200 ? json_decode($resp, true) : null;
    if (!is_array($data)) { return null; }
    $_SESSION['odoo_summary'] = ['at' => time(), 'uid' => $odooUid, 'data' => $data];
    return $data;
}
