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
    if (!$c['enabled'] || !sovamoney_configured($c)) {
        return false;
    }
    // Sending from the SovaMoney wallet itself always pays via SovaMoney checkout.
    return $c['gateway_id'] === (int) $fromGateway['id'] || ($fromGateway['code'] ?? '') === 'sovamoney';
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

// ---------------------------------------------------------------------------
// Merchant payout to a customer's SovaMoney wallet (Payout API v2, U-ID).
// Synchronous internal transfer: merchant wallet → user wallet. There is no
// payout IPN, so the HTTP response is final.
// ---------------------------------------------------------------------------

function sovamoney_payout_enabled(): bool
{
    return setting('sovamoney_payout_enabled', '0') === '1' && setting('sovamoney_public_key') !== '';
}

function sovamoney_payout_base_url(): string
{
    $custom = rtrim(setting('sovamoney_payout_base_url'), '/');
    if ($custom !== '') {
        return $custom;
    }
    // The payout API documents no sandbox, so it always targets production.
    return 'https://sovamoney.com';
}

/** U-ID lookups (read-only, no money moves) only need the public key. */
function sovamoney_lookup_enabled(): bool
{
    return setting('sovamoney_public_key') !== '';
}

/**
 * Wallet holder's display name from a user-verify payload. The payout docs
 * say full_name, but SovaMoney (ViserPay) installs may return firstname /
 * lastname or nest the user object, so accept the common shapes.
 */
function sovamoney_extract_name(array $u): string
{
    foreach (['full_name', 'fullname', 'fullName', 'name'] as $k) {
        if (is_scalar($u[$k] ?? null) && trim((string) $u[$k]) !== '') {
            return trim((string) $u[$k]);
        }
    }
    foreach ([['firstname', 'lastname'], ['first_name', 'last_name'], ['firstName', 'lastName']] as [$f, $l]) {
        $name = trim(trim((string) (is_scalar($u[$f] ?? null) ? $u[$f] : '')) . ' ' . trim((string) (is_scalar($u[$l] ?? null) ? $u[$l] : '')));
        if ($name !== '') {
            return $name;
        }
    }
    return is_scalar($u['username'] ?? null) ? trim((string) $u['username']) : '';
}

/** Whether this gateway row is the SovaMoney "receive" wallet. */
function is_sovamoney_gateway(?array $gateway): bool
{
    return $gateway !== null && ($gateway['code'] ?? '') === 'sovamoney';
}

/**
 * POST form-encoded to a SovaMoney API path.
 * Returns ['reached' => bool, 'sent' => bool, 'data' => ?array, 'error' => string]:
 * reached = got a parseable JSON reply; sent = the request may have reached
 * SovaMoney (false only when the connection itself never opened).
 */
function sovamoney_api_post(string $path, array $params, int $timeout = 30): array
{
    $url = sovamoney_payout_base_url() . $path;
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => http_build_query($params),
        CURLOPT_HTTPHEADER     => ['Accept: application/json'],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT        => $timeout,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
    ]);
    $body = curl_exec($ch);
    $errno = curl_errno($ch);
    $err = curl_error($ch);
    $http = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    $base = ['url' => $url, 'http' => $http, 'body' => is_string($body) ? mb_substr($body, 0, 1000) : ''];

    if ($body === false || $body === '') {
        // Resolve / connect / TLS-handshake failures mean nothing was sent.
        $notSent = in_array($errno, [CURLE_COULDNT_RESOLVE_HOST, CURLE_COULDNT_CONNECT, CURLE_SSL_CONNECT_ERROR], true);
        return $base + ['reached' => false, 'sent' => !$notSent, 'data' => null, 'error' => $err !== '' ? $err : 'Empty response (HTTP ' . $http . ')'];
    }
    $data = json_decode($body, true);
    if (!is_array($data)) {
        return $base + ['reached' => false, 'sent' => true, 'data' => null, 'error' => 'HTTP ' . $http . ', unreadable response: ' . mb_substr(trim(strip_tags($body)), 0, 200)];
    }
    return $base + ['reached' => true, 'sent' => true, 'data' => $data, 'error' => ''];
}

/** Flatten SovaMoney's message field (array, {error:[...]} or string) to text. */
function sovamoney_message($message): string
{
    if (is_string($message)) {
        return $message;
    }
    $parts = [];
    array_walk_recursive($message, function ($v) use (&$parts) {
        if (is_scalar($v)) {
            $parts[] = (string) $v;
        }
    });
    // Some replies list a bare "error"/"success" label before the real text.
    $useful = array_filter($parts, fn ($p) => !in_array(strtolower(trim($p)), ['error', 'success'], true));
    return implode(' ', $useful ?: $parts);
}

