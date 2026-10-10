<?php
/**
 * ITrackZen - core bootstrap: config, data access, helpers.
 * (c) LibDex Ltd
 */
declare(strict_types=1);

define('ROOT', dirname(__DIR__));
define('DATA_DIR', ROOT . '/data');

if (is_file(__DIR__ . '/config.local.php')) {
    require __DIR__ . '/config.local.php';
}
$__defaults = [
    'SMTP_HOST' => '', 'SMTP_PORT' => 465, 'SMTP_SECURE' => 'ssl', // ssl | tls | none
    'SMTP_USER' => '', 'SMTP_PASS' => '',
    'MAIL_FROM' => '', 'ADMIN_SETUP_KEY' => '', 'APP_DEBUG' => false,
];
foreach ($__defaults as $k => $v) { if (!defined($k)) { define($k, $v); } }
unset($__defaults);

error_reporting(E_ALL);
ini_set('display_errors', APP_DEBUG ? '1' : '0');
date_default_timezone_set('UTC');
mb_internal_encoding('UTF-8');

/* ---------- JSON data store ---------- */
function data(string $name): array
{
    static $cache = [];
    if (!isset($cache[$name])) {
        $file = DATA_DIR . '/' . basename($name) . '.json';
        $json = is_file($file) ? file_get_contents($file) : '';
        $arr = $json !== '' ? json_decode($json, true) : null;
        $cache[$name] = is_array($arr) ? $arr : [];
    }
    return $cache[$name];
}

function data_save(string $name, array $value): bool
{
    $name = basename($name);
    $file = DATA_DIR . '/' . $name . '.json';
    if (is_file($file)) {
        if (!is_dir(DATA_DIR . '/backups')) { @mkdir(DATA_DIR . '/backups', 0755, true); }
        @copy($file, DATA_DIR . '/backups/' . $name . '-' . gmdate('Ymd-His') . '.json');
        // keep the 15 newest backups per file
        $old = glob(DATA_DIR . '/backups/' . $name . '-*.json') ?: [];
        rsort($old);
        foreach (array_slice($old, 15) as $f) { @unlink($f); }
    }
    $json = json_encode($value, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) { return false; }
    $tmp = $file . '.tmp';
    if (file_put_contents($tmp, $json, LOCK_EX) === false) { return false; }
    return rename($tmp, $file);
}

function site(?string $key = null, $default = '')
{
    $s = data('site');
    if ($key === null) { return $s; }
    $cur = $s;
    foreach (explode('.', $key) as $part) {
        if (!is_array($cur) || !array_key_exists($part, $cur)) { return $default; }
        $cur = $cur[$part];
    }
    return $cur;
}

/* ---------- Output helpers ---------- */
function e($v): string { return htmlspecialchars((string)$v, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }

function base_url(): string { return rtrim((string)site('url', 'https://itrackzen.net'), '/'); }

function abs_url(string $path = '/'): string
{
    if (preg_match('#^https?://#i', $path)) { return $path; }
    return base_url() . '/' . ltrim($path, '/');
}

function asset(string $path): string
{
    $file = ROOT . '/' . ltrim($path, '/');
    $v = is_file($file) ? substr((string)filemtime($file), -6) : '1';
    return '/' . ltrim($path, '/') . '?v=' . $v;
}

function wa_link(string $text = ''): string
{
    $num = preg_replace('/\D+/', '', (string)site('whatsapp'));
    if ($num === '') { return ''; }
    return 'https://wa.me/' . $num . ($text !== '' ? '?text=' . rawurlencode($text) : '');
}

function mailto(string $addr, string $subject = ''): string
{
    return 'mailto:' . $addr . ($subject !== '' ? '?subject=' . rawurlencode($subject) : '');
}

function page_meta(string $key): array
{
    $pages = data('pages');
    return $pages[$key] ?? ['title' => site('brand', 'ITrackZen'), 'description' => ''];
}

/* ---------- Sessions / CSRF (forms + admin) ---------- */
function secure_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) { return; }
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'secure' => $https, 'httponly' => true, 'samesite' => 'Strict']);
    session_name('itz_sid');
    session_start();
}

function csrf_token(): string
{
    secure_session();
    if (empty($_SESSION['csrf'])) { $_SESSION['csrf'] = bin2hex(random_bytes(24)); }
    return $_SESSION['csrf'];
}

function csrf_ok(?string $token): bool
{
    secure_session();
    return is_string($token) && !empty($_SESSION['csrf']) && hash_equals($_SESSION['csrf'], $token);
}

function client_ip(): string
{
    return preg_replace('/[^0-9a-fA-F:.,]/', '', (string)($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0')) ?: '0.0.0.0';
}

/* ---------- Tracker model string parser:  "FMB920 [moto,asset]" ---------- */
function parse_model(string $raw): array
{
    $tags = [];
    $name = trim($raw);
    if (preg_match('/^(.*?)\s*\[([^\]]*)\]\s*$/u', $raw, $m)) {
        $name = trim($m[1]);
        $tags = array_values(array_filter(array_map('trim', explode(',', strtolower($m[2])))));
    }
    return ['name' => $name, 'tags' => $tags];
}

function count_models(): int
{
    $n = 0;
    foreach (data('trackers')['brands'] ?? [] as $b) { $n += count($b['models'] ?? []); }
    return $n;
}

function all_service_items(): array
{
    $out = [];
    foreach (data('services')['categories'] ?? [] as $c) { foreach ($c['items'] ?? [] as $i) { $out[] = $i; } }
    return $out;
}

require_once __DIR__ . '/icons.php';
