<?php
/**
 * ITrackZen - core bootstrap: config, data access, helpers.
 * (c) LibDex Ltd
 */
declare(strict_types=1);

define('ROOT', dirname(__DIR__));
define('SITE_VERSION', '2.0.0');
define('DATA_DIR', ROOT . '/data');

if (is_file(__DIR__ . '/config.local.php')) {
    require __DIR__ . '/config.local.php';
}
$__defaults = [
    'SMTP_HOST' => '', 'SMTP_PORT' => 465, 'SMTP_SECURE' => 'ssl', // ssl | tls | none
    'SMTP_USER' => '', 'SMTP_PASS' => '',
    'MAIL_FROM' => '', 'ADMIN_SETUP_KEY' => '', 'APP_DEBUG' => false,
    'DB_DSN' => '', 'DB_USER' => '', 'DB_PASS' => '',
    'DELETION_WEBHOOK_URL' => '', 'DELETION_WEBHOOK_SECRET' => '',
];
foreach ($__defaults as $k => $v) { if (!defined($k)) { define($k, $v); } }
unset($__defaults);

error_reporting(E_ALL);
ini_set('display_errors', APP_DEBUG ? '1' : '0');
date_default_timezone_set('UTC');
mb_internal_encoding('UTF-8');

/* ---------- Content store (database, with JSON files in /data as first-run defaults) ---------- */
function data(string $name): array
{
    static $cache = [];
    if (!isset($cache[$name])) {
        $name = basename($name); $arr = null;
        try {
            $body = db_val('SELECT body FROM content WHERE name=?', [$name]);
            if ($body !== false && $body !== null) { $arr = json_decode((string)$body, true); }
        } catch (Throwable $e) { error_log('[ITrackZen] content db: ' . $e->getMessage()); }
        if (!is_array($arr)) {
            $file = DATA_DIR . '/' . $name . '.json';
            $json = is_file($file) ? file_get_contents($file) : '';
            $arr = $json !== '' ? json_decode($json, true) : null;
        }
        $cache[$name] = is_array($arr) ? $arr : [];
    }
    return $cache[$name];
}

function data_default(string $name): array
{
    $file = DATA_DIR . '/' . basename($name) . '.json';
    $arr = is_file($file) ? json_decode((string)file_get_contents($file), true) : null;
    return is_array($arr) ? $arr : [];
}

function data_save(string $name, array $value, string $by = 'admin'): bool
{
    $name = basename($name);
    $json = json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) { return false; }
    $pdo = db();
    try {
        $pdo->beginTransaction();
        $cur = db_val('SELECT body FROM content WHERE name=?', [$name]);
        if ($cur === false || $cur === null) { $cur = json_encode(data_default($name), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); }
        db_insert('content_versions', ['name' => $name, 'body' => $cur, 'saved_at' => now_utc(), 'saved_by' => $by]);
        db_run('DELETE FROM content WHERE name=?', [$name]);
        db_insert_named('content', ['name' => $name, 'body' => $json, 'updated_at' => now_utc(), 'updated_by' => $by]);
        // keep the 25 newest versions per document
        $ids = db_all('SELECT id FROM content_versions WHERE name=? ORDER BY id DESC', [$name]);
        foreach (array_slice($ids, 25) as $r) { db_run('DELETE FROM content_versions WHERE id=?', [$r['id']]); }
        $pdo->commit();
        return true;
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) { $pdo->rollBack(); }
        error_log('[ITrackZen] data_save: ' . $e->getMessage());
        return false;
    }
}

