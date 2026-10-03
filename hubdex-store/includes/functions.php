<?php
/**
 * Hubdex Store - Helper functions
 */

require_once __DIR__ . '/config.php';

if (session_status() === PHP_SESSION_NONE && !headers_sent()) {
    session_set_cookie_params([
        'lifetime' => 0,
        'path'     => '/',
        'secure'   => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
}

/** Escape output for HTML. */
function e($value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

/** Absolute URL for a site path, e.g. url('about.php'). */
function url(string $path = ''): string
{
    $path = ltrim($path, '/');
    return rtrim(SITE_URL, '/') . '/' . $path;
}

/** Versioned asset path (relative, works in sub-folders too). */
function asset(string $path): string
{
    return 'assets/' . ltrim($path, '/') . '?v=' . ASSET_VERSION;
}

/** CSRF token for forms. */
function csrf_token(): string
{
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

function csrf_verify(?string $token): bool
{
    return !empty($_SESSION['csrf_token']) && is_string($token)
        && hash_equals($_SESSION['csrf_token'], $token);
}

/** Simple per-session rate limit: returns false if called too often. */
function rate_limit(string $key, int $seconds = 20): bool
{
    $now  = time();
    $last = $_SESSION['rl_' . $key] ?? 0;
    if ($now - $last < $seconds) {
        return false;
    }
    $_SESSION['rl_' . $key] = $now;
    return true;
}

/** Strip control characters and trim. */
function clean_input($value, int $maxLength = 2000): string
{
    $value = is_string($value) ? $value : '';
    $value = preg_replace('/[^\P{C}\n\r\t]/u', '', $value) ?? '';
    $value = trim($value);
    return mb_substr($value, 0, $maxLength);
}

/** Append a row to a protected CSV file in /data. */
function save_submission(string $file, array $row): bool
{
    if (!is_dir(DATA_DIR) && !@mkdir(DATA_DIR, 0755, true)) {
        return false;
    }
    $path  = DATA_DIR . '/' . basename($file);
    $isNew = !file_exists($path);
    $fh    = @fopen($path, 'a');
    if (!$fh) {
        return false;
    }
    flock($fh, LOCK_EX);
    if ($isNew) {
        fputcsv($fh, array_keys($row));
    }
    // Prevent CSV/formula injection when opened in spreadsheet apps.
    $safe = array_map(static function ($v) {
        $v = (string) $v;
        return preg_match('/^[=+\-@\t\r]/', $v) ? "'" . $v : $v;
    }, $row);
    fputcsv($fh, $safe);
    flock($fh, LOCK_UN);
    fclose($fh);
    return true;
}

/** Send a plain-text notification e-mail (only when MAIL_ENABLED is true). */
function send_notification(string $subject, string $body, string $replyTo = ''): bool
{
    if (!MAIL_ENABLED) {
        return true;
    }
    $headers = [
        'From: ' . SITE_NAME . ' <' . MAIL_FROM . '>',
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
    ];
    if ($replyTo && filter_var($replyTo, FILTER_VALIDATE_EMAIL)) {
        $headers[] = 'Reply-To: ' . $replyTo;
    }
    $subject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
    return @mail(MAIL_TO, $subject, $body, implode("\r\n", $headers));
}

/** Client IP (best effort, for spam auditing only). */
function client_ip(): string
{
    return $_SERVER['REMOTE_ADDR'] ?? '';
}

/** True if this is an AJAX/fetch request expecting JSON. */
function wants_json(): bool
{
    $accept = $_SERVER['HTTP_ACCEPT'] ?? '';
    $xrw    = $_SERVER['HTTP_X_REQUESTED_WITH'] ?? '';
    return stripos($accept, 'application/json') !== false || strtolower($xrw) === 'xmlhttprequest';
}

/** Output JSON and exit. */
function json_response(array $data, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/** Real social URLs only (skip '#' placeholders). */
function social_profiles(): array
{
    global $SOCIAL_LINKS;
    return array_values(array_filter($SOCIAL_LINKS, static fn ($u) => $u && $u !== '#'));
}

/** Inline SVG icons used throughout the site. */
function icon(string $name, int $size = 20): string
{
    $icons = [
        'facebook'  => '<path d="M14 8h3V4h-3c-2.8 0-5 2.2-5 5v2H7v4h2v9h4v-9h3l1-4h-4V9c0-.6.4-1 1-1z"/>',
        'instagram' => '<rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.5" cy="6.5" r="1.3"/>',
        'x'         => '<path d="M17.8 3h3.1l-6.8 7.8L22 21h-6.2l-4.9-6.4L5.3 21H2.2l7.3-8.3L2 3h6.4l4.4 5.8L17.8 3zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5z"/>',
        'linkedin'  => '<path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9.5h4V21H3V9.5zm6.5 0h3.8v1.6h.1c.5-1 1.8-2 3.8-2 4 0 4.8 2.6 4.8 6V21h-4v-5.2c0-1.2 0-2.8-1.7-2.8s-2 1.3-2 2.7V21h-4V9.5z"/>',
        'tiktok'    => '<path d="M16.6 5.8A4.8 4.8 0 0 1 15.4 3h-3.3v12.4a2.6 2.6 0 1 1-2.6-2.6c.3 0 .5 0 .8.1V9.5a6 6 0 1 0 5.1 5.9V9a8.1 8.1 0 0 0 4.6 1.5V7.1c-1.3 0-2.5-.5-3.4-1.3z"/>',
        'youtube'   => '<path d="M22 8.2a3 3 0 0 0-2.1-2.1C18 5.6 12 5.6 12 5.6s-6 0-7.9.5A3 3 0 0 0 2 8.2 31 31 0 0 0 1.6 12 31 31 0 0 0 2 15.8a3 3 0 0 0 2.1 2.1c1.9.5 7.9.5 7.9.5s6 0 7.9-.5a3 3 0 0 0 2.1-2.1c.3-1.2.4-2.5.4-3.8s-.1-2.6-.4-3.8zM10 15V9l5.2 3L10 15z"/>',
        'bag'       => '<path d="M6 7V6a6 6 0 0 1 12 0v1h2.2a1 1 0 0 1 1 .9l1.2 13A2 2 0 0 1 20.4 23H3.6a2 2 0 0 1-2-2.1l1.2-13a1 1 0 0 1 1-.9H6zm2 0h8V6a4 4 0 0 0-8 0v1zm-1 3a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm10 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"/>',
        'truck'     => '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M1 4h13v12H1zM14 8h4l3 4v4h-7zM5.5 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17.5 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>',
        'shield'    => '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4"/>',
        'card'      => '<rect x="2" y="5" width="20" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path fill="none" stroke="currentColor" stroke-width="2" d="M2 10h20M6 15h4"/>',
        'star'      => '<path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
        'support'   => '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M3 14v-2a9 9 0 0 1 18 0v2M21 14v3a2 2 0 0 1-2 2h-1v-6h3zM3 14v3a2 2 0 0 0 2 2h1v-6H3z"/>',
        'mail'      => '<rect x="2" y="4" width="20" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path fill="none" stroke="currentColor" stroke-width="2" d="M22 6l-10 7L2 6"/>',
        'phone'     => '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
        'pin'       => '<path fill="none" stroke="currentColor" stroke-width="2" d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5" fill="none" stroke="currentColor" stroke-width="2"/>',
        'clock'     => '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M12 7v5l3 2"/>',
        'arrow'     => '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M13 6l6 6-6 6"/>',
        'check'     => '<path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" d="M5 12.5l4.5 4.5L19 7.5"/>',
        'sparkle'   => '<path d="M12 2l1.8 5.4L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.6zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/>',
        'globe'     => '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path fill="none" stroke="currentColor" stroke-width="2" d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/>',
        'menu'      => '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M4 7h16M4 12h16M4 17h16"/>',
        'close'     => '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M6 6l12 12M18 6L6 18"/>',
    ];
    $svg = $icons[$name] ?? '';
    return '<svg class="icon icon-' . e($name) . '" width="' . $size . '" height="' . $size
        . '" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">' . $svg . '</svg>';
}
