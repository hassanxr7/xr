<?php
/**
 * Hufan Exchange — Nebdex real-time payment gateway client.
 * Docs: https://nebdex.com/api-documentation#method-list
 *
 * Like SovaMoney, Nebdex is a hosted checkout: we ask it for a redirect_url
 * and send the customer's browser there; Nebdex then confirms the result
 * asynchronously with a signed IPN POST to nebdex_ipn.php (that webhook URL
 * must be entered once in the Nebdex merchant dashboard — the API itself
 * has no ipn_url parameter to set it per request).
 *
 * Nebdex doesn't have fixed codes for EVC Plus / ZAAD / Sahal, and a single
 * local gateway can map to more than one Nebdex channel (e.g. EVC Plus can
 * be paid through Nebdex's own "evc" method or through its "WaafiPay"
 * method — both ultimately reach EVC Plus, but via different Nebdex
 * routes). So Nebdex methods are a small one-to-many table keyed by
 * gateway_id: each row is one (label, method_code) pair, and the order
 * page shows one "Pay via Nebdex — <label>" button per row. Manage them
 * under Admin → Settings → Nebdex.
 */
defined('APP') || exit;

function nebdex_config(): array
{
    return [
        'enabled'     => setting('nebdex_enabled', '0') === '1',
        'merchant_id' => setting('nebdex_merchant_id'),
        'public_key'  => setting('nebdex_public_key'),
        'secret_key'  => setting('nebdex_secret_key'),
    ];
}

function nebdex_configured(array $c = null): bool
{
    $c = $c ?? nebdex_config();
    return $c['merchant_id'] !== '' && $c['public_key'] !== '' && $c['secret_key'] !== '';
}

/**
 * Create the nebdex_methods table if it doesn't exist yet, and migrate any
 * single method_code previously saved as a `nebdex_method_<gateway_id>`
 * setting (the old one-method-per-gateway design) into it. Safe to call on
 * every request — the version check makes it a no-op after the first run.
 */
