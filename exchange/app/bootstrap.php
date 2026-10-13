<?php
/**
 * XR Exchange — bootstrap.
 * Waxaa la soo dhex galiyaa (require) bog kasta oo nidaamka ka mid ah.
 */
declare(strict_types=1);

define('APP', true);
define('APP_VERSION', '1.0.0');
define('BASE_PATH', dirname(__DIR__));
define('APP_PATH', __DIR__);
define('STORAGE_PATH', APP_PATH . '/storage');
define('UPLOAD_PATH', BASE_PATH . '/uploads');

require APP_PATH . '/helpers.php';

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
    error_log('[XR] ' . $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine());
    if (!headers_sent()) {
        http_response_code(500);
    }
    if (config('debug')) {
        echo '<pre>' . htmlspecialchars((string) $e) . '</pre>';
    } else {
        echo '<!doctype html><meta charset="utf-8"><title>Error</title>'
            . '<div style="font-family:system-ui;max-width:520px;margin:12vh auto;padding:24px;text-align:center">'
            . '<h1 style="font-size:22px">Khalad ayaa dhacay</h1>'
            . '<p style="color:#64748b">Fadlan isku day mar kale. Something went wrong, please try again.</p>'
            . '<p><a href="' . htmlspecialchars(url('')) . '">&larr; Home</a></p></div>';
    }
    exit;
});

// Security headers
header('X-Frame-Options: SAMEORIGIN');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: strict-origin-when-cross-origin');

// Session
session_name('XRSESS');
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
