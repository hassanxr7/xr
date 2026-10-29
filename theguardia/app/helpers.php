<?php
/**
 * The Guardia — shared helpers (database, settings, URLs, security, auth, i18n, HTTP).
 */
defined('APP') || exit;

// ---------------------------------------------------------------------------
// Config & database
// ---------------------------------------------------------------------------

function config(string $key, $default = null)
{
    $value = $GLOBALS['config'] ?? [];
    foreach (explode('.', $key) as $part) {
        if (!is_array($value) || !array_key_exists($part, $value)) {
            return $default;
        }
        $value = $value[$part];
    }
    return $value;
}

/** Open the SQLite database (shared by the app and the installer). */
function db_connect(string $path): PDO
{
    if ($path[0] !== '/') {
        $path = BASE_PATH . '/' . $path;
    }
    $pdo = new PDO('sqlite:' . $path, null, null, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ]);
    $pdo->exec('PRAGMA foreign_keys = ON');
    $pdo->exec('PRAGMA busy_timeout = 8000');
    $pdo->exec('PRAGMA journal_mode = WAL');
    $pdo->exec('PRAGMA synchronous = NORMAL');
    return $pdo;
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        $pdo = db_connect((string) config('db.path', 'app/storage/database.sqlite'));
    }
    return $pdo;
}

function q(string $sql, array $params = []): PDOStatement
{
    $st = db()->prepare($sql);
    $st->execute($params);
    return $st;
}

function row(string $sql, array $params = []): ?array
{
    $r = q($sql, $params)->fetch();
    return $r === false ? null : $r;
}

function rows(string $sql, array $params = []): array
{
    return q($sql, $params)->fetchAll();
}

function val(string $sql, array $params = [])
{
    $v = q($sql, $params)->fetchColumn();
    return $v === false ? null : $v;
}

/** Insert a row. Table/column names come from code only, never from user input. */
function insert(string $table, array $data, string $verb = 'INSERT'): int
{
    $cols = array_keys($data);
    $sql = sprintf(
        '%s INTO `%s` (`%s`) VALUES (%s)',
        $verb,
        $table,
        implode('`,`', $cols),
        implode(',', array_fill(0, count($cols), '?'))
    );
    q($sql, array_values($data));
    return (int) db()->lastInsertId();
}

/** Update rows. Table/column names come from code only, never from user input. */
function update(string $table, array $data, string $where, array $params = []): int
{
    $set = implode(',', array_map(fn ($c) => "`$c` = ?", array_keys($data)));
    return q("UPDATE `$table` SET $set WHERE $where", array_merge(array_values($data), $params))->rowCount();
}

/** "?, ?, ?" for an IN (...) list. */
function placeholders(array $items): string
{
    return implode(',', array_fill(0, max(1, count($items)), '?'));
}

/** Search value for "LIKE ? ESCAPE '!'". */
function like_param(string $search): string
{
    return '%' . str_replace(['!', '%', '_'], ['!!', '!%', '!_'], $search) . '%';
}

/** Neutralise spreadsheet formulas (=, +, -, @) in CSV cells. */
function csv_safe($v): string
{
    $v = (string) $v;
    return $v !== '' && strpos("=+-@\t\r", $v[0]) !== false ? "'" . $v : $v;
}