/**
 * Check a customer-entered U-ID (or username / mobile) before taking their order.
 * not_found is true only when SovaMoney itself says the user doesn't exist;
 * any other failure (bad key, missing route, outage) is a service problem
 * and is logged with the raw reply instead of blaming the customer's U-ID.
 * Returns ['ok', 'not_found', 'uid', 'name', 'message', 'debug' => [url, http, body]].
 */
function sovamoney_verify_uid(string $uid): array
{
    $uid = trim($uid);
    $res = sovamoney_api_post('/api/merchant/payout/user-verify', [
        'public_key' => setting('sovamoney_public_key'),
        'uid'        => $uid,
    ], 20);
    $debug = ['url' => $res['url'], 'http' => $res['http'], 'body' => $res['body']];
    $d = $res['data'] ?? [];
    if ($res['reached'] && ($d['status'] ?? '') === 'success' && is_array($d['data'] ?? null)) {
        $u = $d['data'];
        foreach (['user', 'account', 'wallet'] as $k) {
            if (is_array($u[$k] ?? null)) {
                $u = $u[$k] + $d['data'];
                break;
            }
        }
        $name = sovamoney_extract_name($u);
        if ($name === '') {
            error_log('[Hufan] SovaMoney user-verify returned no name: ' . mb_substr($res['body'], 0, 300));
        }
        $realUid = '';
        foreach (['uid', 'user_id', 'userId'] as $k) {
            if (is_scalar($u[$k] ?? null) && trim((string) $u[$k]) !== '') {
                $realUid = trim((string) $u[$k]);
                break;
            }
        }
        return [
            'ok'        => true,
            'not_found' => false,
            'uid'       => $realUid !== '' ? $realUid : $uid,
            'name'      => $name,
            'message'   => '',
            'debug'     => $debug,
        ];
    }
    $message = $res['reached'] ? sovamoney_message($d['message'] ?? 'Unexpected reply') : $res['error'];
    $notFound = $res['reached'] && ($d['status'] ?? '') === 'error' && preg_match('/user not found/i', $message);
    if (!$notFound) {
        error_log('[Hufan] SovaMoney user-verify failed: HTTP ' . $res['http'] . ' ' . $res['url'] . ' — ' . $message . ' — ' . mb_substr($res['body'], 0, 300));
    }
    return ['ok' => false, 'not_found' => (bool) $notFound, 'uid' => $uid, 'name' => '', 'message' => $message, 'debug' => $debug];
}

function sovamoney_payout_row(int $orderId): ?array
{
    upgrade_sovamoney_payout();
    return row('SELECT * FROM sovamoney_payouts WHERE order_id = ?', [$orderId]);
}

/**
 * Send an order's receive_amount to the customer's SovaMoney wallet and, on
 * success, complete the order. Safe to call any number of times (duplicate
 * IPNs, double clicks): a payout is claimed atomically per order, and once
 * claimed it is only retried when $allowRetry is set (admin action) and the
 * previous attempt failed or ended with an unknown result.
 *
 * Returns ['status' => 'success'|'failed'|'unknown'|'skipped', 'message' => string].
 */
