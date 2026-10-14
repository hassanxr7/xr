<?php
/**
 * Hufan Exchange — WaafiPay real-time payment gateway client.
 * Docs: https://docs.waafipay.com/quickstart (API_PURCHASE / EVC Plus mobile wallet).
 * All credentials and the on/off switch live in the `settings` table and are
 * managed from Admin → Settings → WaafiPay.
 */
defined('APP') || exit;

function waafipay_config(): array
{
    return [
        'enabled'      => setting('waafipay_enabled', '0') === '1',
        'environment'  => setting('waafipay_environment', 'sandbox') === 'live' ? 'live' : 'sandbox',
        'merchant_uid' => setting('waafipay_merchant_uid'),
        'api_user_id'  => setting('waafipay_api_user_id'),
        'api_key'      => setting('waafipay_api_key'),
        'gateway_id'   => (int) setting('waafipay_gateway_id', '0'),
    ];
}

function waafipay_configured(array $c = null): bool
{
    $c = $c ?? waafipay_config();
    return $c['merchant_uid'] !== '' && $c['api_user_id'] !== '' && $c['api_key'] !== '';
}

/** Whether real-time WaafiPay charging applies to this "pay from" gateway. */
function waafipay_active_for(?array $fromGateway): bool
{
    if (!$fromGateway) {
        return false;
    }
    $c = waafipay_config();
    return $c['enabled'] && waafipay_configured($c) && $c['gateway_id'] === (int) $fromGateway['id'];
}

function waafipay_endpoint(?string $environment = null): string
{
    $environment = $environment ?? waafipay_config()['environment'];
    return $environment === 'live' ? 'https://api.waafipay.net/asm' : 'https://sandbox.waafipay.com/asm';
}

/** Normalise a Somali mobile number to WaafiPay's expected "2526xxxxxxxx" format. */
function waafipay_format_phone(string $phone): string
{
    $digits = preg_replace('/\D/', '', $phone) ?? '';
    if (strpos($digits, '252') === 0) {
        return $digits;
    }
    if (strpos($digits, '0') === 0) {
        $digits = substr($digits, 1);
    }
    return '252' . $digits;
}

/**
 * Charge a customer's mobile wallet in real time (WaafiPay API_PURCHASE, EVC Plus).
 * The customer gets a PIN/USSD prompt on their phone; WaafiPay holds the HTTP
 * response until they approve, decline, or the request times out, so this call
 * blocks for a while — call it with a generous execution time limit.
 *
 * Returns ['success' => bool, 'message' => string, 'state' => ?string, 'transaction_id' => ?string, 'raw' => ?array].
 */
function waafipay_purchase(string $accountNo, float $amount, string $currency, string $referenceId, string $description): array
{
    $c = waafipay_config();
    if (!waafipay_configured($c)) {
        return ['success' => false, 'message' => 'WaafiPay is not configured.', 'state' => null, 'transaction_id' => null, 'raw' => null];
    }

    $payload = [
        'schemaVersion' => '1.0',
        'requestId'     => bin2hex(random_bytes(16)),
        'timestamp'     => (string) time(),
        'channelName'   => 'WEB',
        'serviceName'   => 'API_PURCHASE',
        'serviceParams' => [
            'merchantUid'     => $c['merchant_uid'],
            'apiUserId'       => $c['api_user_id'],
            'apiKey'          => $c['api_key'],
            'paymentMethod'   => 'MWALLET_ACCOUNT',
            'payerInfo'       => [
                'accountNo' => waafipay_format_phone($accountNo),
            ],
            'transactionInfo' => [
                'referenceId' => mb_substr($referenceId, 0, 50),
                'invoiceId'   => mb_substr($referenceId, 0, 50),
                'amount'      => number_format($amount, 2, '.', ''),
                'currency'    => $currency ?: 'USD',
                'description' => mb_substr($description, 0, 190),
            ],
        ],
    ];

    if (function_exists('set_time_limit')) {
        @set_time_limit(90);
    }

    $ch = curl_init(waafipay_endpoint($c['environment']));
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => json_encode($payload, JSON_UNESCAPED_SLASHES),
        CURLOPT_HTTPHEADER     => ['Content-Type: application/json', 'Accept: application/json'],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT        => 75,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);
    $body = curl_exec($ch);
    $curlErr = curl_error($ch);
    curl_close($ch);

    if ($body === false || $body === '') {
        error_log('[Hufan] WaafiPay request failed: ' . $curlErr);
        return ['success' => false, 'message' => 'Could not reach WaafiPay. Please try again.', 'state' => null, 'transaction_id' => null, 'raw' => null];
    }

    $data = json_decode($body, true);
    if (!is_array($data)) {
        error_log('[Hufan] WaafiPay returned an unreadable response: ' . substr($body, 0, 500));
        return ['success' => false, 'message' => 'WaafiPay returned an unexpected response.', 'state' => null, 'transaction_id' => null, 'raw' => null];
    }

    $params = is_array($data['params'] ?? null) ? $data['params'] : [];
    $responseCode = (string) ($data['responseCode'] ?? '');
    $state = isset($params['state']) ? (string) $params['state'] : null;
    $success = $responseCode === '2001' || $state === 'APPROVED';
    $txId = $params['issuerTransactionId'] ?? $params['transactionId'] ?? $params['referenceId'] ?? null;

    return [
        'success'        => $success,
        'message'        => (string) ($data['responseMsg'] ?? ($success ? 'Approved' : 'Payment was not approved.')),
        'state'          => $state,
        'transaction_id' => $txId !== null ? (string) $txId : null,
        'raw'            => $data,
    ];
}
