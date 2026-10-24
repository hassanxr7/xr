<?php
/**
 * Single sign-on with the ITrackZen management system.
 *   /admin/sso.php?start=1     sends the browser to the management system to sign in (or reuse its session)
 *   /admin/sso.php?token=...   the management system sends the browser back here with a signed, short-lived token
 */
declare(strict_types=1);
require __DIR__ . '/../includes/bootstrap.php';
secure_session();
require_once __DIR__ . '/../includes/odoo.php';
header('Cache-Control: no-store'); header('X-Robots-Tag: noindex, nofollow');

function sso_fail(string $msg, int $status = 400): never
{
    http_response_code($status);
    echo '<!DOCTYPE html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign-in problem</title>'
        . '<link rel="stylesheet" href="/admin/admin.css"><main class="login"><div class="box"><h1>Sign-in problem</h1><p class="alert err">' . e($msg) . '</p>'
        . '<p><a href="/admin/">Back to sign in</a></p></div></main>';
    exit;
}

if (!odoo_enabled()) { sso_fail('Single sign-on is not configured on this website.', 404); }

if (isset($_GET['start'])) {
    $_SESSION['sso_state'] = bin2hex(random_bytes(16));
    $_SESSION['sso_started'] = time();
    $redirect = admin_base_url() . 'sso.php';
    header('Location: ' . odoo_url('/itz/sso/authorize') . '?redirect_uri=' . rawurlencode($redirect) . '&state=' . $_SESSION['sso_state'], true, 303);
    exit;
}

$token = (string)($_GET['token'] ?? ''); $state = (string)($_GET['state'] ?? '');
$expected = (string)($_SESSION['sso_state'] ?? '');
if ($token === '' || $expected === '' || !hash_equals($expected, $state) || (time() - (int)($_SESSION['sso_started'] ?? 0)) > 900) {
    unset($_SESSION['sso_state']);
    sso_fail('The sign-in request expired or did not start here. Please try again.');
}
unset($_SESSION['sso_state'], $_SESSION['sso_started']);
$claims = odoo_verify_token($token);
if (!$claims || !hash_equals($expected, (string)($claims['state'] ?? ''))) {
    admin_log('?', 'sso_failed', client_ip());
    sso_fail('The sign-in token could not be verified. Please try again.', 403);
}
// A login token can be used only once
$nonceFile = DATA_DIR . '/ratelimit/sso-' . hash('sha256', (string)$claims['nonce']);
if (!is_dir(DATA_DIR . '/ratelimit')) { @mkdir(DATA_DIR . '/ratelimit', 0755, true); }
if (is_file($nonceFile)) { sso_fail('This sign-in link was already used.', 403); }
@file_put_contents($nonceFile, (string)time());
foreach (glob(DATA_DIR . '/ratelimit/sso-*') ?: [] as $f) { if (filemtime($f) < time() - 3600) { @unlink($f); } }

$areas = array_values(array_filter((array)($claims['areas'] ?? []), 'is_string'));
$roles = array_values(array_filter((array)($claims['roles'] ?? []), 'is_string'));
$login = strtolower((string)$claims['login']);
$name = (string)($claims['name'] ?? $login);
$row = db_one('SELECT * FROM admins WHERE username=?', [$login]);
if ($row && ($row['source'] ?? 'local') !== 'odoo') {
    sso_fail('A local website account with the same name exists. Ask the owner to rename it.', 409);
}
if (!$row) {
    $uid = db_insert('admins', ['username' => $login, 'pass_hash' => '!sso', 'role' => $roles[0] ?? 'staff', 'active' => 1, 'created_at' => now_utc(),
        'source' => 'odoo', 'odoo_uid' => (int)$claims['uid'], 'display_name' => $name]);
} else {
    $uid = (int)$row['id'];
    if (!(int)$row['active']) { sso_fail('This account is disabled on the website.', 403); }
    db_update('admins', $uid, ['role' => $roles[0] ?? 'staff', 'odoo_uid' => (int)$claims['uid'], 'display_name' => $name]);
}
session_regenerate_id(true);
$_SESSION['admin_user'] = [
    'id' => $uid, 'username' => $login, 'name' => $name, 'role' => $roles[0] ?? 'staff', 'roles' => $roles, 'areas' => $areas, 'sso' => true,
    'odoo_uid' => (int)$claims['uid'], 'menus' => array_values(array_filter((array)($claims['menus'] ?? []), 'is_array')),
];
$_SESSION['last'] = time(); $_SESSION['csrf'] = bin2hex(random_bytes(24));
unset($_SESSION['odoo_summary']);
db_update('admins', $uid, ['last_login' => now_utc()]);
admin_log($login, 'login_sso', implode(',', $roles));
header('Location: /admin/', true, 303);
