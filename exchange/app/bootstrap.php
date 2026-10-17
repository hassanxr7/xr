<?php
/**
 * Hufan Exchange — bootstrap.
 * Required at the top of every page.
 */
declare(strict_types=1);

define('APP', true);
define('APP_VERSION', '1.0.0');
define('BASE_PATH', dirname(__DIR__));
define('APP_PATH', __DIR__);
define('STORAGE_PATH', APP_PATH . '/storage');
define('UPLOAD_PATH', BASE_PATH . '/uploads');

require APP_PATH . '/helpers.php';
require APP_PATH . '/waafipay.php';
require APP_PATH . '/sovamoney.php';
require APP_PATH . '/nebdex.php';
require APP_PATH . '/upgrade.php';

$configFile = APP_PATH . '/config.php';
if (!is_file($configFile)) {
    header('Location: ' . url('install/'));
    exit;
}
$GLOBALS['config'] = require $configFile;

if (config('debug')) {
    error_reporting(E_ALL);
    ini_set('display_errors', '1');
} else {
    error_reporting(E_ALL & ~E_DEPRECATED & ~E_NOTICE);
    ini_set('display_errors', '0');
    ini_set('log_errors', '1');
    ini_set('error_log', STORAGE_PATH . '/error.log');
}

set_exception_handler(function (Throwable $e) {
    error_log('[Hufan] ' . $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine());
    if (!headers_sent()) {
        http_response_code(500);
    }
    if (config('debug')) {
        echo '<pre>' . htmlspecialchars((string) $e) . '</pre>';
    } else {
        echo '<!doctype html><meta charset="utf-8"><title>Error</title>'
            . '<div style="font-family:system-ui;max-width:520px;margin:12vh auto;padding:24px;text-align:center">'
            . '<h1 style="font-size:22px">Something went wrong</h1>'
            . '<p style="color:#64748b">Please try again in a moment.</p>'
            . '<p><a href="' . htmlspecialchars(url('')) . '">&larr; Home</a></p></div>';
    }
    exit;
});

upgrade_local_wallets();
upgrade_sovamoney_receive();
upgrade_sovamoney_payout();

// Security headers
header_remove('X-Powered-By');
header('X-Frame-Options: SAMEORIGIN');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()');
try {
    $gaId = setting('ga_measurement_id');
} catch (Throwable $e) {
    $gaId = '';
}
$cspConnect = "'self'" . ($gaId !== '' ? ' https://www.google-analytics.com https://www.googletagmanager.com' : '');
header("Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-" . csp_nonce() . "'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
    . "font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src $cspConnect; object-src 'none'; "
    . "base-uri 'self'; "
    // Checkout hosts listed because Chrome enforces form-action on the
    // redirect that follows the pay POST (302 to the provider's checkout).
    . "form-action 'self' https://nebdex.com https://*.nebdex.com https://sovamoney.com https://*.sovamoney.com; "
    . "frame-ancestors 'self'");
if (is_https()) {
    header('Strict-Transport-Security: max-age=31536000');
}

// Session
ini_set('session.use_strict_mode', '1');
ini_set('session.use_only_cookies', '1');
session_name('HUFANSESS');
session_set_cookie_params([
    'lifetime' => 0,
    'path'     => (base_url() ?: '') . '/',
    'secure'   => is_https(),
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();

date_default_timezone_set(setting('timezone', 'Africa/Mogadishu') ?: 'Africa/Mogadishu');

// Language switch (?lang=so|en)
if (isset($_GET['lang']) && in_array($_GET['lang'], ['so', 'en'], true)) {
    $_SESSION['lang'] = $_GET['lang'];
    $params = $_GET;
    unset($params['lang']);
    $path = strtok($_SERVER['REQUEST_URI'] ?? '/', '?');
    header('Location: ' . $path . ($params ? '?' . http_build_query($params) : ''));
    exit;
}

// Logged-in user that was blocked in the meantime gets signed out.
if (!empty($_SESSION['uid'])) {
    $u = user();
    if (!$u || $u['status'] !== 'active') {
        unset($_SESSION['uid']);
    }
}
