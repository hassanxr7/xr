<?php
/**
 * Live SovaMoney U-ID check for the checkout form (called from app.js).
 * Logged-in customers only, CSRF-protected and rate-limited, and it returns
 * just the wallet name so it can't be used to harvest emails or phones.
 * exchange.php repeats the check server-side before creating the order.
 */
require __DIR__ . '/app/bootstrap.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$reply = function (int $code, array $body): void {
    http_response_code($code);
    echo json_encode($body, JSON_UNESCAPED_UNICODE);
    exit;
};

if (!is_post() || !user()) {
    $reply(401, ['ok' => false, 'message' => t('login_required')]);
}
$token = $_POST['_csrf'] ?? '';
if (!is_string($token) || !hash_equals(csrf_token(), $token)) {
    $reply(419, ['ok' => false, 'message' => t('csrf_error')]);
}
if (!sovamoney_lookup_enabled()) {
    $reply(404, ['ok' => false, 'message' => '']);
}

$uid = trim(mb_substr((string) ($_POST['uid'] ?? ''), 0, 60));
if ($uid === '') {
    $reply(422, ['ok' => false, 'message' => t('sova_uid_not_found')]);
}

$window = 600;
$limit = 15;
$now = time();
$recent = array_values(array_filter($_SESSION['sova_verify'] ?? [], fn ($ts) => is_int($ts) && $ts > $now - $window));
if (count($recent) >= $limit) {
    $reply(429, ['ok' => false, 'message' => t('sova_uid_rate')]);
}
$recent[] = $now;
$_SESSION['sova_verify'] = $recent;

$check = sovamoney_verify_uid($uid);
if ($check['ok']) {
    $reply(200, [
        'ok'      => true,
        'uid'     => $check['uid'],
        'name'    => $check['name'],
        'message' => t('sova_uid_found', ['name' => $check['name'], 'uid' => $check['uid']]),
    ]);
}
$reply(200, ['ok' => false, 'message' => t($check['not_found'] ? 'sova_uid_not_found' : 'sova_uid_unreachable')]);
