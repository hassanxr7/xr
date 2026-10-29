<?php
/**
 * The Guardia — bootstrap.
 * Required at the top of every entry point (index.php, admin/*, cron.php).
 */
declare(strict_types=1);

define('APP', true);
define('APP_VERSION', '1.0.0');
define('SCHEMA_VERSION', '2');
define('BASE_PATH', dirname(__DIR__));
define('APP_PATH', __DIR__);
define('STORAGE_PATH', APP_PATH . '/storage');
define('UPLOAD_PATH', BASE_PATH . '/uploads');

require APP_PATH . '/helpers.php';
require APP_PATH . '/content.php';
require APP_PATH . '/images.php';
require APP_PATH . '/seo.php';
require APP_PATH . '/cache.php';
require APP_PATH . '/ads.php';
require APP_PATH . '/analytics.php';
require APP_PATH . '/geoip.php';
require APP_PATH . '/webpush.php';
require APP_PATH . '/ai.php';
require APP_PATH . '/store.php';
require APP_PATH . '/importers.php';
require APP_PATH . '/newsroom.php';

$configFile = APP_PATH . '/config.php';
if (!is_file($configFile)) {
    if (PHP_SAPI === 'cli') {
        fwrite(STDERR, "Not installed yet: open /install/ in your browser first.\n");
        exit(1);
    }
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
}
ini_set('log_errors', '1');
ini_set('error_log', STORAGE_PATH . '/logs/error.log');

set_exception_handler(function (Throwable $e) {
    log_error($e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine());
    if (PHP_SAPI === 'cli') {
        fwrite(STDERR, (string) $e . "\n");
        exit(1);
    }
    if (!headers_sent()) {
        http_response_code(500);
    }
    if (config('debug')) {
        echo '<pre>' . htmlspecialchars((string) $e) . '</pre>';
    } else {
        echo '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Error</title>'
            . '<div style="font-family:Georgia,serif;max-width:520px;margin:12vh auto;padding:24px;text-align:center">'
            . '<h1 style="font-size:24px">Something went wrong</h1>'
            . '<p style="color:#555">Please try again in a moment.</p>'
            . '<p><a href="' . htmlspecialchars(url('')) . '">&larr; Home</a></p></div>';
    }
    exit;
});

date_default_timezone_set(setting('timezone', 'America/Toronto') ?: 'America/Toronto');

upgrade_schema();

header_remove('X-Powered-By');
if (PHP_SAPI !== 'cli') {
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: strict-origin-when-cross-origin');
    if (is_https()) {
        header('Strict-Transport-Security: max-age=31536000');
    }
}

/** Apply the database schema again when the code ships a newer schema version (all statements are idempotent). */
function upgrade_schema(): void
{
    if (setting('schema_version') === SCHEMA_VERSION) {
        return;
    }
    db()->exec((string) file_get_contents(APP_PATH . '/schema.sql'));
    save_setting('schema_version', SCHEMA_VERSION);
}

/** One CSP nonce per request for the <script> tags we output. */
function csp_nonce(): string
{
    static $nonce = null;
    if ($nonce === null) {
        $nonce = base64_encode(random_bytes(16));
    }
    return $nonce;
}

/**
 * Public pages: strict nonce-based script policy that Google AdSense supports
 * ('strict-dynamic' lets the ad scripts load their own scripts).
 */
function send_public_headers(?string $nonce = null): void
{
    $nonce = $nonce ?? csp_nonce();
    header("Content-Security-Policy: script-src 'nonce-$nonce' 'strict-dynamic' https: 'unsafe-inline'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'");
    header('X-Frame-Options: SAMEORIGIN');
    header('Permissions-Policy: camera=(), microphone=(), geolocation=()');
}

/** Admin pages: everything from our own origin only. */
function send_admin_headers(): void
{
    header("Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-" . csp_nonce() . "'; style-src 'self' 'unsafe-inline'; "
        . "img-src 'self' data: blob: https:; font-src 'self'; connect-src 'self'; frame-src https://www.youtube-nocookie.com https://www.youtube.com; "
        . "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'");
    header('X-Frame-Options: SAMEORIGIN');
    header('Cache-Control: no-store');
}

/** Sessions are only started where needed, so public pages stay cookie-free and cacheable. */
function start_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    session_name('TGSESS');
    session_set_cookie_params([
        'lifetime' => 0,
        'path'     => (base_url() ?: '') . '/',
        'secure'   => is_https(),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
}

/** True when the visitor carries a session cookie (signed-in staff or someone mid-form). */
function has_session_cookie(): bool
{
    return !empty($_COOKIE['TGSESS']);
}