function sovamoney_payout_order(int $orderId, string $actor = 'system', ?int $actorId = null, bool $allowRetry = false): array
{
    if (!sovamoney_payout_enabled()) {
        return ['status' => 'skipped', 'message' => 'SovaMoney payouts are turned off.'];
    }
    $order = row('SELECT * FROM orders WHERE id = ?', [$orderId]);
    if (!$order || !in_array($order['status'], ['pending', 'processing'], true)) {
        return ['status' => 'skipped', 'message' => 'Order is not paid yet.'];
    }
    $toGw = $order['to_gateway_id'] ? row('SELECT * FROM gateways WHERE id = ?', [$order['to_gateway_id']]) : null;
    if (!is_sovamoney_gateway($toGw)) {
        return ['status' => 'skipped', 'message' => 'Not a SovaMoney order.'];
    }

    upgrade_sovamoney_payout();
    $amount = number_format((float) $order['receive_amount'], 2, '.', '');
    $now = now();

    // Atomic claim: the UNIQUE(order_id) insert wins exactly once; a retry
    // only flips a failed/unknown row back to 'sending' if nobody else did.
    $claimed = false;
    try {
        insert('sovamoney_payouts', [
            'order_id'   => $orderId,
            'uid'        => $order['receiver_account'],
            'amount'     => $amount,
            'reference'  => $order['order_no'],
            'status'     => 'sending',
            'attempts'   => 1,
            'created_at' => $now,
            'updated_at' => $now,
        ]);
        $claimed = true;
    } catch (PDOException $e) {
        if ($allowRetry) {
            $claimed = q(
                "UPDATE sovamoney_payouts SET status = 'sending', attempts = attempts + 1, uid = ?, amount = ?, updated_at = ?
                 WHERE order_id = ? AND status IN ('failed', 'unknown')",
                [$order['receiver_account'], $amount, $now, $orderId]
            )->rowCount() === 1;
        }
    }
    if (!$claimed) {
        return ['status' => 'skipped', 'message' => 'A payout for this order was already sent or is in progress.'];
    }

    $res = sovamoney_api_post('/api/merchant/payout/user', [
        'public_key' => setting('sovamoney_public_key'),
        'uid'        => $order['receiver_account'],
        'amount'     => $amount,
        'reference'  => $order['order_no'],
    ], 45);
    $raw = $res['data'] !== null ? json_encode($res['data'], JSON_UNESCAPED_UNICODE) : $res['error'];
    $fresh = row('SELECT * FROM orders WHERE id = ?', [$orderId]);

    if ($res['reached'] && ($res['data']['status'] ?? '') === 'success') {
        $trx = (string) ($res['data']['data']['trx'] ?? $order['order_no']);
        update('sovamoney_payouts', ['status' => 'success', 'trx' => $trx, 'message' => null, 'response' => $raw, 'updated_at' => now()], 'order_id = ?', [$orderId]);
        set_order_status($fresh, 'completed', t('log_sovamoney_payout_sent', ['trx' => $trx]), $actor, $actorId, ['payout_ref' => mb_substr($trx, 0, 190)]);
        telegram_notify(order_telegram_text(row('SELECT * FROM orders WHERE id = ?', [$orderId]), '✅ SovaMoney payout sent (' . $trx . ')'));
        return ['status' => 'success', 'message' => $trx];
    }

    if ($res['reached'] || !$res['sent']) {
        // SovaMoney answered with an error (or the connection never opened):
        // no money moved, so the payout can be retried safely.
        $msg = $res['reached'] ? sovamoney_message($res['data']['message'] ?? 'Payout failed') : $res['error'];
        update('sovamoney_payouts', ['status' => 'failed', 'message' => mb_substr($msg, 0, 500), 'response' => $raw, 'updated_at' => now()], 'order_id = ?', [$orderId]);
        order_log($orderId, $fresh['status'], t('log_sovamoney_payout_failed', ['msg' => $msg]), $actor, $actorId);
        telegram_notify(order_telegram_text($fresh, '⚠️ SovaMoney payout failed: ' . $msg));
        return ['status' => 'failed', 'message' => $msg];
    }

    // Request went out but the reply was lost (timeout, broken response):
    // the money may or may not have moved, so never retry automatically.
    update('sovamoney_payouts', ['status' => 'unknown', 'message' => mb_substr($res['error'], 0, 500), 'response' => $raw, 'updated_at' => now()], 'order_id = ?', [$orderId]);
    order_log($orderId, $fresh['status'], t('log_sovamoney_payout_unknown', ['msg' => $res['error']]), $actor, $actorId);
    telegram_notify(order_telegram_text($fresh, '❓ SovaMoney payout result unknown — check your SovaMoney history: ' . $res['error']));
    error_log('[Hufan] SovaMoney payout unknown for order ' . $order['order_no'] . ': ' . $res['error']);
    return ['status' => 'unknown', 'message' => $res['error']];
}

// ---------------------------------------------------------------------------
// Merchant withdrawal (Merchant API §5–7): moves the merchant's SovaMoney
// balance to one of the merchant's OWN saved withdrawal destinations
// (user_method_id). It cannot send money to an arbitrary customer account.
// "Withdraw request sent successfully" only means the request was accepted;
// the API documents no status mapping, status endpoint or webhook, so a
// request is never treated as paid here.
// ---------------------------------------------------------------------------

/** Read a numeric field that may be a string like "10.00000000". */
function sovamoney_num($v): float
{
    return is_numeric($v) ? (float) $v : 0.0;
}

