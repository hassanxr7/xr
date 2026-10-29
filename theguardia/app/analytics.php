<?php
/**
 * The Guardia — first-party analytics.
 *
 * The page script sends one beacon per page view (api/track). We store the page, a salted
 * visitor hash (never the IP), where the reader came from (Facebook, WhatsApp, Google …),
 * country/city and device. Finished days are rolled up into stats_daily, which is kept
 * forever; raw rows are deleted after "analytics_retention_days".
 */
defined('APP') || exit;

const STAT_DIMS = ['total', 'country', 'city', 'source', 'ref', 'device', 'browser', 'os', 'article', 'campaign', 'hour', 'new'];

const SOURCE_LABELS = [
    'direct' => 'Direct / unknown', 'facebook' => 'Facebook', 'whatsapp' => 'WhatsApp', 'instagram' => 'Instagram', 'x' => 'X (Twitter)',
    'telegram' => 'Telegram', 'tiktok' => 'TikTok', 'youtube' => 'YouTube', 'linkedin' => 'LinkedIn', 'reddit' => 'Reddit', 'snapchat' => 'Snapchat',
    'google' => 'Google Search', 'google-news' => 'Google News', 'google-discover' => 'Google Discover', 'bing' => 'Bing', 'yahoo' => 'Yahoo',
    'duckduckgo' => 'DuckDuckGo', 'yandex' => 'Yandex', 'baidu' => 'Baidu', 'ecosia' => 'Ecosia', 'email' => 'Email', 'push' => 'Push alerts',
    'internal' => 'Internal links', 'other' => 'Other websites', 'pwa' => 'Home-screen app',
];

function is_bot(string $ua): bool
{
    return $ua === '' || (bool) preg_match('~bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp/|headless|lighthouse|pingdom|monitor|curl|wget|python|go-http|java/|scrapy|bingpreview|embedly|quora link|vkshare|discord|telegrambot~i', $ua);
}

/** Main traffic source from utm_source, the referrer host and in-app browser user agents. */
function classify_source(string $utm, string $refHost, string $ua, string $siteHost): string
{
    $utm = strtolower(trim($utm));
    if ($utm !== '') {
        $map = ['fb' => 'facebook', 'facebook' => 'facebook', 'ig' => 'instagram', 'instagram' => 'instagram', 'wa' => 'whatsapp', 'whatsapp' => 'whatsapp',
            'twitter' => 'x', 'x' => 'x', 'tw' => 'x', 'tg' => 'telegram', 'telegram' => 'telegram', 'tiktok' => 'tiktok', 'youtube' => 'youtube', 'yt' => 'youtube',
            'linkedin' => 'linkedin', 'push' => 'push', 'email' => 'email', 'newsletter' => 'email', 'google' => 'google', 'pwa' => 'pwa', 'native' => 'direct', 'copy' => 'direct'];
        if (isset($map[$utm])) {
            return $map[$utm];
        }
    }
    $h = strtolower(preg_replace('~^www\.~', '', $refHost));
    if ($h !== '') {
        if ($h === strtolower(preg_replace('~^www\.~', '', $siteHost))) {
            return 'internal';
        }
        $rules = [
            '~(^|\.)(facebook\.com|fb\.com|fb\.me|fb\.watch|messenger\.com)$~' => 'facebook',
            '~(^|\.)instagram\.com$~' => 'instagram',
            '~(^|\.)(whatsapp\.com|whatsapp\.net|wa\.me)$~' => 'whatsapp',
            '~(^|\.)(t\.co|twitter\.com|x\.com)$~' => 'x',
            '~(^|\.)(t\.me|telegram\.org|telegram\.me)$~' => 'telegram',
            '~(^|\.)tiktok\.com$~' => 'tiktok',
            '~(^|\.)(youtube\.com|youtu\.be)$~' => 'youtube',
            '~(^|\.)(linkedin\.com|lnkd\.in)$~' => 'linkedin',
            '~(^|\.)reddit\.com$~' => 'reddit',
            '~(^|\.)snapchat\.com$~' => 'snapchat',
            '~^news\.google\.~' => 'google-news',
            '~^com\.google\.android\.googlequicksearchbox~' => 'google-discover',
            '~(^|\.)google\.[a-z.]+$~' => 'google',
            '~(^|\.)bing\.com$~' => 'bing',
            '~(^|\.)yahoo\.[a-z.]+$~' => 'yahoo',
            '~(^|\.)duckduckgo\.com$~' => 'duckduckgo',
            '~(^|\.)yandex\.[a-z.]+$~' => 'yandex',
            '~(^|\.)baidu\.com$~' => 'baidu',
            '~(^|\.)ecosia\.org$~' => 'ecosia',
            '~(^mail\.|outlook\.|(^|\.)gmail\.com$)~' => 'email',
        ];
        foreach ($rules as $re => $src) {
            if (preg_match($re, $h)) {
                return $src;
            }
        }
        return 'other';
    }
    if ($utm !== '') {
        return substr(preg_replace('~[^a-z0-9_.-]~', '', $utm), 0, 30) ?: 'other';
    }
    // In-app browsers that send no referrer.
    if (preg_match('~FBAN|FBAV|FB_IAB|FBIOS~', $ua)) {
        return 'facebook';
    }
    if (stripos($ua, 'Instagram') !== false) {
        return 'instagram';
    }
    if (preg_match('~musical_ly|TikTok|BytedanceWebview~i', $ua)) {
        return 'tiktok';
    }
    if (stripos($ua, 'Snapchat') !== false) {
        return 'snapchat';
    }
    return 'direct';
}