/** Insert into a table whose primary key is not auto-increment. */
function db_insert_named(string $table, array $row): void
{
    $cols = array_keys($row);
    db_run("INSERT INTO $table (" . implode(',', $cols) . ') VALUES (' . implode(',', array_fill(0, count($cols), '?')) . ')', array_values($row));
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

/** URL of the separate ITrackZen tracking platform (itrackzen.com): login | demo | register | base */
function platform_url(string $key = 'base'): string
{
    $p = (array)site('platform', []);
    $map = ['base' => 'base_url', 'login' => 'login_url', 'demo' => 'demo_url', 'register' => 'register_url'];
    return trim((string)($p[$map[$key] ?? 'base_url'] ?? ''));
}

/** Brand asset URL (admin-uploaded logo or built-in default), versioned so browsers/CDNs never serve a stale logo. */
function brand_asset(string $slot): string
{
    $b = '/assets/img/brand/';
    $defaults = ['logo' => $b . 'itrackzen-logo.svg', 'logo_light' => $b . 'itrackzen-logo-white.svg', 'icon' => $b . 'itrackzen-app-icon.svg', 'favicon32' => $b . 'itrackzen-favicon-32.png',
                 'apple' => $b . 'itrackzen-apple-touch-icon.png', 'icon192' => $b . 'itrackzen-icon-192.png', 'icon512' => $b . 'itrackzen-icon-512.png', 'favicon' => $b . 'itrackzen-favicon.svg', 'og' => $b . 'itrackzen-og.png'];
    $custom = (string)(site('brand_assets', [])[$slot] ?? '');
    $path = $custom !== '' ? $custom : ($defaults[$slot] ?? '');
    $file = ROOT . '/' . ltrim($path, '/');
    return $path . (is_file($file) ? '?v=' . filemtime($file) : '');
}

/** Real photographs (CC BY 2.0, credited on /image-credits). Slug -> manifest in data/photos.json */
function photo_meta(string $slug): ?array { return data('photos')['items'][$slug] ?? null; }

function photo_url(string $slug, string $size = 'lg'): string
{
    $m = photo_meta($slug); if (!$m) { return ''; }
    $f = '/assets/img/photos/' . $m['file'] . '-' . ($size === 'sm' ? 'sm' : 'lg') . '.webp';
    $abs = ROOT . $f;
    return $f . (is_file($abs) ? '?v=' . filemtime($abs) : '');
}

function photo(string $slug, string $class = '', string $sizes = '(max-width: 700px) 100vw, 600px', bool $eager = false): string
{
    $m = photo_meta($slug); if (!$m) { return ''; }
    $w = min((int)$m['w'], 1024); $h = (int)round($m['h'] * $w / max(1, $m['w']));
    return '<img' . ($class ? ' class="' . e($class) . '"' : '') . ' src="' . e(photo_url($slug, 'lg')) . '" srcset="' . e(photo_url($slug, 'sm')) . ' 640w, ' . e(photo_url($slug, 'lg')) . ' ' . $w . 'w" sizes="' . e($sizes) . '" alt="' . e($m['alt']) . '" width="' . $w . '" height="' . $h . '" decoding="async"' . ($eager ? ' fetchpriority="high"' : ' loading="lazy"') . '>';
}

/** Photo for a CMS item: custom uploaded image first, then a photo slug, else ''. */
function item_photo(array $it, string $class = '', string $sizes = '(max-width: 700px) 100vw, 400px'): string
{
    if (!empty($it['image'])) { return cms_img($it['image'], $it['image_alt'] ?? '', $class, 800, 600); }
    return !empty($it['photo']) ? photo($it['photo'], $class, $sizes) : '';
}

/** Responsive, lazy image from a CMS image path. Returns '' when no image is set. */
function cms_img(?string $path, string $alt, string $class = '', int $w = 800, int $h = 450, bool $eager = false): string
{
    $path = trim((string)$path);
    if ($path === '' || !preg_match('#^(/|https://)#', $path)) { return ''; }
    return '<img' . ($class ? ' class="' . e($class) . '"' : '') . ' src="' . e($path) . '" alt="' . e($alt) . '" width="' . $w . '" height="' . $h . '" decoding="async"' . ($eager ? ' fetchpriority="high"' : ' loading="lazy"') . '>';
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

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/icons.php';