/**
 * Fetch the merchant's withdrawal destinations.
 * Returns ['ok', 'message', 'methods' => [...], 'otp_required', 'otp_methods', 'debug'].
 */
function sovamoney_withdraw_methods(): array
{
    $res = sovamoney_api_post('/api/merchant/withdraw/getmethod', ['public_key' => setting('sovamoney_public_key')], 25);
    $debug = ['url' => $res['url'], 'http' => $res['http'], 'body' => $res['body']];
    $d = $res['data'] ?? [];
    if (!$res['reached'] || ($d['status'] ?? '') !== 'success' || !is_array($d['data']['userMethods'] ?? null)) {
        $msg = $res['reached'] ? sovamoney_message($d['message'] ?? 'Unexpected reply') : $res['error'];
        return ['ok' => false, 'message' => $msg, 'methods' => [], 'otp_required' => false, 'otp_methods' => [], 'debug' => $debug];
    }
    $methods = [];
    foreach ($d['data']['userMethods'] as $um) {
        if (!is_array($um) || !isset($um['user_method_id'], $um['method_id'])) {
            continue;
        }
        $wm = is_array($um['withdraw_method'] ?? null) ? $um['withdraw_method'] : [];
        $min = max(sovamoney_num($um['min_limit'] ?? 0), sovamoney_num($wm['min_limit'] ?? 0));
        $maxes = array_filter([sovamoney_num($um['max_limit'] ?? 0), sovamoney_num($wm['max_limit'] ?? 0)], fn ($v) => $v > 0);
        $methods[(int) $um['user_method_id']] = [
            'user_method_id' => (int) $um['user_method_id'],
            'method_id'      => (int) $um['method_id'],
            'destination'    => mb_substr(trim((string) ($um['name'] ?? '')), 0, 120),
            'method_name'    => mb_substr(trim((string) ($wm['name'] ?? ('Method #' . $um['method_id']))), 0, 120),
            'currency'       => strtoupper(mb_substr((string) ($wm['currency'] ?? 'USD'), 0, 10)),
            'min'            => $min,
            'max'            => $maxes ? min($maxes) : 0.0,
            'fixed_charge'   => sovamoney_num($wm['fixed_charge'] ?? 0),
            'percent_charge' => sovamoney_num($wm['percent_charge'] ?? 0),
            'rate'           => sovamoney_num($wm['rate'] ?? 1) ?: 1.0,
        ];
    }
    $otpMethods = $d['data']['otp_methods'] ?? [];
    if (is_string($otpMethods)) {
        $otpMethods = preg_split('/[^A-Za-z0-9]+/', $otpMethods, -1, PREG_SPLIT_NO_EMPTY);
    }
    $otpMethods = array_values(array_intersect(is_array($otpMethods) ? array_map('strval', $otpMethods) : [], ['email', 'sms', '2FA']));
    $otpRequired = filter_var($d['data']['otp_required'] ?? false, FILTER_VALIDATE_BOOLEAN);
    return ['ok' => true, 'message' => '', 'methods' => $methods, 'otp_required' => $otpRequired, 'otp_methods' => $otpMethods, 'debug' => $debug];
}

/** Estimated charge and payout for a destination: charge = fixed + amount×%; final = (amount − charge) × rate. */
function sovamoney_withdraw_quote(array $m, float $amount): array
{
    $charge = round($m['fixed_charge'] + $amount * $m['percent_charge'] / 100, 2);
    return ['charge' => $charge, 'final' => round(max(0, $amount - $charge) * $m['rate'], 2)];
}

/** Fields worth keeping from a SovaMoney "withdraw" object for reconciliation. */
function sovamoney_withdraw_fields(array $w): array
{
    $s = fn ($v, $len) => is_scalar($v) ? mb_substr((string) $v, 0, $len) : null;
    return [
        'sm_id'           => $s($w['id'] ?? null, 40),
        'sm_trx'          => $s($w['trx'] ?? null, 60),
        'sm_amount'       => $s($w['amount'] ?? null, 40),
        'sm_currency'     => $s($w['currency'] ?? null, 10),
        'sm_charge'       => $s($w['charge'] ?? null, 40),
        'sm_final_amount' => $s($w['final_amount'] ?? ($w['after_charge'] ?? null), 40),
        'sm_status'       => $s($w['status'] ?? null, 20),
    ];
}