function ua_device(string $ua, int $screenWidth): string
{
    if (preg_match('~iPad|Tablet|PlayBook|Silk|Kindle~i', $ua) || (stripos($ua, 'Android') !== false && stripos($ua, 'Mobile') === false)) {
        return 'tablet';
    }
    if (preg_match('~Mobi|iPhone|iPod|Android|Windows Phone|Opera Mini~i', $ua) || ($screenWidth > 0 && $screenWidth < 600)) {
        return 'mobile';
    }
    return 'desktop';
}

function ua_browser(string $ua): string
{
    $map = [
        '~FBAN|FBAV|FB_IAB~' => 'Facebook app', '~Instagram~' => 'Instagram app', '~SamsungBrowser~' => 'Samsung Internet', '~Edg/|Edge/~' => 'Edge',
        '~OPR/|Opera~' => 'Opera', '~YaBrowser~' => 'Yandex', '~UCBrowser~' => 'UC Browser', '~Firefox|FxiOS~' => 'Firefox', '~CriOS|Chrome~' => 'Chrome',
        '~Safari~' => 'Safari',
    ];
    foreach ($map as $re => $name) {
        if (preg_match($re, $ua)) {
            return $name;
        }
    }
    return 'Other';
}

function ua_os(string $ua): string
{
    $map = ['~iPhone|iPad|iPod~' => 'iOS', '~Android~' => 'Android', '~Windows~' => 'Windows', '~CrOS~' => 'ChromeOS', '~Mac OS X|Macintosh~' => 'macOS', '~Linux~' => 'Linux'];
    foreach ($map as $re => $name) {
        if (preg_match($re, $ua)) {
            return $name;
        }
    }
    return 'Other';
}

