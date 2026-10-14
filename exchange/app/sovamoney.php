<?php
/**
 * Hufan Exchange — SovaMoney real-time payment gateway client.
 * Docs: https://sovamoney.com/api/documentation
 *
 * Unlike WaafiPay (a blocking wallet-PIN push), SovaMoney is a hosted
 * checkout: we ask it for a payment URL and send the customer's browser
 * there; SovaMoney then confirms the result asynchronously with a signed
 * IPN (Instant Payment Notification) POST to sovamoney_ipn.php.
 * All credentials and the on/off switch live in the `settings` table and
 * are managed from Admin → Settings → SovaMoney.
 */
defined('APP') || exit;

function sovamoney_config(): array
{
    return [
        'enabled'     => setting('sovamoney_enabled', '0') === '1',
        'environment' => setting('sovamoney_environment', 'sandbox') === 'live' ? 'live' : 'sandbox',
        'public_key'  => setting('sovamoney_public_key'),
        'secret_key'  => setting('sovamoney_secret_key'),
        'gateway_id'  => (int) setting('sovamoney_gateway_id', '0'),
    ];
}

function sovamoney_configured(array $c = null): bool
{
    $c = $c ?? sovamoney_config();
    return $c['public_key'] !== '' && $c['secret_key'] !== '';
}

/** Whether real-time SovaMoney checkout applies to this "pay from" gateway. */
function sovamoney_active_for(?array $fromGateway): bool
{
    if (!$fromGateway) {
        return false;
    }
    $c = sovamoney_config();
    return $c['enabled'] && sovamoney_configured($c) && $c['gateway_id'] === (int) $fromGateway['id'];
}

function sovamoney_initiate_endpoint(?string $environment = null): string
{
    $environment = $environment ?? sovamoney_config()['environment'];
    return $environment === 'live'
        ? 'https://sovamoney.com/payment/initiate'
        : 'https://sovamoney.com/sandbox/payment/initiate';
}

/**
 * Start a hosted-checkout payment for an order. Returns a URL to send the
 * customer's browser to, or an error message.
 * Returns ['success' => bool, 'message' => string, 'url' => ?string].
 */
function sovamoney_initiate_payment(array $order, string $customerEmail, array $user): array
{
    $c = sovamoney_config();
    if (!sovamoney_configured($c)) {
        return ['success' => false, 'message' => 'SovaMoney is not configured.', 'url' => null];
    }

    $logo = setting('logo');
    $siteLogo = $logo !== '' ? full_url($logo) : full_url(asset('img/logo-mark.svg'));

    $parameters = [
        'public_key'     => $c['public_key'],
        'identifier'     => $order['order_no'],
        'currency'       => strtoupper($order['from_currency']),
        'amount'         => number_format((float) $order['send_amount'], 2, '.', ''),
        'details'        => mb_substr('Hufan Exchange order ' . $order['order_no'], 0, 100),
        'ipn_url'        => full_url('sovamoney_ipn.php'),
        'success_url'    => full_url('order.php?no=' . rawurlencode($order['order_no'])),
        'cancel_url'     => full_url('order.php?no=' . rawurlencode($order['order_no'])),
        'site_logo'      => $siteLogo,
        'customer_name'  => mb_substr($user['name'] ?? 'Customer', 0, 30),
        'customer_email' => $customerEmail,
    ];

    $ch = curl_init(sovamoney_initiate_endpoint($c['environment']));
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $parameters,
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
        error_log('[Hufan] SovaMoney initiate failed: ' . $curlErr);
        return ['success' => false, 'message' => 'Could not reach SovaMoney. Please try again.', 'url' => null];
    }

    $data = json_decode($body, true);
    if (!is_array($data)) {
        error_log('[Hufan] SovaMoney returned an unreadable response: ' . substr($body, 0, 500));
        return ['success' => false, 'message' => 'SovaMoney returned an unexpected response.', 'url' => null];
    }

    if (!empty($data['error'])) {
        return ['success' => false, 'message' => (string) ($data['message'] ?? 'Payment could not be started.'), 'url' => null];
    }
    if (($data['success'] ?? '') === 'ok' && !empty($data['url'])) {
        return ['success' => true, 'message' => (string) ($data['message'] ?? ''), 'url' => (string) $data['url']];
    }

    return ['success' => false, 'message' => 'SovaMoney returned an unexpected response.', 'url' => null];
}

/**
 * Verify a SovaMoney IPN signature: strtoupper(HMAC-SHA256(data.amount + identifier, secret_key)).
 * $data is the decoded "data" payload from the IPN POST.
 */
function sovamoney_verify_ipn(string $identifier, string $signature, array $data): bool
{
    $secret = setting('sovamoney_secret_key');
    if ($secret === '' || $signature === '' || $identifier === '') {
        return false;
    }
    $customKey = (string) ($data['amount'] ?? '') . $identifier;
    $mySignature = strtoupper(hash_hmac('sha256', $customKey, $secret));
    return hash_equals($mySignature, strtoupper($signature));
}
