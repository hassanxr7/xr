<?php
/**
 * The Guardia — advertising: Google AdSense units and direct (sold) campaigns per page position.
 */
defined('APP') || exit;

const AD_POSITIONS = [
    'header'         => 'Below the menu (all pages)',
    'home_middle'    => 'Home page – between sections',
    'home_lower'     => 'Home page – lower sections',
    'sidebar'        => 'Sidebar (articles & sections, sticky on desktop)',
    'article_top'    => 'Article – under the main image',
    'in_article'     => 'Article – inside the text (1st)',
    'in_article_2'   => 'Article – inside the text (2nd)',
    'article_bottom' => 'Article – after the text',
    'list_inline'    => 'Section lists – between stories',
    'footer'         => 'Above the footer (all pages)',
    'mobile_anchor'  => 'Mobile – sticky bottom banner',
];

function ads_enabled(): bool
{
    return setting('ads_enabled', '1') === '1';
}

function adsense_client(): string
{
    $c = trim(setting('adsense_client'));
    if ($c === '') {
        return '';
    }
    return strpos($c, 'ca-') === 0 ? $c : 'ca-' . $c;
}

/** <script> tag for AdSense (also enables Auto ads when they are switched on in the AdSense dashboard). */
function adsense_head(): string
{
    $client = adsense_client();
    if (!ads_enabled() || $client === '') {
        return '';
    }
    return '<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' . e($client)
        . '" crossorigin="anonymous" nonce="' . e(csp_nonce()) . '"></script>' . "\n";
}

/** Active ads for a position (cached per request). */
function ads_for(string $position): array
{
    static $all = null;
    if ($all === null) {
        $all = [];
        $now = now();
        foreach (rows('SELECT * FROM ads WHERE active = 1 AND (starts_at IS NULL OR starts_at = \'\' OR starts_at <= ?) AND (ends_at IS NULL OR ends_at = \'\' OR ends_at >= ?)', [$now, $now]) as $ad) {
            $all[$ad['position']][] = $ad;
        }
    }
    return $all[$position] ?? [];
}

/** Pick one ad by weight. Direct campaigns win over AdSense when both are active for a position. */
function pick_ad(array $ads): ?array
{
    if (!$ads) {
        return null;
    }
    $direct = array_values(array_filter($ads, fn ($a) => $a['type'] !== 'adsense'));
    $pool = $direct ?: $ads;
    $total = array_sum(array_map(fn ($a) => max(1, (int) $a['weight']), $pool));
    $r = random_int(1, max(1, $total));
    foreach ($pool as $a) {
        $r -= max(1, (int) $a['weight']);
        if ($r <= 0) {
            return $a;
        }
    }
    return $pool[0];
}

/** HTML for an ad position ('' when nothing is configured). */
function ad(string $position): string
{
    if (!ads_enabled()) {
        return '';
    }
    $ad = pick_ad(ads_for($position));
    if (!$ad) {
        return '';
    }
    $inner = '';
    if ($ad['type'] === 'adsense') {
        $client = adsense_client();
        if ($client === '' || trim((string) $ad['adsense_slot']) === '') {
            return '';
        }
        $format = $ad['adsense_format'] ?: 'auto';
        $attrs = 'class="adsbygoogle" style="display:block" data-ad-client="' . e($client) . '" data-ad-slot="' . e($ad['adsense_slot']) . '"';
        if ($format === 'in-article') {
            $attrs .= ' data-ad-layout="in-article" data-ad-format="fluid" style="display:block;text-align:center"';
        } elseif ($format === 'fluid') {
            $attrs .= ' data-ad-format="fluid"';
        } else {
            $attrs .= ' data-ad-format="' . e($format) . '" data-full-width-responsive="true"';
        }
        $inner = '<ins ' . $attrs . '></ins>';
    } elseif ($ad['type'] === 'image' && $ad['image']) {
        $inner = '<a href="' . e(url('api/ad-click/' . $ad['id'])) . '" rel="sponsored noopener" target="_blank">'
            . '<img src="' . e(url($ad['image'])) . '" alt="' . e($ad['advertiser'] ?: $ad['name']) . '" loading="lazy"></a>';
    } elseif ($ad['type'] === 'html') {
        $inner = (string) $ad['html']; // entered by an administrator only
    }
    if ($inner === '') {
        return '';
    }
    $track = $ad['type'] === 'adsense' ? '' : ' data-ad-id="' . (int) $ad['id'] . '"';
    return '<div class="ad ad-' . e($position) . '"' . $track . '><span class="ad-label">Advertisement</span>' . $inner . '</div>';
}

/** Count impressions sent by the page beacon (ids of direct ads that were on screen). */
function ads_count_impressions(array $ids): void
{
    $ids = array_slice(array_values(array_unique(array_filter(array_map('intval', $ids)))), 0, 12);
    if ($ids) {
        q('UPDATE ads SET impressions = impressions + 1 WHERE id IN (' . placeholders($ids) . ") AND type <> 'adsense'", $ids);
    }
}