/** Store one page view from the page beacon. */
function track_hit(array $d): void
{
    $ua = (string) ($_SERVER['HTTP_USER_AGENT'] ?? '');
    if (is_bot($ua) || setting('analytics_enabled', '1') !== '1') {
        return;
    }
    $path = '/' . ltrim(mb_substr((string) ($d['p'] ?? '/'), 0, 255), '/');
    if (preg_match('~^/(admin|api)/~', substr($path, strlen(base_url())))) {
        return;
    }
    parse_str(ltrim((string) ($d['q'] ?? ''), '?'), $qs);
    $utmSource = mb_substr((string) ($qs['utm_source'] ?? ''), 0, 40);
    $ref = (string) ($d['r'] ?? '');
    $refHost = '';
    if ($ref !== '') {
        $refHost = strtolower((string) (parse_url($ref, PHP_URL_HOST) ?: ''));
        if ($refHost === '' && strpos($ref, 'android-app://') === 0) {
            $refHost = substr($ref, 14, 60);
        }
    }
    $siteHost = (string) (parse_url(site_origin(), PHP_URL_HOST) ?: ($_SERVER['HTTP_HOST'] ?? ''));
    $source = classify_source($utmSource, $refHost, $ua, $siteHost);

    $vid = preg_replace('~[^a-z0-9]~', '', strtolower((string) ($d['v'] ?? '')));
    $salt = (string) config('app_key', 'tg');
    $visitor = $vid !== ''
        ? substr(hash('sha256', $salt . '|v|' . $vid), 0, 20)
        : substr(hash('sha256', $salt . '|ip|' . client_ip() . '|' . $ua . '|' . date('Y-m-d')), 0, 20);

    $articleId = (int) ($d['a'] ?? 0);
    if ($articleId && !val('SELECT 1 FROM articles WHERE id = ?', [$articleId])) {
        $articleId = 0;
    }
    $geo = geo_lookup(client_ip());
    $now = time();
    insert('hits', [
        'ts' => $now, 'day' => date('Y-m-d', $now), 'hour' => (int) date('G', $now), 'path' => $path, 'article_id' => $articleId ?: null,
        'visitor' => $visitor, 'is_new' => !empty($d['n']) ? 1 : 0, 'source' => $source,
        'ref_host' => $source === 'internal' ? null : ($refHost !== '' ? mb_substr($refHost, 0, 80) : null),
        'utm_source' => $utmSource !== '' ? $utmSource : null,
        'utm_medium' => isset($qs['utm_medium']) ? mb_substr((string) $qs['utm_medium'], 0, 40) : null,
        'utm_campaign' => isset($qs['utm_campaign']) ? mb_substr((string) $qs['utm_campaign'], 0, 60) : null,
        'country' => $geo['country'] ?: null, 'region' => $geo['region'] ?: null, 'city' => $geo['city'] ?: null,
        'device' => ua_device($ua, (int) ($d['w'] ?? 0)), 'browser' => ua_browser($ua), 'os' => ua_os($ua),
    ]);
    if ($articleId) {
        q('UPDATE articles SET views = views + 1 WHERE id = ?', [$articleId]);
    }
    if (!empty($d['ads']) && is_array($d['ads'])) {
        ads_count_impressions($d['ads']);
    }
}

// ---------------------------------------------------------------------------
// Roll-ups
// ---------------------------------------------------------------------------

