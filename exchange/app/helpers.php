<?php
/**
 * Hufan Exchange — shared helpers (database, auth, i18n, money, orders, UI).
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

/** Database driver in use: "sqlite" (automatic, default) or "mysql". */
function db_driver(): string
{
    return config('db.driver', 'mysql') === 'sqlite' ? 'sqlite' : 'mysql';
}

/** Open a PDO connection for the given db config (shared by the app and the installer). */
function db_connect(array $c): PDO
{
    $options = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ];
    if (($c['driver'] ?? 'mysql') === 'sqlite') {
        $path = $c['path'] ?? 'app/storage/database.sqlite';
        if ($path[0] !== '/') {
            $path = BASE_PATH . '/' . $path;
        }
        $pdo = new PDO('sqlite:' . $path, null, null, $options);
        $pdo->exec('PRAGMA foreign_keys = ON');
        $pdo->exec('PRAGMA busy_timeout = 5000');
        $pdo->exec('PRAGMA journal_mode = WAL');
        return $pdo;
    }
    $dsn = sprintf('mysql:host=%s;dbname=%s;charset=utf8mb4', $c['host'] ?? 'localhost', $c['name'] ?? '');
    if (!empty($c['port'])) {
        $dsn .= ';port=' . (int) $c['port'];
    }
    return new PDO($dsn, $c['user'] ?? '', $c['pass'] ?? '', $options);
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        $pdo = db_connect(config('db', []));
    }
    return $pdo;
}

/** Search value for "LIKE ? ESCAPE '!'" (works on MySQL and SQLite). */
function like_param(string $search): string
{
    return '%' . str_replace(['!', '%', '_'], ['!!', '!%', '!_'], $search) . '%';
}