function nebdex_ensure_schema(): void
{
    static $checked = false;
    if ($checked) {
        return;
    }
    $checked = true;
    if (setting('nebdex_schema_v2', '0') === '1') {
        return;
    }
    try {
        if (db_driver() === 'sqlite') {
            q('CREATE TABLE IF NOT EXISTS nebdex_methods (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                gateway_id INTEGER NOT NULL REFERENCES gateways(id) ON DELETE CASCADE,
                label TEXT NOT NULL,
                method_code TEXT NOT NULL,
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            )');
            q('CREATE INDEX IF NOT EXISTS idx_nebdex_methods_gateway ON nebdex_methods (gateway_id, sort_order)');
        } else {
            q('CREATE TABLE IF NOT EXISTS `nebdex_methods` (
                `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
                `gateway_id` INT UNSIGNED NOT NULL,
                `label` VARCHAR(60) NOT NULL,
                `method_code` VARCHAR(20) NOT NULL,
                `sort_order` INT NOT NULL DEFAULT 0,
                `created_at` DATETIME NOT NULL,
                PRIMARY KEY (`id`),
                KEY `idx_nebdex_methods_gateway` (`gateway_id`, `sort_order`),
                CONSTRAINT `fk_nebdex_methods_gateway` FOREIGN KEY (`gateway_id`) REFERENCES `gateways` (`id`) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
        }
        foreach (rows('SELECT id FROM gateways') as $g) {
            $old = setting('nebdex_method_' . $g['id']);
            if ($old !== '') {
                insert('nebdex_methods', [
                    'gateway_id'  => (int) $g['id'],
                    'label'       => 'Default',
                    'method_code' => $old,
                    'sort_order'  => 0,
                    'created_at'  => now(),
                ]);
            }
        }
        save_setting('nebdex_schema_v2', '1');
    } catch (Throwable $e) {
        error_log('[Hufan] Nebdex schema migration failed: ' . $e->getMessage());
    }
}

/** All Nebdex methods (label + method_code) configured for this gateway. */
function nebdex_methods_for(?array $gateway): array
{
    if (!$gateway) {
        return [];
    }
    nebdex_ensure_schema();
    return rows('SELECT * FROM nebdex_methods WHERE gateway_id = ? ORDER BY sort_order, id', [(int) $gateway['id']]);
}

function nebdex_add_method(int $gatewayId, string $label, string $methodCode): void
{
    nebdex_ensure_schema();
    $nextOrder = (int) val('SELECT COALESCE(MAX(sort_order), -1) + 1 FROM nebdex_methods WHERE gateway_id = ?', [$gatewayId]);
    insert('nebdex_methods', [
        'gateway_id'  => $gatewayId,
        'label'       => mb_substr($label, 0, 60),
        'method_code' => mb_substr($methodCode, 0, 20),
        'sort_order'  => $nextOrder,
        'created_at'  => now(),
    ]);
}

function nebdex_delete_method(int $id): void
{
    nebdex_ensure_schema();
    q('DELETE FROM nebdex_methods WHERE id = ?', [$id]);
}

/**
 * Guess which local gateway a Nebdex method name belongs to, by matching
 * against gateway codes (e.g. Nebdex's "evc" → our gateway code "evc").
 * "WaafiPay" is special-cased to EVC Plus, since it's another route to the
 * same mobile-money network rather than a distinct gateway of its own.
 * Returns null when there's no confident match — callers should leave
 * those for the admin to assign manually rather than guess wrong.
 */
function nebdex_guess_gateway_id(string $methodName, array $gateways): ?int
{
    $norm = strtolower(preg_replace('/[^a-z0-9]/i', '', $methodName) ?? '');
    if ($norm === '') {
        return null;
    }
    if (str_contains($norm, 'waafipay')) {
        foreach ($gateways as $g) {
            if ($g['code'] === 'evc') {
                return (int) $g['id'];
            }
        }
    }
    foreach ($gateways as $g) {
        $code = strtolower((string) $g['code']);
        if ($code !== '' && ($norm === $code || str_contains($norm, $code) || str_contains($code, $norm))) {
            return (int) $g['id'];
        }
    }
    return null;
}

/**
 * Auto-create nebdex_methods rows from a fetched method list (see
 * nebdex_fetch_payment_methods()), matching each one to a gateway by name.
 * Skips methods already imported (same gateway_id + method_code) and
 * methods with no confident gateway match.
 * Returns ['imported' => array, 'skipped' => array, 'unmatched' => array]
 * — each a list of display strings for the admin summary.
 */
function nebdex_import_methods(array $methods): array
{
    nebdex_ensure_schema();
    $gateways = rows('SELECT id, code, name FROM gateways');
    $result = ['imported' => [], 'skipped' => [], 'unmatched' => []];

    foreach ($methods as $m) {
        $name = (string) ($m['name'] ?? '');
        $code = isset($m['method_code']) ? (string) $m['method_code'] : '';
        $currency = (string) ($m['currency'] ?? '');
        if ($name === '' || $code === '') {
            continue;
        }
        $label = $currency !== '' ? $name . ' (' . $currency . ')' : $name;

        $gatewayId = nebdex_guess_gateway_id($name, $gateways);
        if ($gatewayId === null) {
            $result['unmatched'][] = $label;
            continue;
        }
        $exists = val('SELECT 1 FROM nebdex_methods WHERE gateway_id = ? AND method_code = ?', [$gatewayId, $code]);
        if ($exists) {
            $result['skipped'][] = $label;
            continue;
        }
        nebdex_add_method($gatewayId, $label, $code);
        $result['imported'][] = $label;
    }

    return $result;
}

/** Whether real-time Nebdex checkout applies to this "pay from" gateway. */
function nebdex_active_for(?array $fromGateway): bool
{
    $c = nebdex_config();
    return $c['enabled'] && nebdex_configured($c) && nebdex_methods_for($fromGateway) !== [];
}

/** Split a single display name into (first, last) for APIs that require both. */
function split_name(string $name): array
{
    $name = trim($name);
    if ($name === '') {
        return ['Customer', '-'];
    }
    $parts = preg_split('/\s+/', $name, 2);
    return [$parts[0], $parts[1] ?? '-'];
}

/**
 * Start a hosted-checkout payment for an order via a specific method_code.
 * Returns ['success' => bool, 'message' => string, 'redirect_url' => ?string].
 */
function nebdex_initiate_payment(array $order, array $user, string $methodCode, string $customerEmail): array
{
    $c = nebdex_config();
    if (!nebdex_configured($c)) {
        return ['success' => false, 'message' => 'Nebdex is not configured.', 'redirect_url' => null];
    }

    [$firstName, $lastName] = split_name((string) $user['name']);
    $logo = setting('logo');
    $siteLogo = $logo !== '' ? full_url($logo) : full_url(asset('img/logo-mark.svg'));

    $parameters = [
        'merchant_id'   => $c['merchant_id'],
        'public_key'    => $c['public_key'],
        'order_id'      => $order['order_no'],
        'currency'      => strtoupper($order['from_currency']),
        'method_code'   => $methodCode,
        'amount'        => number_format((float) $order['send_amount'], 2, '.', ''),
        'details'       => mb_substr('Hufan Exchange order ' . $order['order_no'], 0, 100),
        'success_url'   => full_url('order.php?no=' . rawurlencode($order['order_no'])),
        'cancel_url'    => full_url('order.php?no=' . rawurlencode($order['order_no'])),
        'site_name'     => setting('site_name', 'Hufan Exchange'),
        'site_logo'     => $siteLogo,
        'customer'      => [
            'id'         => (string) $user['id'],
            'first_name' => $firstName,
            'last_name'  => $lastName,
            'email'      => $customerEmail,
            'mobile'     => $order['sender_account'],
        ],
    ];

    $ch = curl_init('https://nebdex.com/payment/initiate');
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => http_build_query($parameters),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT        => 25,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
    ]);
    $body = curl_exec($ch);
    $curlErr = curl_error($ch);
    curl_close($ch);

    if ($body === false || $body === '') {
        error_log('[Hufan] Nebdex initiate failed: ' . $curlErr);
        return ['success' => false, 'message' => 'Could not reach Nebdex. Please try again.', 'redirect_url' => null];
    }

    $data = json_decode($body, true);
    if (!is_array($data)) {
        error_log('[Hufan] Nebdex returned an unreadable response: ' . substr($body, 0, 500));
        return ['success' => false, 'message' => 'Nebdex returned an unexpected response.', 'redirect_url' => null];
    }

    if (($data['status'] ?? '') === 'success' && !empty($data['redirect_url'])) {
        return ['success' => true, 'message' => '', 'redirect_url' => (string) $data['redirect_url']];
    }

    $message = $data['message'] ?? 'Payment could not be started.';
    return ['success' => false, 'message' => is_array($message) ? implode(' ', $message) : (string) $message, 'redirect_url' => null];
}

/**
 * Call Nebdex's /api/payment-methods with a Public Key. Nebdex's dashboard
 * doesn't display the Merchant ID anywhere, but this response includes it
 * (alongside the available method_code list) — this is the only reliable
 * way to find it.
 * Returns ['success' => bool, 'message' => string, 'merchant_id' => ?string, 'methods' => array].
 */
function nebdex_fetch_payment_methods(string $publicKey): array
{
    if ($publicKey === '') {
        return ['success' => false, 'message' => 'Enter and save a Public Key first.', 'merchant_id' => null, 'methods' => []];
    }

    $ch = curl_init('https://nebdex.com/api/payment-methods');
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => http_build_query(['public_key' => $publicKey]),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT        => 20,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
    ]);
    $body = curl_exec($ch);
    $curlErr = curl_error($ch);
    curl_close($ch);

    if ($body === false || $body === '') {
        error_log('[Hufan] Nebdex payment-methods fetch failed: ' . $curlErr);
        return ['success' => false, 'message' => 'Could not reach Nebdex.', 'merchant_id' => null, 'methods' => []];
    }

    $data = json_decode($body, true);
    if (!is_array($data)) {
        error_log('[Hufan] Nebdex payment-methods returned an unreadable response: ' . substr($body, 0, 500));
        return ['success' => false, 'message' => 'Nebdex returned an unexpected response.', 'merchant_id' => null, 'methods' => []];
    }

    if (($data['status'] ?? '') !== 'success') {
        $message = $data['message'] ?? 'Request failed.';
        return ['success' => false, 'message' => is_array($message) ? implode(' ', $message) : (string) $message, 'merchant_id' => null, 'methods' => []];
    }

    return [
        'success'     => true,
        'message'     => '',
        'merchant_id' => isset($data['merchant']['merchant_id']) ? (string) $data['merchant']['merchant_id'] : null,
        'methods'     => is_array($data['data'] ?? null) ? $data['data'] : [],
    ];
}

/**
 * Verify a Nebdex IPN signature: strtoupper(HMAC-SHA256(order_id, secret_key)).
 * Per Nebdex's own integration notes, the signature covers order_id only —
 * never trust amount/currency from the IPN payload; always use the
 * order's own stored amount.
 */
function nebdex_verify_ipn(string $orderId, string $signature): bool
{
    $secret = setting('nebdex_secret_key');
    if ($secret === '' || $signature === '' || $orderId === '') {
        return false;
    }
    $mySignature = strtoupper(hash_hmac('sha256', $orderId, $secret));
    return hash_equals($mySignature, strtoupper($signature));
}