/** Roll up every finished day that has raw hits but no summary yet, then prune old raw rows. */
function stats_rollup(): int
{
    $today = date('Y-m-d');
    $last = setting('stats_rolled_until');
    $days = $last === ''
        ? array_column(rows('SELECT DISTINCT day FROM hits WHERE day < ? ORDER BY day', [$today]), 'day')
        : array_column(rows('SELECT DISTINCT day FROM hits WHERE day > ? AND day < ? ORDER BY day', [$last, $today]), 'day');
    $exprs = [
        'total'    => ["''", '1'],
        'country'  => ["COALESCE(country, '')", '1'],
        'city'     => ["city || '|' || COALESCE(country, '')", "city IS NOT NULL AND city <> ''"],
        'source'   => ['source', '1'],
        'ref'      => ['ref_host', "ref_host IS NOT NULL AND ref_host <> ''"],
        'device'   => ['device', '1'],
        'browser'  => ['browser', '1'],
        'os'       => ['os', '1'],
        'article'  => ['CAST(article_id AS TEXT)', 'article_id IS NOT NULL'],
        'campaign' => ['utm_campaign', "utm_campaign IS NOT NULL AND utm_campaign <> ''"],
        'hour'     => ['CAST(hour AS TEXT)', '1'],
        'new'      => ['CAST(is_new AS TEXT)', '1'],
    ];
    foreach ($days as $day) {
        db()->beginTransaction();
        q('DELETE FROM stats_daily WHERE day = ?', [$day]);
        foreach ($exprs as $dim => [$key, $cond]) {
            q("INSERT INTO stats_daily (day, dim, `key`, views, visitors) SELECT day, '$dim', $key, COUNT(*), COUNT(DISTINCT visitor) FROM hits WHERE day = ? AND $cond GROUP BY day, $key", [$day]);
        }
        db()->commit();
        save_setting('stats_rolled_until', $day);
    }
    $keep = max(14, (int) setting('analytics_retention_days', '120'));
    $cut = date('Y-m-d', strtotime("-$keep days"));
    $rolled = setting('stats_rolled_until');
    if ($rolled !== '') {
        q('DELETE FROM hits WHERE day < ? AND day <= ?', [$cut, $rolled]);
    }
    return count($days);
}

function raw_since(): string
{
    return (string) (val('SELECT MIN(day) FROM hits') ?: date('Y-m-d'));
}

/**
 * Views/visitors per key for a dimension over [from, to] (Y-m-d, inclusive).
 * Past days come from stats_daily, today from raw hits.
 * Visitors across several days are summed daily uniques unless $exact (raw data needed).
 */
function stats_by(string $dim, string $from, string $to, int $limit = 20): array
{
    $today = date('Y-m-d');
    $out = [];
    if ($from < $today) {
        foreach (rows('SELECT `key`, SUM(views) v, SUM(visitors) u FROM stats_daily WHERE dim = ? AND day >= ? AND day <= ? GROUP BY `key`', [$dim, $from, min($to, date('Y-m-d', strtotime('-1 day')))]) as $r) {
            $out[$r['key']] = ['views' => (int) $r['v'], 'visitors' => (int) $r['u']];
        }
    }
    if ($to >= $today) {
        $map = [
            'total' => "''", 'country' => "COALESCE(country, '')", 'city' => "city || '|' || COALESCE(country, '')", 'source' => 'source', 'ref' => 'ref_host',
            'device' => 'device', 'browser' => 'browser', 'os' => 'os', 'article' => 'CAST(article_id AS TEXT)', 'campaign' => 'utm_campaign',
            'hour' => 'CAST(hour AS TEXT)', 'new' => 'CAST(is_new AS TEXT)',
        ];
        $cond = ['city' => "city IS NOT NULL AND city <> ''", 'ref' => "ref_host IS NOT NULL AND ref_host <> ''", 'article' => 'article_id IS NOT NULL', 'campaign' => "utm_campaign IS NOT NULL AND utm_campaign <> ''"][$dim] ?? '1';
        $key = $map[$dim] ?? "''";
        foreach (rows("SELECT $key k, COUNT(*) v, COUNT(DISTINCT visitor) u FROM hits WHERE day = ? AND $cond GROUP BY k", [$today]) as $r) {
            $k = (string) $r['k'];
            $out[$k]['views'] = ($out[$k]['views'] ?? 0) + (int) $r['v'];
            $out[$k]['visitors'] = ($out[$k]['visitors'] ?? 0) + (int) $r['u'];
        }
    }
    uasort($out, fn ($a, $b) => $b['views'] <=> $a['views']);
    return $limit ? array_slice($out, 0, $limit, true) : $out;
}

/** Totals for a range: views, visitors (exact when raw data covers the range), new visitors. */
function stats_totals(string $from, string $to): array
{
    $t = stats_by('total', $from, $to, 0)[''] ?? ['views' => 0, 'visitors' => 0];
    $exact = $from >= raw_since();
    if ($exact) {
        $t['visitors'] = (int) val('SELECT COUNT(DISTINCT visitor) FROM hits WHERE day >= ? AND day <= ?', [$from, $to]);
    }
    $new = stats_by('new', $from, $to, 0);
    $t['new'] = (int) ($new['1']['visitors'] ?? 0);
    $t['exact'] = $exact;
    return $t;
}

