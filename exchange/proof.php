<?php
/** Serves payment-proof images, which live outside the public uploads folder. */
require __DIR__ . '/app/bootstrap.php';

$order = row('SELECT id, user_id, proof_file FROM orders WHERE id = ?', [(int) ($_GET['id'] ?? 0)]);
$allowed = $order && (admin() || (user() && (int) user()['id'] === (int) $order['user_id']));
$file = $order && $order['proof_file'] ? STORAGE_PATH . '/proofs/' . basename($order['proof_file']) : '';

if (!$allowed || $file === '' || !is_file($file)) {
    http_response_code(404);
    exit('Not found');
}

$types = ['jpg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp'];
$ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
header('Content-Type: ' . ($types[$ext] ?? 'application/octet-stream'));
header('Content-Length: ' . filesize($file));
header('Cache-Control: private, max-age=3600');
readfile($file);
