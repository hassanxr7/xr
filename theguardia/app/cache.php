<?php
/**
 * The Guardia — small file caches: key/value data and full public pages.
 *
 * Page cache: anonymous GET requests are stored as HTML for a short time (setting
 * "page_cache_ttl", default 120 s). Pages are invalidated as soon as content changes.
 * The CSP nonce is replaced by a placeholder in the stored copy and a fresh nonce is
 * injected each time a cached page is served.
 */
defined('APP') || exit;

const NONCE_PLACEHOLDER = '__TG_CSP_NONCE__';

function cache_dir(string $sub): string
{
    $dir = STORAGE_PATH . '/cache/' . $sub;
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    return $dir;
}

function cache_get(string $key)
{
    $file = cache_dir('data') . '/' . md5($key) . '.php';
    if (!is_file($file)) {
        return null;
    }
    $data = @unserialize((string) file_get_contents($file));
    if (!is_array($data) || $data['exp'] < time()) {
        return null;
    }
    return $data['v'];
}

function cache_set(string $key, $value, int $ttl): void
{
    $file = cache_dir('data') . '/' . md5($key) . '.php';
    @file_put_contents($file, serialize(['exp' => time() + $ttl, 'v' => $value]), LOCK_EX);
}

/** Version stamp that changes whenever content changes (part of every page-cache key). */
function content_version(): string
{
    $f = cache_dir('') . '/version';
    return is_file($f) ? trim((string) file_get_contents($f)) : '0';
}

/** Call after any change visible on the public site. */
function content_changed(): void
{
    @file_put_contents(cache_dir('') . '/version', (string) microtime(true), LOCK_EX);
    foreach (glob(cache_dir('data') . '/*.php') ?: [] as $f) {
        @unlink($f);
    }
}

function page_cache_ttl(): int
{
    return max(0, (int) setting('page_cache_ttl', '120'));
}

function page_cache_file(): ?string
{
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET' || page_cache_ttl() === 0 || has_session_cookie()) {
        return null;
    }
    $uri = $_SERVER['REQUEST_URI'] ?? '/';
    // Search results and tracking parameters are not cached (utm_* would create endless copies).
    $qs = (string) parse_url($uri, PHP_URL_QUERY);
    if ($qs !== '') {
        parse_str($qs, $params);
        $params = array_diff_key($params, array_flip(['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid']));
        if (array_diff(array_keys($params), ['page'])) {
            return null;
        }
        $uri = strtok($uri, '?') . ($params ? '?' . http_build_query($params) : '');
    }
    $key = md5(content_version() . '|' . ($_SERVER['HTTP_HOST'] ?? '') . '|' . $uri);
    return cache_dir('pages') . '/' . substr($key, 0, 2) . '/' . $key . '.html';
}

/** Serve the request from the page cache if possible (exits on a hit). */
function page_cache_serve(): void
{
    $file = page_cache_file();
    if (!$file || !is_file($file) || filemtime($file) < time() - page_cache_ttl()) {
        return;
    }
    $raw = (string) file_get_contents($file);
    $nl = strpos($raw, "\n");
    $meta = json_decode(substr($raw, 0, (int) $nl), true) ?: [];
    $nonce = csp_nonce();
    send_public_headers($nonce);
    header('Content-Type: ' . ($meta['type'] ?? 'text/html; charset=utf-8'));
    header('Cache-Control: public, max-age=60');
    header('X-Cache: HIT');
    echo str_replace(NONCE_PLACEHOLDER, $nonce, substr($raw, $nl + 1));
    exit;
}

function page_cache_store(string $body, string $type = 'text/html; charset=utf-8'): void
{
    $file = page_cache_file();
    if (!$file || http_response_code() !== 200) {
        return;
    }
    @mkdir(dirname($file), 0755, true);
    $body = str_replace(csp_nonce(), NONCE_PLACEHOLDER, $body);
    @file_put_contents($file, json_encode(['type' => $type]) . "\n" . $body, LOCK_EX);
}

/** Remove expired page-cache files (cron). */
function page_cache_prune(): int
{
    $n = 0;
    $limit = time() - max(600, page_cache_ttl());
    foreach (glob(cache_dir('pages') . '/*/*.html') ?: [] as $f) {
        if (filemtime($f) < $limit && @unlink($f)) {
            $n++;
        }
    }
    return $n;
}