/** Series of [label => [views, visitors]] by hour (one day), day, month or year. */
function stats_series(string $unit, string $from, string $to): array
{
    $today = date('Y-m-d');
    $series = [];
    if ($unit === 'hour') {
        for ($h = 0; $h < 24; $h++) {
            $series[sprintf('%02d:00', $h)] = ['views' => 0, 'visitors' => 0];
        }
        if ($from >= raw_since()) {
            foreach (rows('SELECT hour, COUNT(*) v, COUNT(DISTINCT visitor) u FROM hits WHERE day >= ? AND day <= ? GROUP BY hour', [$from, $to]) as $r) {
                $series[sprintf('%02d:00', $r['hour'])] = ['views' => (int) $r['v'], 'visitors' => (int) $r['u']];
            }
        } else {
            foreach (stats_by('hour', $from, $to, 0) as $h => $r) {
                $series[sprintf('%02d:00', (int) $h)] = $r;
            }
        }
        return $series;
    }
    $fmt = ['day' => 'Y-m-d', 'month' => 'Y-m', 'year' => 'Y'][$unit] ?? 'Y-m-d';
    $len = ['day' => 10, 'month' => 7, 'year' => 4][$unit] ?? 10;
    $start = ['day' => $from, 'month' => substr($from, 0, 7) . '-01', 'year' => substr($from, 0, 4) . '-01-01'][$unit] ?? $from;
    $step = ['day' => '+1 day', 'month' => '+1 month', 'year' => '+1 year'][$unit] ?? '+1 day';
    for ($t = strtotime($start), $end = strtotime($to); $t <= $end && count($series) < 1000; $t = strtotime($step, $t)) {
        $series[date($fmt, $t)] = ['views' => 0, 'visitors' => 0];
    }
    foreach (rows("SELECT substr(day, 1, $len) k, SUM(views) v, SUM(visitors) u FROM stats_daily WHERE dim = 'total' AND day >= ? AND day <= ? GROUP BY k", [$from, $to]) as $r) {
        if (isset($series[$r['k']])) {
            $series[$r['k']] = ['views' => (int) $r['v'], 'visitors' => (int) $r['u']];
        }
    }
    if ($to >= $today) {
        $k = substr($today, 0, $len);
        $r = row('SELECT COUNT(*) v, COUNT(DISTINCT visitor) u FROM hits WHERE day = ?', [$today]);
        if (isset($series[$k])) {
            $series[$k]['views'] += (int) $r['v'];
            $series[$k]['visitors'] += (int) $r['u'];
        }
    }
    return $series;
}

/** Readers active in the last N minutes and what they read. */
function stats_realtime(int $minutes = 5): array
{
    $since = time() - $minutes * 60;
    return [
        'visitors' => (int) val('SELECT COUNT(DISTINCT visitor) FROM hits WHERE ts >= ?', [$since]),
        'pages'    => rows('SELECT path, article_id, COUNT(*) n FROM hits WHERE ts >= ? GROUP BY path ORDER BY n DESC LIMIT 10', [time() - 30 * 60]),
        'sources'  => rows('SELECT source, COUNT(DISTINCT visitor) n FROM hits WHERE ts >= ? GROUP BY source ORDER BY n DESC LIMIT 8', [time() - 30 * 60]),
        'countries' => rows('SELECT country, COUNT(DISTINCT visitor) n FROM hits WHERE ts >= ? GROUP BY country ORDER BY n DESC LIMIT 8', [time() - 30 * 60]),
    ];
}

function source_label(string $s): string
{
    return SOURCE_LABELS[$s] ?? ucfirst($s);
}