function now(): string
{
    return date('Y-m-d H:i:s');
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

function settings(bool $refresh = false): array
{
    static $cache = null;
    if ($cache === null || $refresh) {
        $cache = [];
        try {
            foreach (rows('SELECT `key`, `value` FROM settings') as $r) {
                $cache[$r['key']] = (string) $r['value'];
            }
        } catch (Throwable $e) {
            $cache = [];
        }
    }
    return $cache;
}

function setting(string $key, string $default = ''): string
{
    $s = settings();
    return isset($s[$key]) && $s[$key] !== '' ? $s[$key] : $default;
}

function save_setting(string $key, ?string $value): void
{
    q('REPLACE INTO settings (`key`, `value`) VALUES (?, ?)', [$key, (string) $value]);
    settings(true);
}

function site_name(): string
{
    return setting('site_name', 'The Guardia');
}

// ---------------------------------------------------------------------------
// URLs & request
// ---------------------------------------------------------------------------

function is_https(): bool
{
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['SERVER_PORT'] ?? '') == 443)
        || (strtolower($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
}

/** Path prefix of the app ("" in public_html, "/news" in a sub-folder). */
function base_url(): string
{
    static $base = null;
    if ($base !== null) {
        return $base;
    }
    $configured = (string) config('base_url', '');
    if ($configured !== '') {
        return $base = rtrim($configured, '/');
    }
    $docRoot = realpath($_SERVER['DOCUMENT_ROOT'] ?? '') ?: '';
    $root = realpath(BASE_PATH) ?: BASE_PATH;
    if ($docRoot !== '' && strpos($root, $docRoot) === 0) {
        $base = str_replace('\\', '/', substr($root, strlen($docRoot)));
    } else {
        $base = '';
    }
    return $base = rtrim($base, '/');
}

function url(string $path = ''): string
{
    return base_url() . '/' . ltrim($path, '/');
}

/** Absolute site origin, e.g. https://theguardia.ca (setting first, then the request host). */
function site_origin(): string
{
    $s = rtrim(setting('site_url'), '/');
    if ($s !== '') {
        $p = parse_url($s);
        return ($p['scheme'] ?? 'https') . '://' . ($p['host'] ?? '') . (isset($p['port']) ? ':' . $p['port'] : '');
    }
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    return (is_https() ? 'https' : 'http') . '://' . $host;
}

function abs_url(string $path = ''): string
{
    if (preg_match('~^https?://~i', $path)) {
        return $path;
    }
    return site_origin() . url($path);
}

function asset(string $path): string
{
    $file = BASE_PATH . '/assets/' . $path;
    $v = is_file($file) ? substr((string) filemtime($file), -6) : APP_VERSION;
    return url('assets/' . $path) . '?v=' . $v;
}

function redirect(string $to, int $code = 302): void
{
    if (!preg_match('~^https?://~i', $to) && ($to === '' || $to[0] !== '/')) {
        $to = url($to);
    }
    header('Location: ' . $to, true, $code);
    exit;
}

function is_post(): bool
{
    return ($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST';
}

function input(string $key, $default = '')
{
    $v = $_POST[$key] ?? $_GET[$key] ?? $default;
    return is_string($v) ? trim($v) : $v;
}

function client_ip(): string
{
    // Cloudflare / proxies in front of Hostinger
    foreach (['HTTP_CF_CONNECTING_IP', 'HTTP_X_REAL_IP'] as $h) {
        if (!empty($_SERVER[$h]) && filter_var($_SERVER[$h], FILTER_VALIDATE_IP)) {
            return $_SERVER[$h];
        }
    }
    if (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
        $first = trim(explode(',', $_SERVER['HTTP_X_FORWARDED_FOR'])[0]);
        if (filter_var($first, FILTER_VALIDATE_IP)) {
            return $first;
        }
    }
    return $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
}

function json_out($data, int $code = 200): void
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

/** Read a JSON request body (beacons, push subscriptions). */
function json_input(int $max = 65536): array
{
    $raw = file_get_contents('php://input', false, null, 0, $max);
    $data = json_decode((string) $raw, true);
    return is_array($data) ? $data : [];
}

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

function e($s): string
{
    return htmlspecialchars((string) $s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function slugify(string $s, int $max = 90): string
{
    $s = trim($s);
    if (function_exists('transliterator_transliterate')) {
        $t = transliterator_transliterate('Any-Latin; Latin-ASCII; Lower()', $s);
        if (is_string($t)) {
            $s = $t;
        }
    } else {
        $s = strtolower(iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $s) ?: $s);
    }
    $s = preg_replace('~[^a-z0-9]+~', '-', strtolower($s));
    $s = trim((string) $s, '-');
    if (strlen($s) > $max) {
        $s = rtrim(substr($s, 0, $max), '-');
        if (($p = strrpos($s, '-')) !== false && $p > $max * 0.6) {
            $s = substr($s, 0, $p);
        }
    }
    return $s;
}

function str_limit(string $s, int $len): string
{
    $s = trim(preg_replace('~\s+~u', ' ', $s));
    if (mb_strlen($s) <= $len) {
        return $s;
    }
    $cut = mb_substr($s, 0, $len - 1);
    if (($p = mb_strrpos($cut, ' ')) !== false && $p > $len * 0.6) {
        $cut = mb_substr($cut, 0, $p);
    }
    return rtrim($cut, " ,.;:-") . '…';
}

/** Plain text from HTML (for descriptions, counts and search). */
function plain_text(string $html): string
{
    $html = preg_replace('~<(script|style)[^>]*>.*?</\1>~is', ' ', $html);
    $html = preg_replace('~<(br|/p|/h[1-6]|/li|/blockquote|/div)[^>]*>~i', "$0 ", (string) $html);
    $t = html_entity_decode(strip_tags((string) $html), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    return trim(preg_replace('~\s+~u', ' ', $t));
}

function fmt_date(?string $dt, string $format = 'M j, Y'): string
{
    return $dt ? date($format, strtotime($dt)) : '';
}

function time_ago(?string $dt): string
{
    if (!$dt) {
        return '';
    }
    $diff = time() - strtotime($dt);
    if ($diff < 60) {
        return 'just now';
    }
    if ($diff < 3600) {
        $m = intdiv($diff, 60);
        return $m . ' min ago';
    }
    if ($diff < 86400) {
        $h = intdiv($diff, 3600);
        return $h . ($h === 1 ? ' hour ago' : ' hours ago');
    }
    if ($diff < 86400 * 7) {
        $d = intdiv($diff, 86400);
        return $d . ($d === 1 ? ' day ago' : ' days ago');
    }
    return fmt_date($dt);
}

function fmt_num($n): string
{
    return number_format((float) $n);
}

function money(int $cents, string $currency = 'CAD'): string
{
    return '$' . number_format($cents / 100, 2) . ' ' . strtoupper($currency);
}

/** ISO 3166 alpha-2 code → flag emoji. */
function flag(string $cc): string
{
    $cc = strtoupper($cc);
    if (!preg_match('~^[A-Z]{2}$~', $cc)) {
        return '🏳';
    }
    return mb_chr(0x1F1E6 + ord($cc[0]) - 65) . mb_chr(0x1F1E6 + ord($cc[1]) - 65);
}

function country_name(string $cc): string
{
    $cc = strtoupper($cc);
    if (!preg_match('~^[A-Z]{2}$~', $cc)) {
        return 'Unknown';
    }
    if (class_exists('Locale')) {
        $n = Locale::getDisplayRegion('-' . $cc, 'en');
        if ($n && $n !== $cc) {
            return $n;
        }
    }
    return $cc;
}

/** Page numbers for a pager: [1, '…', 4, 5, 6, '…', 20]. */
function pager_pages(int $page, int $pages): array
{
    $out = [];
    for ($i = 1; $i <= $pages; $i++) {
        if ($i === 1 || $i === $pages || abs($i - $page) <= 2) {
            $out[] = $i;
        } elseif (end($out) !== '…') {
            $out[] = '…';
        }
    }
    return $out;
}

// ---------------------------------------------------------------------------
// Security: CSRF, nonce, rate limits
// ---------------------------------------------------------------------------

function csrf_token(): string
{
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(16));
    }
    return $_SESSION['csrf'];
}

function csrf_field(): string
{
    return '<input type="hidden" name="csrf" value="' . e(csrf_token()) . '">';
}

function csrf_check(): void
{
    $sent = (string) ($_POST['csrf'] ?? $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
    if ($sent === '' || !hash_equals(csrf_token(), $sent)) {
        http_response_code(419);
        exit('Security token expired. Go back, refresh the page and try again.');
    }
}

/** Random URL-safe token. */
function token(int $bytes = 24): string
{
    return rtrim(strtr(base64_encode(random_bytes($bytes)), '+/', '-_'), '=');
}

function b64url_encode(string $s): string
{
    return rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
}

function b64url_decode(string $s): string
{
    return (string) base64_decode(strtr($s, '-_', '+/') . str_repeat('=', (4 - strlen($s) % 4) % 4));
}

/** Simple per-IP throttle backed by the rate_limits table. Returns false once $max is exceeded in $window seconds. */
function rate_limit(string $bucket, int $max, int $window): bool
{
    $key = $bucket . ':' . hash('sha256', client_ip());
    $since = time() - $window;
    q('DELETE FROM rate_limits WHERE ts < ?', [time() - 86400]);
    $n = (int) val('SELECT COUNT(*) FROM rate_limits WHERE k = ? AND ts >= ?', [$key, $since]);
    if ($n >= $max) {
        return false;
    }
    insert('rate_limits', ['k' => $key, 'ts' => time()]);
    return true;
}

// ---------------------------------------------------------------------------
// Admin users & roles
// ---------------------------------------------------------------------------

const ROLES = ['writer' => 1, 'editor' => 2, 'admin' => 3];

function user(): ?array
{
    static $u = false;
    if ($u === false) {
        $u = empty($_SESSION['uid']) ? null : row('SELECT * FROM users WHERE id = ? AND status = ?', [(int) $_SESSION['uid'], 'active']);
    }
    return $u;
}

function can(string $role): bool
{
    $u = user();
    return $u && (ROLES[$u['role']] ?? 0) >= (ROLES[$role] ?? 99);
}

function require_role(string $role = 'writer'): array
{
    $u = user();
    if (!$u) {
        redirect('admin/login.php?next=' . rawurlencode($_SERVER['REQUEST_URI'] ?? ''));
    }
    if (!can($role)) {
        http_response_code(403);
        exit(__('You do not have permission to open this page.'));
    }
    return $u;
}

function flash(string $type, string $msg): void
{
    $_SESSION['flash'][] = [$type, $msg];
}

function flashes(): array
{
    $f = $_SESSION['flash'] ?? [];
    unset($_SESSION['flash']);
    return $f;
}

function audit(string $action, string $detail = ''): void
{
    try {
        insert('audit_log', ['user_id' => user()['id'] ?? null, 'action' => $action, 'detail' => mb_substr($detail, 0, 500), 'ip' => client_ip(), 'created_at' => now()]);
    } catch (Throwable $e) {
    }
}

// ---------------------------------------------------------------------------
// Admin language (English / Somali)
// ---------------------------------------------------------------------------

function admin_lang(): string
{
    $l = $_SESSION['admin_lang'] ?? setting('admin_lang', 'en');
    return in_array($l, ['en', 'so'], true) ? $l : 'en';
}

/** Translate an admin UI string. Keys are the English text; missing keys fall back to English. */
function __(string $s, array $vars = []): string
{
    static $so = null;
    if (admin_lang() === 'so') {
        if ($so === null) {
            $so = require APP_PATH . '/lang/so.php';
        }
        $s = $so[$s] ?? $s;
    }
    foreach ($vars as $k => $v) {
        $s = str_replace('{' . $k . '}', (string) $v, $s);
    }
    return $s;
}

// ---------------------------------------------------------------------------
// HTTP client & mail
// ---------------------------------------------------------------------------

/**
 * Minimal cURL wrapper. Returns ['status' => int, 'body' => string, 'error' => string, 'headers' => array].
 */
function http_request(string $method, string $url, array $headers = [], ?string $body = null, int $timeout = 30): array
{
    $ch = curl_init($url);
    $respHeaders = [];
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST  => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS      => 4,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT        => $timeout,
        CURLOPT_HTTPHEADER     => $headers,
        CURLOPT_USERAGENT      => 'TheGuardia/' . APP_VERSION . ' (+' . site_origin() . ')',
        CURLOPT_ENCODING       => '',
        CURLOPT_HEADERFUNCTION => function ($ch, $line) use (&$respHeaders) {
            $p = strpos($line, ':');
            if ($p !== false) {
                $respHeaders[strtolower(trim(substr($line, 0, $p)))] = trim(substr($line, $p + 1));
            }
            return strlen($line);
        },
    ]);
    if ($body !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    }
    $resp = curl_exec($ch);
    $out = [
        'status'  => (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE),
        'body'    => $resp === false ? '' : (string) $resp,
        'error'   => $resp === false ? curl_error($ch) : '',
        'headers' => $respHeaders,
    ];
    curl_close($ch);
    return $out;
}

/** Send a plain-text email with PHP mail() (works on Hostinger once the domain mailbox exists). */
function send_mail(string $to, string $subject, string $text): bool
{
    $from = setting('mail_from', 'no-reply@' . (parse_url(site_origin(), PHP_URL_HOST) ?: 'localhost'));
    $headers = [
        'From: ' . mb_encode_mimeheader(site_name()) . ' <' . $from . '>',
        'Reply-To: ' . setting('contact_email', $from),
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
    ];
    return @mail($to, mb_encode_mimeheader($subject), $text, implode("\r\n", $headers));
}

function log_error(string $msg): void
{
    error_log('[Guardia] ' . $msg);
}
