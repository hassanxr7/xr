<?php
/**
 * The Guardia — Web Push notifications (no external library).
 *
 * VAPID (RFC 8292) for authentication and aes128gcm payload encryption (RFC 8291 / RFC 8188),
 * built on PHP's OpenSSL extension. Works with Chrome, Edge, Firefox, Samsung Internet,
 * Opera and Safari (macOS, and iPhone/iPad when the site is added to the home screen).
 */
defined('APP') || exit;

const P256_SPKI_PREFIX = "\x30\x59\x30\x13\x06\x07\x2a\x86\x48\xce\x3d\x02\x01\x06\x08\x2a\x86\x48\xce\x3d\x03\x01\x07\x03\x42\x00";

function der_to_pem(string $der, string $label): string
{
    return "-----BEGIN $label-----\n" . chunk_split(base64_encode($der), 64, "\n") . "-----END $label-----\n";
}

/** Uncompressed P-256 public key (65 bytes: 0x04 || X || Y) of an OpenSSL key. */
function ec_public_raw($key): string
{
    $d = openssl_pkey_get_details($key);
    return "\x04" . str_pad($d['ec']['x'], 32, "\0", STR_PAD_LEFT) . str_pad($d['ec']['y'], 32, "\0", STR_PAD_LEFT);
}

function ec_public_from_raw(string $raw)
{
    if (strlen($raw) !== 65 || $raw[0] !== "\x04") {
        throw new RuntimeException('Invalid P-256 public key');
    }
    $key = openssl_pkey_get_public(der_to_pem(P256_SPKI_PREFIX . $raw, 'PUBLIC KEY'));
    if (!$key) {
        throw new RuntimeException('Invalid P-256 public key');
    }
    return $key;
}

/** Private key from its raw 32-byte value and public point (used for fixed test vectors). */
function ec_private_from_raw(string $d, string $pub)
{
    $der = "\x30\x77\x02\x01\x01\x04\x20" . $d . "\xa0\x0a\x06\x08\x2a\x86\x48\xce\x3d\x03\x01\x07\xa1\x44\x03\x42\x00" . $pub;
    return openssl_pkey_get_private(der_to_pem($der, 'EC PRIVATE KEY'));
}

