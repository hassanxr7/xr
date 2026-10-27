<?php
/**
 * Prices and stock status from the management system (Odoo).
 * Finance sets the price and ticks "Show on the website" on a product; the store enters the units. This file reads the result
 * (read-only, signed request) and keeps a short-lived copy so the website stays fast and keeps working if the management
 * system is unreachable. Nothing is shown for a product until it is published there.
 */

const CATALOG_TTL = 300;          // seconds a fresh copy is used
const CATALOG_RETRY = 60;         // seconds to wait after a failed request before asking again
const CATALOG_STALE_MAX = 604800; // a copy up to 7 days old is still shown while the management system is unreachable

function catalog_cache_file(): string { return DATA_DIR . '/catalog-cache.json'; }

/** The published catalog, or null when the management system is not connected or nothing has ever been fetched. */
function catalog_get(): ?array
{
    static $result = false;
    if ($result !== false) { return $result; }
    $result = null;
    if (!odoo_enabled()) { return null; }
    $file = catalog_cache_file();
    $cache = is_file($file) ? json_decode((string)@file_get_contents($file), true) : null;
    $cache = is_array($cache) ? $cache : [];
    $age = time() - (int)($cache['fetched'] ?? 0);
    $fresh = isset($cache['data']) && $age < CATALOG_TTL;
    $recentlyFailed = time() - (int)($cache['failed_at'] ?? 0) < CATALOG_RETRY;
    if (!$fresh && !$recentlyFailed) {
        $ts = (string)time();
        $sig = hash_hmac('sha256', 'catalog|' . $ts, ODOO_SSO_SECRET);
        [$code, $body, $err] = odoo_http('GET', odoo_url('/itz/api/catalog?ts=' . $ts . '&sig=' . $sig), null, ['Accept: application/json']);
        $data = $code === 200 ? json_decode($body, true) : null;
        if (is_array($data) && isset($data['plans'], $data['items'])) {
            $cache = ['fetched' => time(), 'data' => $data];
        } else {
            $cache['failed_at'] = time();
            error_log('[ITrackZen] catalog: HTTP ' . $code . ' ' . $err);
        }
        @file_put_contents($file, json_encode($cache, JSON_UNESCAPED_UNICODE), LOCK_EX);
    }
    if (isset($cache['data']) && time() - (int)($cache['fetched'] ?? 0) < CATALOG_STALE_MAX) { $result = $cache['data']; }
    return $result;
}

function catalog_money(float $value, array $cur): string
{
    $dec = $value == floor($value) ? 0 : (int)($cur['decimals'] ?? 2);
    return trim(($cur['code'] ?? '') . ' ' . number_format($value, $dec, '.', ','));
}

function catalog_period(string $cycle): string
{
    return ['monthly' => 'per vehicle / month', 'quarterly' => 'per vehicle / 3 months', 'semiannual' => 'per vehicle / 6 months', 'annual' => 'per vehicle / year'][$cycle] ?? 'per vehicle';
}

/**
 * The price shown on a plan card (Starter, Business, Enterprise).
 * Returns ['price' => 'USD 12', 'period' => 'per vehicle / month', 'others' => ['USD 120 per vehicle / year']] or null if Odoo has none.
 */
function catalog_plan_price(string $planName): ?array
{
    $cat = catalog_get();
    if (!$cat) { return null; }
    $mine = array_values(array_filter($cat['plans'], fn($p) => ($p['plan'] ?? '') === strtolower($planName)));
    if (!$mine) { return null; }
    usort($mine, fn($a, $b) => ($a['months'] ?? 1) <=> ($b['months'] ?? 1));
    $main = $mine[0];
    $out = ['price' => catalog_money((float)$main['price'], $cat['currency']), 'period' => catalog_period((string)($main['cycle'] ?? 'monthly')), 'others' => []];
    foreach (array_slice($mine, 1) as $o) { $out['others'][] = catalog_money((float)$o['price'], $cat['currency']) . ' ' . catalog_period((string)($o['cycle'] ?? '')); }
    return $out;
}

/** Hardware and services grouped by category for the pricing page, in a stable order. */
function catalog_items_grouped(): array
{
    $cat = catalog_get();
    if (!$cat || empty($cat['items'])) { return []; }
    $order = ['tracker', 'dashcam', 'fuel_sensor', 'relay', 'rfid', 'sim', 'cable', 'accessory', 'service'];
    $groups = [];
    foreach ($cat['items'] as $it) { $groups[$it['category'] ?? 'accessory'][] = $it; }
    uksort($groups, fn($a, $b) => (array_search($a, $order, true) === false ? 99 : array_search($a, $order, true)) <=> (array_search($b, $order, true) === false ? 99 : array_search($b, $order, true)));
    return $groups;
}
