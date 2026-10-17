<?php
/**
 * SovaMoney Instant Payment Notification (IPN) webhook.
 * Called directly by SovaMoney's servers — no customer session, no CSRF
 * token (there is none to check). Authenticity is established purely by
 * the HMAC signature in sovamoney_verify_ipn().
 */
require __DIR__ . '/app/bootstrap.php';

header('Content-Type: text/plain');

$status = (string) ($_POST['status'] ?? '');
$identifier = (string) ($_POST['identifier'] ?? '');
$signature = (string) ($_POST['signature'] ?? '');
$data = $_POST['data'] ?? [];
if (is_string($data)) {
    $decoded = json_decode($data, true);
    $data = is_array($decoded) ? $decoded : [];
}
if (!is_array($data)) {
    $data = [];
}

if (!sovamoney_verify_ipn($identifier, $signature, $data)) {
    error_log('[Hufan] SovaMoney IPN: invalid signature for identifier ' . $identifier);
    http_response_code(400);
    exit('invalid signature');
}

$order = row('SELECT * FROM orders WHERE order_no = ?', [$identifier]);
if (!$order) {
    http_response_code(404);
    exit('order not found');
}

if ($status === 'success' && $order['status'] === 'awaiting_payment') {
    $ref = (string) ($data['payment_transaction_id'] ?? $data['transaction_id'] ?? $data['trx'] ?? $identifier);
    set_order_status($order, 'processing', t('log_sovamoney_paid', ['ref' => $ref]), 'system', null, [
        'payment_ref' => mb_substr($ref, 0, 120),
    ]);
    telegram_notify(order_telegram_text(row('SELECT * FROM orders WHERE id = ?', [$order['id']]), '💳 SovaMoney payment confirmed'));
    sovamoney_payout_order((int) $order['id']);
} elseif ($status !== 'success') {
    order_log((int) $order['id'], $order['status'], 'SovaMoney reported payment status: ' . $status, 'system');
}

echo 'ok';