function ec_new_key()
{
    $key = openssl_pkey_new(['curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC]);
    if (!$key) {
        throw new RuntimeException('OpenSSL could not create an EC key: ' . openssl_error_string());
    }
    return $key;
}

/** Create the site's VAPID key pair (once). */
function vapid_generate(): void
{
    $key = ec_new_key();
    openssl_pkey_export($key, $pem);
    save_setting('vapid_private', $pem);
    save_setting('vapid_public', b64url_encode(ec_public_raw($key)));
}

/** ECDSA DER signature → 64-byte R||S (JOSE format). */
function ecdsa_der_to_raw(string $der): string
{
    $pos = 2;
    if (ord($der[1]) & 0x80) {
        $pos += ord($der[1]) & 0x7f;
    }
    $out = '';
    for ($i = 0; $i < 2; $i++) {
        $len = ord($der[$pos + 1]);
        $int = ltrim(substr($der, $pos + 2, $len), "\0");
        $out .= str_pad($int, 32, "\0", STR_PAD_LEFT);
        $pos += 2 + $len;
    }
    return $out;
}

/** Authorization header value for one push service origin. */
function vapid_authorization(string $endpoint): string
{
    static $cache = [];
    $p = parse_url($endpoint);
    $aud = $p['scheme'] . '://' . $p['host'] . (isset($p['port']) ? ':' . $p['port'] : '');
    if (isset($cache[$aud])) {
        return $cache[$aud];
    }
    $sub = setting('vapid_subject') ?: 'mailto:' . setting('contact_email', 'admin@' . (parse_url(site_origin(), PHP_URL_HOST) ?: 'example.com'));
    $header = b64url_encode(json_encode(['typ' => 'JWT', 'alg' => 'ES256']));
    $claims = b64url_encode(json_encode(['aud' => $aud, 'exp' => time() + 12 * 3600, 'sub' => $sub]));
    $priv = openssl_pkey_get_private(setting('vapid_private'));
    if (!$priv || !openssl_sign($header . '.' . $claims, $der, $priv, OPENSSL_ALGO_SHA256)) {
        throw new RuntimeException('VAPID signing failed');
    }
    $jwt = $header . '.' . $claims . '.' . b64url_encode(ecdsa_der_to_raw($der));
    return $cache[$aud] = 'vapid t=' . $jwt . ', k=' . setting('vapid_public');
}

/**
 * Encrypt a payload for one subscription (RFC 8291, aes128gcm).
 * $asKey / $salt are only passed by tests; normally fresh random values are used.
 */
function webpush_encrypt(string $payload, string $uaPublicB64, string $authB64, $asKey = null, ?string $salt = null): string
{
    $uaPublic = b64url_decode($uaPublicB64);
    $auth = b64url_decode($authB64);
    if (strlen($uaPublic) !== 65 || strlen($auth) !== 16) {
        throw new RuntimeException('Invalid subscription keys');
    }
    $asKey = $asKey ?: ec_new_key();
    $asPublic = ec_public_raw($asKey);
    $shared = openssl_pkey_derive(ec_public_from_raw($uaPublic), $asKey, 32);
    if ($shared === false) {
        throw new RuntimeException('ECDH failed');
    }
    $salt = $salt ?? random_bytes(16);
    $prkKey = hash_hmac('sha256', $shared, $auth, true);
    $ikm = hash_hmac('sha256', "WebPush: info\0" . $uaPublic . $asPublic . "\x01", $prkKey, true);
    $prk = hash_hmac('sha256', $ikm, $salt, true);
    $cek = substr(hash_hmac('sha256', "Content-Encoding: aes128gcm\0\x01", $prk, true), 0, 16);
    $nonce = substr(hash_hmac('sha256', "Content-Encoding: nonce\0\x01", $prk, true), 0, 12);
    $tag = '';
    $cipher = openssl_encrypt($payload . "\x02", 'aes-128-gcm', $cek, OPENSSL_RAW_DATA, $nonce, $tag, '', 16);
    return $salt . pack('N', 4096) . chr(65) . $asPublic . $cipher . $tag;
}

/** Save a browser subscription sent by the page script. */
function push_subscribe(array $d): array
{
    $sub = $d['subscription'] ?? [];
    $endpoint = (string) ($sub['endpoint'] ?? '');
    $p256 = (string) ($sub['keys']['p256dh'] ?? '');
    $auth = (string) ($sub['keys']['auth'] ?? '');
    if (!preg_match('~^https://~', $endpoint) || strlen($endpoint) > 1000 || strlen(b64url_decode($p256)) !== 65 || strlen(b64url_decode($auth)) !== 16) {
        return ['ok' => false, 'error' => 'invalid subscription'];
    }
    if (!rate_limit('push', 20, 3600)) {
        return ['ok' => false, 'error' => 'rate limited'];
    }
    $topic = (int) ($d['topic'] ?? 0);
    $existing = row('SELECT id, topics FROM push_subscriptions WHERE endpoint = ?', [$endpoint]);
    $ua = (string) ($_SERVER['HTTP_USER_AGENT'] ?? '');
    if ($existing) {
        $topics = $existing['topics'];
        if ($topic && strpos(',' . $topics . ',', ',' . $topic . ',') === false) {
            $topics .= ',' . $topic;
        }
        update('push_subscriptions', ['p256dh' => $p256, 'auth' => $auth, 'topics' => $topics, 'fails' => 0], 'id = ?', [$existing['id']]);
    } else {
        $geo = geo_lookup(client_ip());
        insert('push_subscriptions', [
            'endpoint' => $endpoint, 'p256dh' => $p256, 'auth' => $auth, 'topics' => 'all' . ($topic ? ',' . $topic : ''),
            'country' => $geo['country'] ?: null, 'device' => ua_device($ua, 0), 'created_at' => now(),
        ]);
    }
    return ['ok' => true];
}

/** SQL condition + params for the audience of a message (everyone, or readers following a section). */
function push_audience(?int $categoryId): array
{
    if (!$categoryId) {
        return ['1', []];
    }
    return ["(',' || topics || ',') LIKE ?", ['%,' . $categoryId . ',%']];
}

/** Queue a notification. Returns the message id. */
function push_queue(string $title, string $body, string $url, ?string $image = null, ?int $articleId = null, ?int $audienceCategory = null): int
{
    if (setting('vapid_public') === '') {
        vapid_generate();
    }
    [$cond, $params] = push_audience($audienceCategory);
    $total = (int) val("SELECT COUNT(*) FROM push_subscriptions WHERE $cond", $params);
    $id = insert('push_messages', [
        'title' => mb_substr($title, 0, 120), 'body' => mb_substr($body, 0, 240), 'url' => $url, 'image' => $image, 'article_id' => $articleId,
        'category_id' => $audienceCategory, 'status' => 'queued', 'total' => $total, 'created_by' => user()['id'] ?? null, 'created_at' => now(),
    ]);
    if ($articleId) {
        update('articles', ['push_sent' => 1], 'id = ?', [$articleId]);
    }
    return $id;
}

/**
 * Send part of a queued message within ~$budget seconds (called by cron and by the dashboard).
 * Returns the message row after processing.
 */
function push_process(int $messageId, int $budget = 20): ?array
{
    $m = row('SELECT * FROM push_messages WHERE id = ?', [$messageId]);
    if (!$m || $m['status'] === 'done') {
        return $m;
    }
    update('push_messages', ['status' => 'sending'], 'id = ?', [$messageId]);
    $payload = json_encode([
        'title' => $m['title'], 'body' => $m['body'], 'image' => $m['image'] ?: null, 'id' => (int) $m['id'], 'tag' => 'tg-' . $m['id'],
        'url' => $m['url'] . (strpos($m['url'], '?') === false ? '?' : '&') . 'utm_source=push&utm_medium=notification&utm_campaign=alert-' . $m['id'],
        'icon' => abs_url('assets/img/icon-192.png'),
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    [$cond, $params] = push_audience($m['category_id'] ? (int) $m['category_id'] : null);
    $start = time();
    $cursor = (int) $m['cursor'];
    $sent = (int) $m['sent'];
    $failed = (int) $m['failed'];
    while (time() - $start < $budget) {
        $subs = rows("SELECT * FROM push_subscriptions WHERE id > ? AND $cond ORDER BY id LIMIT 60", array_merge([$cursor], $params));
        if (!$subs) {
            update('push_messages', ['status' => 'done', 'sent' => $sent, 'failed' => $failed, 'cursor' => $cursor, 'finished_at' => now()], 'id = ?', [$messageId]);
            return row('SELECT * FROM push_messages WHERE id = ?', [$messageId]);
        }
        $mh = curl_multi_init();
        $handles = [];
        foreach ($subs as $s) {
            $cursor = (int) $s['id'];
            try {
                $body = webpush_encrypt($payload, $s['p256dh'], $s['auth']);
                $auth = vapid_authorization($s['endpoint']);
            } catch (Throwable $e) {
                $failed++;
                continue;
            }
            $ch = curl_init($s['endpoint']);
            curl_setopt_array($ch, [
                CURLOPT_POST => true, CURLOPT_POSTFIELDS => $body, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15, CURLOPT_CONNECTTIMEOUT => 8,
                CURLOPT_HTTPHEADER => ['Authorization: ' . $auth, 'Content-Encoding: aes128gcm', 'Content-Type: application/octet-stream', 'TTL: 86400', 'Urgency: high'],
            ]);
            curl_multi_add_handle($mh, $ch);
            $handles[(int) $s['id']] = $ch;
        }
        do {
            $status = curl_multi_exec($mh, $running);
            if ($running) {
                curl_multi_select($mh, 1.0);
            }
        } while ($running && $status === CURLM_OK);
        foreach ($handles as $sid => $ch) {
            $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
            if ($code >= 200 && $code < 300) {
                $sent++;
                q('UPDATE push_subscriptions SET last_ok = ?, fails = 0 WHERE id = ?', [now(), $sid]);
            } else {
                $failed++;
                if (in_array($code, [404, 410], true)) {
                    q('DELETE FROM push_subscriptions WHERE id = ?', [$sid]); // unsubscribed / expired
                } else {
                    q('UPDATE push_subscriptions SET fails = fails + 1 WHERE id = ?', [$sid]);
                }
            }
            curl_multi_remove_handle($mh, $ch);
            curl_close($ch);
        }
        curl_multi_close($mh);
        update('push_messages', ['sent' => $sent, 'failed' => $failed, 'cursor' => $cursor], 'id = ?', [$messageId]);
    }
    q('DELETE FROM push_subscriptions WHERE fails >= 10');
    return row('SELECT * FROM push_messages WHERE id = ?', [$messageId]);
}

function push_process_queue(int $budget = 40): void
{
    $end = time() + $budget;
    foreach (rows("SELECT id FROM push_messages WHERE status <> 'done' ORDER BY id") as $m) {
        $left = $end - time();
        if ($left <= 2) {
            break;
        }
        push_process((int) $m['id'], $left);
    }
}

/** Queue the alert for a story (used when an editor ticks "Send push alert" on publish). */
function push_article(array $a): int
{
    $img = article_image($a);
    return push_queue(
        ($a['is_breaking'] ? 'Breaking: ' : '') . $a['title'],
        str_limit((string) ($a['standfirst'] ?: plain_text((string) $a['body'])), 140),
        article_url($a, true),
        $img['default'] ? null : $img['abs'],
        (int) $a['id']
    );
}