/** Withdrawals that must be resolved before a new one may be sent (in flight or outcome unknown). */
function sovamoney_withdraw_blocking(): ?array
{
    upgrade_sovamoney_withdrawals();
    return row("SELECT * FROM sovamoney_withdrawals WHERE status IN ('sending', 'otp_verifying', 'unknown') ORDER BY id DESC LIMIT 1");
}

/**
 * Submit a withdrawal request. $nonce is the one-time key of the confirmation
 * form: the UNIQUE index makes a resubmitted form return the original row
 * instead of creating (and sending) a second withdrawal.
 */
function sovamoney_withdraw_create(int $adminId, string $nonce, array $method, float $amount, ?string $otpMethod): array
{
    upgrade_sovamoney_withdrawals();
    $existing = row('SELECT * FROM sovamoney_withdrawals WHERE nonce = ?', [$nonce]);
    if ($existing) {
        return $existing;
    }
    if (sovamoney_withdraw_blocking()) {
        throw new RuntimeException(t('a_swd_err_blocked'));
    }
    $quote = sovamoney_withdraw_quote($method, $amount);
    $now = now();
    try {
        $id = insert('sovamoney_withdrawals', [
            'nonce'          => $nonce,
            'admin_id'       => $adminId,
            'method_id'      => $method['method_id'],
            'user_method_id' => $method['user_method_id'],
            'destination'    => $method['destination'],
            'method_name'    => $method['method_name'],
            'currency'       => $method['currency'],
            'amount'         => number_format($amount, 2, '.', ''),
            'est_charge'     => number_format($quote['charge'], 2, '.', ''),
            'est_final'      => number_format($quote['final'], 2, '.', ''),
            'otp_method'     => $otpMethod,
            'status'         => 'sending',
            'created_at'     => $now,
            'updated_at'     => $now,
        ]);
    } catch (PDOException $e) {
        $row = row('SELECT * FROM sovamoney_withdrawals WHERE nonce = ?', [$nonce]);
        if ($row) {
            return $row;
        }
        throw $e;
    }

    $params = [
        'public_key'     => setting('sovamoney_public_key'),
        'method_id'      => $method['method_id'],
        'user_method_id' => $method['user_method_id'],
        'amount'         => number_format($amount, 2, '.', ''),
    ];
    if ($otpMethod !== null) {
        $params['otp_method'] = $otpMethod;
    }
    $res = sovamoney_api_post('/api/merchant/withdraw/request', $params, 45);
    $d = $res['data'] ?? [];
    $raw = $res['data'] !== null ? json_encode($res['data'], JSON_UNESCAPED_UNICODE) : $res['error'];
    $set = ['response' => $raw, 'updated_at' => now()];

    if ($res['reached'] && ($d['status'] ?? '') === 'success' && is_array($d['data']['withdraw'] ?? null)) {
        $set += ['status' => 'submitted', 'message' => sovamoney_message($d['message'] ?? '')] + sovamoney_withdraw_fields($d['data']['withdraw']);
    } elseif ($res['reached'] && ($d['status'] ?? '') === 'success' && isset($d['data']['action_id'], $d['data']['transaction_no'])) {
        $set += [
            'status'         => 'otp_pending',
            'action_id'      => mb_substr((string) $d['data']['action_id'], 0, 40),
            'transaction_no' => mb_substr((string) $d['data']['transaction_no'], 0, 120),
            'otp_expires_at' => is_scalar($d['data']['expired_at'] ?? null) ? mb_substr((string) $d['data']['expired_at'], 0, 40) : null,
            'message'        => sovamoney_message($d['message'] ?? ''),
        ];
    } elseif ($res['reached'] && ($d['status'] ?? '') === 'error') {
        $set += ['status' => 'failed', 'message' => mb_substr(sovamoney_message($d['message'] ?? 'Request rejected'), 0, 500)];
    } elseif (!$res['reached'] && !$res['sent']) {
        $set += ['status' => 'failed', 'message' => mb_substr($res['error'], 0, 500)];
    } else {
        // Sent, but no usable answer: SovaMoney may or may not have created it.
        $set += ['status' => 'unknown', 'message' => mb_substr($res['error'] !== '' ? $res['error'] : 'Unexpected reply from SovaMoney', 0, 500)];
    }
    update('sovamoney_withdrawals', $set, 'id = ?', [$id]);
    return row('SELECT * FROM sovamoney_withdrawals WHERE id = ?', [$id]);
}

function sovamoney_withdraw_otp_expired(array $w): bool
{
    $ts = $w['otp_expires_at'] ? strtotime((string) $w['otp_expires_at']) : false;
    return $ts !== false && $ts < time();
}

