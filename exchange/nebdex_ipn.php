<?php
/**
 * Nebdex payment webhook. Called directly by Nebdex's servers — no customer
 * session, no CSRF token. Authenticity is established purely by the HMAC
 * signature in nebdex_verify_ipn(). This URL must be entered once in the
 * Nebdex merchant dashboard (the API has no per-request ipn_url parameter).
 *
 * Nebdex's own integration notes say the signature covers order_id only —
 * so this never trusts amount/currency from the payload; the order's own
 * stored amount is always what gets credited.
 */
require __DIR__ . '/app/bootstrap.php';

header('Content-Type: text/plain');

$status = (string) ($_POST['status'] ?? '');
$orderId = (string) ($_POST['order_id'] ?? '');
$signature = (string) ($_POST['signature'] ?? '');
$data = $_POST['data'] ?? [];
if (is_string($data)) {
    $decoded = json_decode($data, true);
    $data = is_array($decoded) ? $decoded : [];
}
if (!is_array($data)) {
    $data = [];
}

if (!nebdex_verify_ipn($orderId, $signature)) {
    error_log('[Hufan] Nebdex IPN: invalid signature for order ' . $orderId);
    http_response_code(400);
    exit('invalid signature');
}

$order = row('SELECT * FROM orders WHERE order_no = ?', [$orderId]);
if (!$order) {
    http_response_code(404);
    exit('order not found');
}

if ($status === 'success' && $order['status'] === 'awaiting_payment') {
    $ref = (string) ($data['payment_transaction_id'] ?? $data['transaction_id'] ?? $orderId);
    set_order_status($order, 'processing', t('log_nebdex_paid', ['ref' => $ref]), 'system', null, [
        'payment_ref' => mb_substr($ref, 0, 120),
    ]);
    telegram_notify(order_telegram_text(row('SELECT * FROM orders WHERE id = ?', [$order['id']]), '💳 Nebdex payment confirmed'));
} elseif ($status !== 'success') {
    order_log((int) $order['id'], $order['status'], 'Nebdex reported payment status: ' . $status, 'system');
}

echo 'ok';