/** Number without trailing zeros, for form inputs (e.g. 2.500 → 2.5, 10 → 10). */
function trim_num($n): string
{
    $s = number_format((float) $n, 8, '.', '');
    return rtrim(rtrim($s, '0'), '.') ?: '0';
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
function insert(string $table, array $data): int
{
    $cols = array_keys($data);
    $sql = sprintf(
        'INSERT INTO `%s` (`%s`) VALUES (%s)',
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
    q('REPLACE INTO settings (`key`, `value`) VALUES (?, ?)', [$key, $value]);
}

function brand_color(): string
{
    $c = setting('brand_color', '#0e7c66');
    return preg_match('/^#[0-9a-fA-F]{6}$/', $c) ? $c : '#0e7c66';
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

/** Path prefix of the app (e.g. "" when installed in public_html, "/exchange" in a sub-folder). */
function base_url(): string
{
    static $base = null;
    if ($base !== null) {
        return $base;
    }
    $configured = (string) config('base_url', '');
    if ($configured !== '') {
        $path = parse_url($configured, PHP_URL_PATH) ?: '';
        return $base = rtrim($path, '/');
    }
    $base = '';
    $script = realpath($_SERVER['SCRIPT_FILENAME'] ?? '') ?: '';
    $root   = realpath(BASE_PATH) ?: BASE_PATH;
    $name   = $_SERVER['SCRIPT_NAME'] ?? '';
    if ($script !== '' && strpos($script, $root) === 0) {
        $rel = str_replace('\\', '/', substr($script, strlen($root)));
        if ($rel !== '' && substr($name, -strlen($rel)) === $rel) {
            $base = rtrim(substr($name, 0, -strlen($rel)), '/');
        }
    }
    return $base;
}

function url(string $path = ''): string
{
    return base_url() . '/' . ltrim($path, '/');
}

function full_url(string $path = ''): string
{
    $configured = (string) config('base_url', '');
    if ($configured !== '') {
        return rtrim($configured, '/') . '/' . ltrim($path, '/');
    }
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    return (is_https() ? 'https' : 'http') . '://' . $host . url($path);
}

function asset(string $path): string
{
    $file = BASE_PATH . '/assets/' . ltrim($path, '/');
    $v = is_file($file) ? filemtime($file) : APP_VERSION;
    return url('assets/' . ltrim($path, '/')) . '?v=' . $v;
}

function redirect(string $path): void
{
    $target = preg_match('#^https?://#', $path) || str_starts_with($path, '/') ? $path : url($path);
    header('Location: ' . $target);
    exit;
}

/** Only allow redirects back inside this site. */
function safe_next(?string $next, string $fallback): string
{
    $next = (string) $next;
    if ($next !== '' && str_starts_with($next, '/') && !str_starts_with($next, '//') && !str_contains($next, '\\')) {
        return $next;
    }
    return url($fallback);
}

function is_post(): bool
{
    return ($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST';
}

function input(string $key, string $default = ''): string
{
    $v = $_POST[$key] ?? $default;
    return is_string($v) ? trim($v) : $default;
}

function qs(string $key, string $default = ''): string
{
    $v = $_GET[$key] ?? $default;
    return is_string($v) ? trim($v) : $default;
}

/** Current query string with some values replaced (used for filters & pagination). */
function query_with(array $override): string
{
    $params = array_merge($_GET, $override);
    $params = array_filter($params, fn ($v) => $v !== null && $v !== '');
    return $params ? '?' . http_build_query($params) : '?';
}

function client_ip(): string
{
    return substr((string) ($_SERVER['REMOTE_ADDR'] ?? ''), 0, 45);
}

function valid_date(string $d): bool
{
    $dt = DateTime::createFromFormat('Y-m-d', $d);
    return $dt && $dt->format('Y-m-d') === $d;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function e($v): string
{
    return htmlspecialchars((string) $v, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function fmt_date(?string $dt, bool $time = true): string
{
    if (!$dt) {
        return '—';
    }
    $ts = strtotime($dt);
    return $ts ? date($time ? 'd/m/Y H:i' : 'd/m/Y', $ts) : '—';
}

// ---------------------------------------------------------------------------
// CSRF & flash messages
// ---------------------------------------------------------------------------

function csrf_token(): string
{
    if (empty($_SESSION['_csrf'])) {
        $_SESSION['_csrf'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['_csrf'];
}

function csrf_field(): string
{
    return '<input type="hidden" name="_csrf" value="' . e(csrf_token()) . '">';
}

function csrf_check(): void
{
    $token = $_POST['_csrf'] ?? '';
    if (!is_string($token) || !hash_equals(csrf_token(), $token)) {
        http_response_code(419);
        flash('error', t('csrf_error'));
        redirect($_SERVER['REQUEST_URI'] ?? url(''));
    }
}

function flash(string $type, string $message): void
{
    $_SESSION['_flash'][] = ['type' => $type, 'message' => $message];
}

function flashes(): array
{
    $f = $_SESSION['_flash'] ?? [];
    unset($_SESSION['_flash']);
    return $f;
}

function render_flashes(): string
{
    $html = '';
    foreach (flashes() as $f) {
        $type = in_array($f['type'], ['success', 'error', 'info', 'warning'], true) ? $f['type'] : 'info';
        $html .= '<div class="alert alert-' . $type . '">' . icon($type === 'success' ? 'check-circle' : ($type === 'error' ? 'alert' : 'info')) . '<span>' . e($f['message']) . '</span></div>';
    }
    return $html;
}

// ---------------------------------------------------------------------------
// i18n
// ---------------------------------------------------------------------------

function lang(): string
{
    $l = $_SESSION['lang'] ?? setting('default_lang', 'en');
    return in_array($l, ['en', 'so'], true) ? $l : 'en';
}

function t(string $key, array $replace = []): string
{
    static $strings = [];
    $l = lang();
    if (!isset($strings[$l])) {
        $strings[$l] = require APP_PATH . '/lang/' . $l . '.php';
    }
    $text = $strings[$l][$key] ?? $key;
    foreach ($replace as $k => $v) {
        $text = str_replace(':' . $k, (string) $v, $text);
    }
    return $text;
}

// ---------------------------------------------------------------------------
// Authentication (customers & admins)
// ---------------------------------------------------------------------------

function user(): ?array
{
    static $cache = [];
    $id = (int) ($_SESSION['uid'] ?? 0);
    if (!$id) {
        return null;
    }
    if (!array_key_exists($id, $cache)) {
        $cache[$id] = row('SELECT * FROM users WHERE id = ?', [$id]);
    }
    return $cache[$id];
}

function require_user(): array
{
    $u = user();
    if (!$u) {
        flash('info', t('login_required'));
        redirect('login.php?next=' . urlencode($_SERVER['REQUEST_URI'] ?? ''));
    }
    return $u;
}

function login_user(array $u): void
{
    session_regenerate_id(true);
    $_SESSION['uid'] = (int) $u['id'];
    update('users', ['last_login_at' => now()], 'id = ?', [$u['id']]);
}

function admin(): ?array
{
    static $cache = null;
    $id = (int) ($_SESSION['admin_id'] ?? 0);
    if (!$id) {
        return null;
    }
    if ($cache === null || (int) $cache['id'] !== $id) {
        $cache = row('SELECT * FROM admins WHERE id = ? AND is_active = 1', [$id]);
    }
    return $cache;
}

function require_admin(): array
{
    $a = admin();
    if (!$a) {
        unset($_SESSION['admin_id']);
        redirect('admin/login.php?next=' . urlencode($_SERVER['REQUEST_URI'] ?? ''));
    }
    return $a;
}

function login_admin(array $a): void
{
    session_regenerate_id(true);
    $_SESSION['admin_id'] = (int) $a['id'];
    update('admins', ['last_login_at' => now()], 'id = ?', [$a['id']]);
}

/** Login throttling: max $max failed attempts per $minutes for the same scope+identifier+IP. */
function throttle_key(string $ident): string
{
    return hash('sha256', strtolower($ident) . '|' . client_ip());
}

function throttle_blocked(string $scope, string $ident, int $max = 5, int $minutes = 15): bool
{
    $since = date('Y-m-d H:i:s', time() - $minutes * 60);
    $n = (int) val('SELECT COUNT(*) FROM login_attempts WHERE scope = ? AND ident = ? AND created_at > ?', [$scope, throttle_key($ident), $since]);
    return $n >= $max;
}

function throttle_hit(string $scope, string $ident): void
{
    insert('login_attempts', ['scope' => $scope, 'ident' => throttle_key($ident), 'created_at' => now()]);
    if (random_int(1, 50) === 1) {
        q('DELETE FROM login_attempts WHERE created_at < ?', [date('Y-m-d H:i:s', time() - 86400)]);
    }
}

function throttle_clear(string $scope, string $ident): void
{
    q('DELETE FROM login_attempts WHERE scope = ? AND ident = ?', [$scope, throttle_key($ident)]);
}

function normalize_phone(string $phone): string
{
    $phone = preg_replace('/[^0-9+]/', '', $phone);
    return (string) $phone;
}

// ---------------------------------------------------------------------------
// Money & exchange calculations
// ---------------------------------------------------------------------------

function fmt_amount($n, int $dec = 2): string
{
    return number_format((float) $n, $dec, '.', ',');
}

function money($n, string $currency, int $dec = 2): string
{
    return fmt_amount($n, $dec) . ' ' . $currency;
}

function floor_dec(float $n, int $dec): float
{
    $m = 10 ** $dec;
    return floor($n * $m + 1e-7) / $m;
}

function ceil_dec(float $n, int $dec): float
{
    $m = 10 ** $dec;
    return ceil($n * $m - 1e-7) / $m;
}

/**
 * Compute a quote for a pair from the amount the customer sends.
 * fee = send × fee% + fixed fee (in the "from" currency); receive = (send − fee) × rate.
 * The JavaScript calculator (assets/js/app.js) mirrors this exactly.
 */
function quote(array $pair, float $send): array
{
    $fd = (int) $pair['from_decimals'];
    $td = (int) $pair['to_decimals'];
    $send = round($send, $fd);
    $fee = round($send * (float) $pair['fee_percent'] / 100 + (float) $pair['fee_fixed'], $fd);
    $net = max(0, $send - $fee);
    $receive = floor_dec($net * (float) $pair['rate'], $td);
    return ['send' => $send, 'fee' => $fee, 'net' => $net, 'receive' => $receive];
}

const PAIR_SELECT = 'SELECT p.*,
        f.name AS from_name, f.code AS from_code, f.currency AS from_currency, f.decimals AS from_decimals, f.color AS from_color, f.logo AS from_logo,
        f.account_label AS from_account_label, f.account_placeholder AS from_account_placeholder, f.account_pattern AS from_account_pattern,
        f.pay_to AS from_pay_to, f.pay_to_name AS from_pay_to_name, f.ussd_template AS from_ussd, f.instructions AS from_instructions, f.reserve AS from_reserve,
        t.name AS to_name, t.code AS to_code, t.currency AS to_currency, t.decimals AS to_decimals, t.color AS to_color, t.logo AS to_logo,
        t.account_label AS to_account_label, t.account_placeholder AS to_account_placeholder, t.account_pattern AS to_account_pattern,
        t.instructions AS to_instructions, t.reserve AS to_reserve
    FROM pairs p
    JOIN gateways f ON f.id = p.from_gateway_id
    JOIN gateways t ON t.id = p.to_gateway_id';

function active_pairs(): array
{
    return rows(PAIR_SELECT . ' WHERE p.is_active = 1 AND f.is_active = 1 AND t.is_active = 1 ORDER BY p.sort_order, p.id');
}

function find_pair(int $id, bool $activeOnly = true): ?array
{
    $sql = PAIR_SELECT . ' WHERE p.id = ?';
    if ($activeOnly) {
        $sql .= ' AND p.is_active = 1 AND f.is_active = 1 AND t.is_active = 1';
    }
    return row($sql, [$id]);
}

/** Data handed to the JavaScript calculator. */
function pairs_for_js(array $pairs): array
{
    $out = [];
    foreach ($pairs as $p) {
        $out[] = [
            'id'      => (int) $p['id'],
            'from'    => ['id' => (int) $p['from_gateway_id'], 'name' => $p['from_name'], 'currency' => $p['from_currency'], 'decimals' => (int) $p['from_decimals'], 'color' => $p['from_color'], 'logo' => $p['from_logo'] ? url($p['from_logo']) : null],
            'to'      => ['id' => (int) $p['to_gateway_id'], 'name' => $p['to_name'], 'currency' => $p['to_currency'], 'decimals' => (int) $p['to_decimals'], 'color' => $p['to_color'], 'logo' => $p['to_logo'] ? url($p['to_logo']) : null],
            'rate'    => (float) $p['rate'],
            'feePct'  => (float) $p['fee_percent'],
            'feeFix'  => (float) $p['fee_fixed'],
            'min'     => (float) $p['min_amount'],
            'max'     => (float) $p['max_amount'],
            'reserve' => (float) $p['to_reserve'],
        ];
    }
    return $out;
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

function statuses(): array
{
    return [
        'awaiting_payment' => t('st_awaiting_payment'),
        'pending'          => t('st_pending'),
        'processing'       => t('st_processing'),
        'completed'        => t('st_completed'),
        'cancelled'        => t('st_cancelled'),
        'rejected'         => t('st_rejected'),
        'expired'          => t('st_expired'),
    ];
}

function status_badge(string $status): string
{
    $label = statuses()[$status] ?? $status;
    return '<span class="badge badge-' . e($status) . '">' . e($label) . '</span>';
}

function generate_order_no(): string
{
    $prefix = preg_replace('/[^A-Z0-9]/', '', strtoupper(setting('order_prefix', 'HX'))) ?: 'HX';
    $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    do {
        $rand = '';
        for ($i = 0; $i < 5; $i++) {
            $rand .= $alphabet[random_int(0, strlen($alphabet) - 1)];
        }
        $no = $prefix . date('ymd') . $rand;
    } while (val('SELECT 1 FROM orders WHERE order_no = ?', [$no]));
    return $no;
}

function order_log(int $orderId, string $status, ?string $note, string $actor, ?int $actorId = null): void
{
    insert('order_logs', [
        'order_id'   => $orderId,
        'status'     => $status,
        'note'       => $note !== null && $note !== '' ? mb_substr($note, 0, 500) : null,
        'actor'      => $actor,
        'actor_id'   => $actorId,
        'created_at' => now(),
    ]);
}

/** Orders that were never paid are expired after the configured number of minutes. */
function expire_orders(): void
{
    $minutes = max(5, (int) setting('order_expiry_minutes', '60'));
    $cutoff = date('Y-m-d H:i:s', time() - $minutes * 60);
    $ids = q('SELECT id FROM orders WHERE status = ? AND created_at < ?', ['awaiting_payment', $cutoff])->fetchAll(PDO::FETCH_COLUMN);
    foreach ($ids as $id) {
        if (update('orders', ['status' => 'expired', 'updated_at' => now()], 'id = ? AND status = ?', [$id, 'awaiting_payment'])) {
            order_log((int) $id, 'expired', null, 'system');
        }
    }
}

function order_expires_at(array $order): int
{
    return strtotime($order['created_at']) + max(5, (int) setting('order_expiry_minutes', '60')) * 60;
}

/**
 * Change an order's status. Reserves move when an order enters or leaves "completed":
 * the gateway the customer paid into goes up, the gateway we paid out from goes down.
 */
function set_order_status(array $order, string $status, ?string $note, string $actor, ?int $actorId = null, array $extra = []): void
{
    if (!array_key_exists($status, statuses())) {
        throw new InvalidArgumentException('Unknown status');
    }
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $current = row('SELECT * FROM orders WHERE id = ?' . (db_driver() === 'mysql' ? ' FOR UPDATE' : ''), [$order['id']]);
        $data = array_merge($extra, ['status' => $status, 'updated_at' => now()]);
        $wasDone = $current['status'] === 'completed';
        $isDone = $status === 'completed';

        if ($isDone && !$wasDone) {
            $data['completed_at'] = now();
            if ($current['from_gateway_id']) {
                q('UPDATE gateways SET reserve = reserve + ? WHERE id = ?', [$current['send_amount'], $current['from_gateway_id']]);
            }
            if ($current['to_gateway_id']) {
                q('UPDATE gateways SET reserve = CASE WHEN reserve < ? THEN 0 ELSE reserve - ? END WHERE id = ?', [$current['receive_amount'], $current['receive_amount'], $current['to_gateway_id']]);
            }
        } elseif ($wasDone && !$isDone) {
            $data['completed_at'] = null;
            if ($current['from_gateway_id']) {
                q('UPDATE gateways SET reserve = CASE WHEN reserve < ? THEN 0 ELSE reserve - ? END WHERE id = ?', [$current['send_amount'], $current['send_amount'], $current['from_gateway_id']]);
            }
            if ($current['to_gateway_id']) {
                q('UPDATE gateways SET reserve = reserve + ? WHERE id = ?', [$current['receive_amount'], $current['to_gateway_id']]);
            }
        }
        if ($status === 'pending' && empty($current['paid_at'])) {
            $data['paid_at'] = now();
        }
        update('orders', $data, 'id = ?', [$current['id']]);
        if ($status !== $current['status'] || ($note !== null && $note !== '')) {
            order_log((int) $current['id'], $status, $note, $actor, $actorId);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
}

/** Check a value against an admin-defined regex; an invalid regex is ignored. */
function matches_pattern(?string $pattern, string $value): bool
{
    if (!$pattern) {
        return true;
    }
    return @preg_match('~' . str_replace('~', '\~', $pattern) . '~u', $value) !== 0;
}

function order_progress_steps(): array
{
    return ['awaiting_payment', 'pending', 'processing', 'completed'];
}

// ---------------------------------------------------------------------------
// Uploads
// ---------------------------------------------------------------------------

/**
 * Validate and store an uploaded image (JPG/PNG/WEBP). Returns the stored file name.
 * Throws RuntimeException with a translated message on failure.
 */
function store_image(array $file, string $dir, int $maxBytes = 3145728): string
{
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        throw new RuntimeException(t('upload_failed'));
    }
    if ($file['size'] > $maxBytes) {
        throw new RuntimeException(t('upload_too_big', ['size' => round($maxBytes / 1048576, 1) . 'MB']));
    }
    $info = @getimagesize($file['tmp_name']);
    $types = [IMAGETYPE_JPEG => 'jpg', IMAGETYPE_PNG => 'png', IMAGETYPE_WEBP => 'webp'];
    if (!$info || !isset($types[$info[2]])) {
        throw new RuntimeException(t('upload_bad_type'));
    }
    if (!is_dir($dir) && !mkdir($dir, 0755, true)) {
        throw new RuntimeException(t('upload_failed'));
    }
    $name = bin2hex(random_bytes(16)) . '.' . $types[$info[2]];
    if (!move_uploaded_file($file['tmp_name'], $dir . '/' . $name)) {
        throw new RuntimeException(t('upload_failed'));
    }
    return $name;
}

function has_upload(string $field): bool
{
    return isset($_FILES[$field]) && is_array($_FILES[$field]) && ($_FILES[$field]['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE;
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

function telegram_notify(string $text): void
{
    $token = setting('telegram_bot_token');
    $chat = setting('telegram_chat_id');
    if ($token === '' || $chat === '' || !function_exists('curl_init')) {
        return;
    }
    $ch = curl_init('https://api.telegram.org/bot' . $token . '/sendMessage');
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => http_build_query(['chat_id' => $chat, 'text' => $text, 'parse_mode' => 'HTML', 'disable_web_page_preview' => 1]),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 3,
        CURLOPT_TIMEOUT        => 5,
    ]);
    curl_exec($ch);
    curl_close($ch);
}

function order_telegram_text(array $o, string $headline): string
{
    $h = fn ($v) => htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8');
    return "<b>{$h($headline)}</b>\n"
        . "#{$h($o['order_no'])}\n"
        . "{$h($o['from_name'])} → {$h($o['to_name'])}\n"
        . 'Send: ' . $h(money($o['send_amount'], $o['from_currency'], (int) $o['from_decimals'])) . "\n"
        . 'Receive: ' . $h(money($o['receive_amount'], $o['to_currency'], (int) $o['to_decimals'])) . "\n"
        . 'From: ' . $h($o['sender_account']) . "\n"
        . 'To: ' . $h($o['receiver_account']) . "\n"
        . ($o['payment_ref'] ? 'Txn: ' . $h($o['payment_ref']) . "\n" : '')
        . full_url('admin/order.php?id=' . $o['id']);
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

function paginate(int $total, int $perPage = 20): array
{
    $pages = max(1, (int) ceil($total / $perPage));
    $page = min($pages, max(1, (int) ($_GET['page'] ?? 1)));
    return ['total' => $total, 'per' => $perPage, 'page' => $page, 'pages' => $pages, 'offset' => ($page - 1) * $perPage];
}

function pagination_links(array $p): string
{
    if ($p['pages'] <= 1) {
        return '';
    }
    $html = '<nav class="pagination">';
    $start = max(1, $p['page'] - 2);
    $end = min($p['pages'], $p['page'] + 2);
    if ($p['page'] > 1) {
        $html .= '<a href="' . e(query_with(['page' => $p['page'] - 1])) . '">&lsaquo;</a>';
    }
    for ($i = $start; $i <= $end; $i++) {
        $html .= $i === $p['page']
            ? '<span class="current">' . $i . '</span>'
            : '<a href="' . e(query_with(['page' => $i])) . '">' . $i . '</a>';
    }
    if ($p['page'] < $p['pages']) {
        $html .= '<a href="' . e(query_with(['page' => $p['page'] + 1])) . '">&rsaquo;</a>';
    }
    return $html . '</nav>';
}

function initials(string $name): string
{
    $name = preg_replace('/\(.*?\)/', '', $name);
    $words = preg_split('/\s+/', trim((string) $name)) ?: [];
    $out = '';
    foreach ($words as $w) {
        if ($w !== '') {
            $out .= mb_strtoupper(mb_substr($w, 0, 1));
        }
        if (mb_strlen($out) >= 2) {
            break;
        }
    }
    return $out ?: '?';
}

/** Round gateway badge: uploaded logo or coloured initials. */
function gw_badge(?string $name, ?string $color, ?string $logo = null, string $size = ''): string
{
    $cls = 'gw' . ($size ? ' gw-' . $size : '');
    if ($logo) {
        return '<span class="' . $cls . ' gw-img"><img src="' . e(url($logo)) . '" alt="' . e($name) . '"></span>';
    }
    $color = preg_match('/^#[0-9a-fA-F]{6}$/', (string) $color) ? $color : '#64748b';
    return '<span class="' . $cls . '" style="--gw:' . e($color) . '">' . e(initials((string) $name)) . '</span>';
}

function site_logo(bool $light = false): string
{
    $logo = setting('logo');
    $name = setting('site_name', 'Hufan Exchange');
    if ($logo !== '') {
        return '<img class="logo-img" src="' . e(url($logo)) . '" alt="' . e($name) . '">';
    }
    return '<img class="logo-mark" src="' . e(asset('img/logo-mark.svg')) . '" width="38" height="38" alt="">' . wordmark($name);
}

/** Site name with the first word bold and the rest in the brand colour ("Hufan Exchange"). */
function wordmark(string $name): string
{
    $parts = explode(' ', trim($name), 2);
    return '<span class="logo-text">' . e($parts[0]) . (isset($parts[1]) ? ' <span class="logo-text-2">' . e($parts[1]) . '</span>' : '') . '</span>';
}

/**
 * Official round company stamp (blue ink) with the logo mark in the centre.
 * $label is the word on the centre band (e.g. VERIFIED, PAID); $date is shown under it.
 */
function company_stamp(string $label, string $date): string
{
    static $n = 0;
    $id = 'stamp' . (++$n);
    $name = mb_strtoupper(setting('site_name', 'Hufan Exchange'));
    $place = mb_strtoupper(setting('contact_address', 'Mogadishu, Somalia'));
    $ink = '#1a3ea8';
    return '<svg class="doc-stamp" viewBox="0 0 200 200" role="img" aria-label="' . e($name . ' ' . $label) . '">'
        . '<defs>'
        . '<path id="' . $id . 't" d="M 28 100 A 72 72 0 0 1 172 100"/>'
        . '<path id="' . $id . 'b" d="M 22 100 A 78 78 0 0 0 178 100"/>'
        . '<filter id="' . $id . 'f"><feTurbulence type="fractalNoise" baseFrequency="1.3" numOctaves="1" seed="4"/>'
        . '<feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -0.35 1.12"/><feComposite in="SourceGraphic" operator="in"/></filter>'
        . '</defs>'
        . '<g fill="none" stroke="' . $ink . '" filter="url(#' . $id . 'f)">'
        . '<circle cx="100" cy="100" r="96" stroke-width="4.6"/>'
        . '<circle cx="100" cy="100" r="89" stroke-width="1.8"/>'
        . '<circle cx="100" cy="100" r="58" stroke-width="2"/>'
        . '<text font-family="Inter, Arial, sans-serif" font-weight="800" font-size="14.5" letter-spacing="2.2" fill="' . $ink . '" stroke="none" text-anchor="middle">'
        . '<textPath href="#' . $id . 't" startOffset="50%">' . e($name) . '</textPath></text>'
        . '<text font-family="Inter, Arial, sans-serif" font-weight="700" font-size="10.5" letter-spacing="2.4" fill="' . $ink . '" stroke="none" text-anchor="middle" dominant-baseline="hanging">'
        . '<textPath href="#' . $id . 'b" startOffset="50%">' . e($place) . '</textPath></text>'
        . '<g fill="' . $ink . '" stroke="none"><circle cx="20" cy="100" r="2.6"/><circle cx="180" cy="100" r="2.6"/></g>'
        // logo mark (H formed by up/down exchange arrows)
        . '<g transform="translate(74 47) scale(.82)" stroke-width="6.2" stroke-linecap="round" stroke-linejoin="round">'
        . '<rect x="0" y="0" width="64" height="64" rx="16" stroke-width="3.4"/>'
        . '<path d="M23 47V18.5"/><path d="M15.8 25.2 23 18l7.2 7.2"/><path d="M23 32h18"/><path d="M41 17v28.5"/><path d="M33.8 38.8 41 46l7.2-7.2"/></g>'
        . '<rect x="36" y="104" width="128" height="25" rx="3" fill="' . $ink . '" stroke="none"/>'
        . '<text x="100" y="121.5" font-family="Inter, Arial, sans-serif" font-weight="800" font-size="15" letter-spacing="3" fill="#fff" stroke="none" text-anchor="middle">' . e(mb_strtoupper($label)) . '</text>'
        . '<text x="100" y="145" font-family="Inter, Arial, sans-serif" font-weight="700" font-size="11" letter-spacing="1.5" fill="' . $ink . '" stroke="none" text-anchor="middle">' . e($date) . '</text>'
        . '</g></svg>';
}

function whatsapp_link(string $text = ''): string
{
    $num = preg_replace('/\D/', '', setting('contact_whatsapp'));
    if ($num === '') {
        return '';
    }
    return 'https://wa.me/' . $num . ($text !== '' ? '?text=' . rawurlencode($text) : '');
}

/** USSD dial string for EVC style payments, e.g. *712*61xxxxxxx*25# */
function ussd_code(?string $template, ?string $to, float $amount, int $dec): string
{
    if (!$template || !$to) {
        return '';
    }
    $amountStr = rtrim(rtrim(number_format($amount, $dec, '.', ''), '0'), '.');
    return str_replace(['{to}', '{amount}'], [$to, $amountStr], $template);
}

function icon(string $name, int $size = 18): string
{
    static $paths = [
        'swap'         => '<path d="M7 4 3 8l4 4"/><path d="M3 8h13a4 4 0 0 1 4 4"/><path d="m17 20 4-4-4-4"/><path d="M21 16H8a4 4 0 0 1-4-4"/>',
        'arrow-right'  => '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
        'arrow-left'   => '<path d="M19 12H5"/><path d="m11 18-6-6 6-6"/>',
        'user'         => '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
        'users'        => '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M18 14a6 6 0 0 1 3.5 6"/>',
        'logout'       => '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
        'print'        => '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/>',
        'check'        => '<path d="m5 12 5 5L20 7"/>',
        'check-circle' => '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
        'clock'        => '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
        'x'            => '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
        'x-circle'     => '<circle cx="12" cy="12" r="9"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
        'alert'        => '<path d="M12 3 2 21h20L12 3z"/><path d="M12 10v5"/><path d="M12 18h.01"/>',
        'info'         => '<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><path d="M12 7.5h.01"/>',
        'search'       => '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
        'grid'         => '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
        'list'         => '<path d="M9 6h11"/><path d="M9 12h11"/><path d="M9 18h11"/><path d="M4 6h.01"/><path d="M4 12h.01"/><path d="M4 18h.01"/>',
        'settings'     => '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
        'wallet'       => '<path d="M20 7H5a2 2 0 0 1 0-4h13v4"/><path d="M3 5v14a2 2 0 0 0 2 2h15V7"/><path d="M16 14h.01"/>',
        'chart'        => '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 6-6"/>',
        'phone'        => '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
        'whatsapp'     => '<path d="M3 21l1.6-4.7A8.5 8.5 0 1 1 7.7 19.4L3 21z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1.2-1.3-1.7-1-1 .7a4 4 0 0 1-2.4-2.4l.7-1-1-1.7L9 9.5z"/>',
        'mail'         => '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
        'pin'          => '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
        'shield'       => '<path d="M12 3 4 6v6c0 5 3.4 8.4 8 9 4.6-.6 8-4 8-9V6l-8-3z"/><path d="m9 12 2 2 4-4"/>',
        'bolt'         => '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/>',
        'headset'      => '<path d="M3 14v-2a9 9 0 0 1 18 0v2"/><path d="M21 15a2 2 0 0 1-2 2h-1v-6h1a2 2 0 0 1 2 2z"/><path d="M3 15a2 2 0 0 0 2 2h1v-6H5a2 2 0 0 0-2 2z"/><path d="M19 17v1a3 3 0 0 1-3 3h-3"/>',
        'copy'         => '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
        'upload'       => '<path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
        'download'     => '<path d="M12 4v12"/><path d="m7 11 5 5 5-5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
        'menu'         => '<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>',
        'eye'          => '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
        'file'         => '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6z"/><path d="M14 3v6h6"/><path d="M8 13h8"/><path d="M8 17h5"/>',
        'plus'         => '<path d="M12 5v14"/><path d="M5 12h14"/>',
        'edit'         => '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="m13.5 6.5 4 4"/>',
        'globe'        => '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18"/><path d="M12 3a14 14 0 0 0 0 18"/>',
        'lock'         => '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
        'calendar'     => '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M8 3v4"/><path d="M16 3v4"/>',
        'refresh'      => '<path d="M20 11a8 8 0 0 0-14.9-3"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.9 3"/><path d="M20 20v-4h-4"/>',
        'home'         => '<path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/>',
        'external'     => '<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
    ];
    $p = $paths[$name] ?? $paths['info'];
    return '<svg class="icon" width="' . $size . '" height="' . $size . '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' . $p . '</svg>';
}