/** Verify the OTP for a withdrawal waiting on one. Returns the updated row. */
function sovamoney_withdraw_verify_otp(int $id, string $otp): array
{
    upgrade_sovamoney_withdrawals();
    $w = row('SELECT * FROM sovamoney_withdrawals WHERE id = ?', [$id]);
    if (!$w || $w['status'] !== 'otp_pending') {
        throw new RuntimeException(t('a_swd_err_not_waiting'));
    }
    if (sovamoney_withdraw_otp_expired($w)) {
        update('sovamoney_withdrawals', ['status' => 'otp_expired', 'message' => t('a_swd_otp_expired'), 'updated_at' => now()], 'id = ?', [$id]);
        return row('SELECT * FROM sovamoney_withdrawals WHERE id = ?', [$id]);
    }
    // Atomic hand-off so a double-submitted OTP form calls SovaMoney once.
    if (q("UPDATE sovamoney_withdrawals SET status = 'otp_verifying', updated_at = ? WHERE id = ? AND status = 'otp_pending'", [now(), $id])->rowCount() !== 1) {
        throw new RuntimeException(t('a_swd_err_not_waiting'));
    }
    $res = sovamoney_api_post('/api/merchant/withdraw/otp/verify', [
        'public_key'     => setting('sovamoney_public_key'),
        'action_id'      => $w['action_id'],
        'otp_method'     => $w['otp_method'],
        'otp'            => $otp,
        'transaction_no' => $w['transaction_no'],
    ], 45);
    $d = $res['data'] ?? [];
    $raw = $res['data'] !== null ? json_encode($res['data'], JSON_UNESCAPED_UNICODE) : $res['error'];
    $set = ['response' => $raw, 'updated_at' => now()];

    if ($res['reached'] && ($d['status'] ?? '') === 'success' && is_array($d['data']['withdraw'] ?? null)) {
        $set += ['status' => 'submitted', 'message' => sovamoney_message($d['message'] ?? '')] + sovamoney_withdraw_fields($d['data']['withdraw']);
    } elseif ($res['reached'] && ($d['status'] ?? '') === 'error') {
        $msg = sovamoney_message($d['message'] ?? 'Invalid OTP');
        $expired = (bool) preg_match('/expire/i', $msg);
        $set += ['status' => $expired ? 'otp_expired' : 'otp_pending', 'message' => mb_substr($msg, 0, 500)];
    } elseif (!$res['reached'] && !$res['sent']) {
        $set += ['status' => 'otp_pending', 'message' => mb_substr($res['error'], 0, 500)];
    } else {
        $set += ['status' => 'unknown', 'message' => mb_substr($res['error'] !== '' ? $res['error'] : 'Unexpected reply from SovaMoney', 0, 500)];
    }
    update('sovamoney_withdrawals', $set, 'id = ?', [$id]);
    return row('SELECT * FROM sovamoney_withdrawals WHERE id = ?', [$id]);
}

/** Whether an admin may resolve this withdrawal by hand (unknown, or stuck in flight > 2 min). */
function sovamoney_withdraw_reconcilable(array $w): bool
{
    if ($w['status'] === 'unknown') {
        return true;
    }
    return in_array($w['status'], ['sending', 'otp_verifying'], true) && strtotime((string) $w['updated_at']) < time() - 120;
}

/** Record what the admin found in SovaMoney for an unresolved request. */
function sovamoney_withdraw_reconcile(int $id, bool $foundInSovaMoney, string $adminName): void
{
    $w = row('SELECT * FROM sovamoney_withdrawals WHERE id = ?', [$id]);
    if (!$w || !sovamoney_withdraw_reconcilable($w)) {
        throw new RuntimeException(t('a_swd_err_not_reconcilable'));
    }
    update('sovamoney_withdrawals', [
        'status'     => $foundInSovaMoney ? 'submitted' : 'failed',
        'message'    => t($foundInSovaMoney ? 'a_swd_reconciled_found' : 'a_swd_reconciled_missing', ['name' => $adminName]),
        'updated_at' => now(),
    ], 'id = ?', [$id]);
}

/** Abandon a request that is still waiting for its OTP (nothing was confirmed). */
function sovamoney_withdraw_cancel(int $id): void
{
    q("UPDATE sovamoney_withdrawals SET status = 'cancelled', message = ?, updated_at = ? WHERE id = ? AND status = 'otp_pending'", [t('a_swd_cancelled_note'), now(), $id]);
}
