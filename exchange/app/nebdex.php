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
 * Nebdex doesn't have fixed codes for EVC Plus / ZAAD / Sahal: each
 * merchant account gets its own `method_code` list from
 * POST /api/payment-methods. So instead of one fixed gateway (like
 * WaafiPay/SovaMoney), Nebdex maps per *local* payment gateway: enter the
 * matching method_code for each gateway (EVC Plus, and any ZAAD/Sahal
 * gateways added under Admin → Gateways) in Admin → Settings → Nebdex.
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

/** The Nebdex method_code configured for this gateway, or null if none is set. */
function nebdex_method_for(?array $gateway): ?string
{
    if (!$gateway) {
        return null;
    }
    $code = setting('nebdex_method_' . (int) $gateway['id']);
    return $code !== '' ? $code : null;
}

/** Whether real-time Nebdex checkout applies to this "pay from" gateway. */
function nebdex_active_for(?array $fromGateway): bool
{
    $c = nebdex_config();
    return $c['enabled'] && nebdex_configured($c) && nebdex_method_for($fromGateway) !== null;
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
