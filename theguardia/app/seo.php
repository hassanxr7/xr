<?php
/**
 * The Guardia — SEO: meta tags, Open Graph, JSON-LD (NewsArticle etc.), sitemaps, RSS, robots, IndexNow.
 */
defined('APP') || exit;

/** Set/merge SEO values for the current page. */
function seo(array $values = []): array
{
    static $seo = [
        'title' => '', 'description' => '', 'canonical' => '', 'image' => '', 'image_w' => 1200, 'image_h' => 630,
        'type' => 'website', 'robots' => 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1',
        'jsonld' => [], 'published' => '', 'modified' => '', 'section' => '', 'tags' => [], 'author' => '', 'lang' => 'en',
        'feed' => '', 'news_keywords' => '',
    ];
    foreach ($values as $k => $v) {
        if ($k === 'jsonld') {
            $seo['jsonld'][] = $v;
        } else {
            $seo[$k] = $v;
        }
    }
    return $seo;
}

function seo_title(string $title = ''): string
{
    $name = site_name();
    if ($title === '') {
        $tag = setting('tagline', 'Independent news since 2015');
        return $name . ' | ' . $tag;
    }
    return mb_strlen($title) > 58 ? $title : $title . ' | ' . $name;
}

/** All <head> SEO tags. */
function seo_head(): string
{
    $s = seo();
    $title = seo_title($s['title']);
    $desc = str_limit($s['description'] ?: setting('site_description', 'Breaking news, court reports and in-depth journalism from Canada and around the world.'), 160);
    $canonical = $s['canonical'] ?: abs_url(strtok($_SERVER['REQUEST_URI'] ?? '/', '?') ?: '/');
    $image = $s['image'] ?: abs_url(setting('og_image', 'assets/img/og-default.png'));
    $h = [];
    $h[] = '<title>' . e($title) . '</title>';
    $h[] = '<meta name="description" content="' . e($desc) . '">';
    $h[] = '<link rel="canonical" href="' . e($canonical) . '">';
    $h[] = '<meta name="robots" content="' . e($s['robots']) . '">';
    $h[] = '<meta property="og:site_name" content="' . e(site_name()) . '">';
    $h[] = '<meta property="og:type" content="' . e($s['type']) . '">';
    $h[] = '<meta property="og:title" content="' . e($s['title'] ?: site_name()) . '">';
    $h[] = '<meta property="og:description" content="' . e($desc) . '">';
    $h[] = '<meta property="og:url" content="' . e($canonical) . '">';
    $h[] = '<meta property="og:image" content="' . e($image) . '">';
    $h[] = '<meta property="og:image:width" content="' . (int) $s['image_w'] . '">';
    $h[] = '<meta property="og:image:height" content="' . (int) $s['image_h'] . '">';
    $h[] = '<meta property="og:locale" content="' . ($s['lang'] === 'so' ? 'so_SO' : 'en_CA') . '">';
    $h[] = '<meta name="twitter:card" content="summary_large_image">';
    if ($x = setting('social_x')) {
        $h[] = '<meta name="twitter:site" content="@' . e(ltrim(basename((string) parse_url($x, PHP_URL_PATH)), '@')) . '">';
    }
    if ($fb = setting('fb_app_id')) {
        $h[] = '<meta property="fb:app_id" content="' . e($fb) . '">';
    }
    if ($s['type'] === 'article') {
        $h[] = '<meta property="article:published_time" content="' . e(date('c', strtotime($s['published']))) . '">';
        $h[] = '<meta property="article:modified_time" content="' . e(date('c', strtotime($s['modified'] ?: $s['published']))) . '">';
        if ($s['section']) {
            $h[] = '<meta property="article:section" content="' . e($s['section']) . '">';
        }
        foreach (array_slice($s['tags'], 0, 10) as $t) {
            $h[] = '<meta property="article:tag" content="' . e($t) . '">';
        }
        if ($s['author']) {
            $h[] = '<meta name="author" content="' . e($s['author']) . '">';
        }
        if ($s['news_keywords']) {
            $h[] = '<meta name="news_keywords" content="' . e($s['news_keywords']) . '">';
        }
    }
    foreach (['google_verification' => 'google-site-verification', 'bing_verification' => 'msvalidate.01', 'yandex_verification' => 'yandex-verification', 'fb_domain_verification' => 'facebook-domain-verification'] as $key => $name) {
        if ($v = setting($key)) {
            $h[] = '<meta name="' . $name . '" content="' . e($v) . '">';
        }
    }
    if (($client = adsense_client()) !== '') {
        $h[] = '<meta name="google-adsense-account" content="' . e($client) . '">';
    }
    $h[] = '<link rel="alternate" type="application/rss+xml" title="' . e(site_name()) . '" href="' . e(abs_url('feed')) . '">';
    if ($s['feed']) {
        $h[] = '<link rel="alternate" type="application/rss+xml" title="' . e(site_name() . ' – ' . $s['section']) . '" href="' . e($s['feed']) . '">';
    }
    $graph = array_merge([organization_jsonld(), website_jsonld()], $s['jsonld']);
    $h[] = '<script type="application/ld+json" nonce="' . e(csp_nonce()) . '">'
        . json_encode(['@context' => 'https://schema.org', '@graph' => $graph], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG)
        . '</script>';
    return implode("\n", $h) . "\n";
}

function organization_jsonld(): array
{
    $same = array_values(array_filter(array_map('setting', ['social_facebook', 'social_x', 'social_instagram', 'social_youtube', 'social_tiktok', 'social_linkedin', 'social_telegram'])));
    $org = [
        '@type' => 'NewsMediaOrganization',
        '@id'   => abs_url('#organization'),
        'name'  => site_name(),
        'url'   => abs_url(''),
        'logo'  => ['@type' => 'ImageObject', 'url' => abs_url('assets/img/icon-512.png'), 'width' => 512, 'height' => 512],
        'foundingDate' => setting('founding_year', '2015'),
    ];
    if ($same) {
        $org['sameAs'] = $same;
    }
    foreach (['publishingPrinciples' => 'editorial-standards', 'correctionsPolicy' => 'corrections', 'ethicsPolicy' => 'editorial-standards', 'masthead' => 'about'] as $prop => $slug) {
        if (page_by_slug($slug)) {
            $org[$prop] = abs_url($slug);
        }
    }
    if ($email = setting('contact_email')) {
        $org['contactPoint'] = ['@type' => 'ContactPoint', 'contactType' => 'newsroom', 'email' => $email];
    }
    return $org;
}

function website_jsonld(): array
{
    return [
        '@type'     => 'WebSite',
        '@id'       => abs_url('#website'),
        'url'       => abs_url(''),
        'name'      => site_name(),
        'publisher' => ['@id' => abs_url('#organization')],
        'inLanguage' => 'en-CA',
        'potentialAction' => [
            '@type' => 'SearchAction',
            'target' => ['@type' => 'EntryPoint', 'urlTemplate' => abs_url('search') . '?q={search_term_string}'],
            'query-input' => 'required name=search_term_string',
        ],
    ];
}

function article_jsonld(array $a, array $img, array $tags): array
{
    $author = author((int) $a['author_id']);
    $authorLd = $author && empty($a['byline'])
        ? ['@type' => 'Person', 'name' => $author['name'], 'url' => abs_url('author/' . $author['slug'])]
        : ['@type' => 'Organization', 'name' => article_byline($a), 'url' => abs_url('')];
    $cat = category((int) $a['category_id']);
    $ld = [
        '@type'            => 'NewsArticle',
        '@id'              => article_url($a, true) . '#article',
        'mainEntityOfPage' => article_url($a, true),
        'headline'         => mb_substr($a['title'], 0, 110),
        'description'      => str_limit($a['seo_description'] ?: ($a['standfirst'] ?: plain_text((string) $a['body'])), 300),
        'image'            => [['@type' => 'ImageObject', 'url' => $img['abs'], 'width' => $img['width'], 'height' => $img['height']]],
        'datePublished'    => date('c', strtotime($a['published_at'])),
        'dateModified'     => date('c', strtotime($a['updated_at'] ?: $a['published_at'])),
        'author'           => [$authorLd],
        'publisher'        => ['@id' => abs_url('#organization')],
        'isAccessibleForFree' => true,
        'inLanguage'       => $a['lang'] === 'so' ? 'so' : 'en',
        'wordCount'        => (int) $a['word_count'],
    ];
    if ($cat) {
        $ld['articleSection'] = $cat['name'];
    }
    if ($tags) {
        $ld['keywords'] = implode(', ', array_column($tags, 'name'));
    }
    if ($a['location']) {
        $ld['contentLocation'] = ['@type' => 'Place', 'name' => $a['location']];
    }
    if ($a['source_url']) {
        $ld['isBasedOn'] = $a['source_url'];
    }
    return $ld;
}

/** BreadcrumbList from [[name, url], ...]. */
function breadcrumb_jsonld(array $items): array
{
    $list = [];
    foreach (array_values($items) as $i => [$name, $u]) {
        $list[] = ['@type' => 'ListItem', 'position' => $i + 1, 'name' => $name, 'item' => abs_url($u)];
    }
    return ['@type' => 'BreadcrumbList', 'itemListElement' => $list];
}

function itemlist_jsonld(array $articles): array
{
    $items = [];
    foreach (array_values($articles) as $i => $a) {
        $items[] = ['@type' => 'ListItem', 'position' => $i + 1, 'url' => article_url($a, true)];
    }
    return ['@type' => 'ItemList', 'itemListElement' => $items];
}

/** The canonical URL for a story (self, or the original source for imports that point there). */
function article_canonical(array $a): string
{
    return $a['canonical_url'] ?: article_url($a, true);
}

// ---------------------------------------------------------------------------
// Sitemaps (each file holds up to 50,000 URLs — the limit search engines accept)
// ---------------------------------------------------------------------------

function sitemap_size(): int
{
    return min(50000, max(1000, (int) setting('sitemap_size', '50000')));
}

/** Stories that belong in sitemaps: published, indexable, canonical on this site. */
function sitemap_article_where(): string
{
    return published_sql() . " AND a.noindex = 0 AND (a.canonical_url IS NULL OR a.canonical_url = '')";
}

function xml_header(): void
{
    header('Content-Type: application/xml; charset=utf-8');
    header('X-Robots-Tag: noindex');
    echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
}

function x($s): string
{
    return htmlspecialchars((string) $s, ENT_XML1 | ENT_QUOTES, 'UTF-8');
}

function sitemap_index(): void
{
    $size = sitemap_size();
    $total = (int) val('SELECT COUNT(*) FROM articles a WHERE ' . sitemap_article_where());
    $tags = (int) val('SELECT COUNT(*) FROM tags');
    xml_header();
    echo '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";
    $now = date('c');
    $entry = fn ($path, $mod = null) => '<sitemap><loc>' . x(abs_url($path)) . '</loc><lastmod>' . x($mod ?: $now) . "</lastmod></sitemap>\n";
    echo $entry('news-sitemap.xml');
    echo $entry('sitemap-pages.xml');
    echo $entry('sitemap-categories.xml');
    for ($i = 1, $n = max(1, (int) ceil($total / $size)); $i <= $n; $i++) {
        $mod = val('SELECT MAX(COALESCE(a.updated_at, a.published_at)) FROM (SELECT updated_at, published_at FROM articles a WHERE ' . sitemap_article_where() . ' ORDER BY a.id LIMIT ? OFFSET ?) a', [$size, ($i - 1) * $size]);
        echo $entry('sitemap-articles-' . $i . '.xml', $mod ? date('c', strtotime($mod)) : null);
    }
    for ($i = 1, $n = max(1, (int) ceil($tags / $size)); $i <= $n; $i++) {
        echo $entry('sitemap-tags-' . $i . '.xml');
    }
    if ((int) val("SELECT COUNT(*) FROM photos WHERE status = 'active'")) {
        echo $entry('sitemap-photos.xml');
    }
    echo '</sitemapindex>';
}

function sitemap_articles(int $page): void
{
    $size = sitemap_size();
    xml_header();
    echo '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">' . "\n";
    $st = q('SELECT a.id, a.slug, a.title, a.published_at, a.updated_at, a.image_id, a.category_id FROM articles a WHERE ' . sitemap_article_where()
        . ' ORDER BY a.id LIMIT ? OFFSET ?', [$size, ($page - 1) * $size]);
    while ($a = $st->fetch()) {
        echo '<url><loc>' . x(article_url($a, true)) . '</loc><lastmod>' . x(date('c', strtotime($a['updated_at'] ?: $a['published_at']))) . '</lastmod>';
        if ($a['image_id'] && ($m = media((int) $a['image_id']))) {
            echo '<image:image><image:loc>' . x(media_url($m, 1200, true)) . '</image:loc></image:image>';
        }
        echo "</url>\n";
    }
    echo '</urlset>';
}

/** Google News sitemap: stories from the last 48 hours (max 1,000). */
function sitemap_news(): void
{
    xml_header();
    echo '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">' . "\n";
    $list = rows('SELECT a.id, a.slug, a.title, a.published_at, a.lang FROM articles a WHERE ' . sitemap_article_where() . ' AND a.published_at >= ? ORDER BY a.published_at DESC LIMIT 1000',
        [date('Y-m-d H:i:s', time() - 48 * 3600)]);
    foreach ($list as $a) {
        echo '<url><loc>' . x(article_url($a, true)) . '</loc><news:news><news:publication><news:name>' . x(site_name()) . '</news:name>'
            . '<news:language>' . x($a['lang'] ?: 'en') . '</news:language></news:publication>'
            . '<news:publication_date>' . x(date('c', strtotime($a['published_at']))) . '</news:publication_date>'
            . '<news:title>' . x($a['title']) . "</news:title></news:news></url>\n";
    }
    echo '</urlset>';
}

function sitemap_simple(array $urls): void
{
    xml_header();
    echo '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";
    foreach ($urls as [$loc, $mod, $freq]) {
        echo '<url><loc>' . x($loc) . '</loc>' . ($mod ? '<lastmod>' . x(date('c', strtotime($mod))) . '</lastmod>' : '')
            . ($freq ? '<changefreq>' . $freq . '</changefreq>' : '') . "</url>\n";
    }
    echo '</urlset>';
}

function sitemap_pages(): void
{
    $urls = [[abs_url(''), now(), 'always'], [abs_url('latest'), now(), 'always'], [abs_url('archive'), now(), 'daily'], [abs_url('photos'), null, 'daily']];
    foreach (rows('SELECT slug, updated_at FROM pages') as $p) {
        $urls[] = [abs_url($p['slug']), $p['updated_at'], 'monthly'];
    }
    foreach (rows("SELECT u.slug FROM users u WHERE EXISTS (SELECT 1 FROM articles a WHERE a.author_id = u.id AND a.status = 'published')") as $u) {
        $urls[] = [abs_url('author/' . $u['slug']), null, 'weekly'];
    }
    sitemap_simple($urls);
}

function sitemap_categories(): void
{
    $urls = [];
    foreach (categories() as $c) {
        $urls[] = [abs_url($c['slug']), null, 'hourly'];
    }
    sitemap_simple($urls);
}

function sitemap_tags(int $page): void
{
    $size = sitemap_size();
    // Only tags with at least two stories (thin tag pages are noindex).
    $list = rows('SELECT t.slug FROM tags t JOIN article_tags x ON x.tag_id = t.id GROUP BY t.id HAVING COUNT(*) >= 2 ORDER BY t.id LIMIT ? OFFSET ?', [$size, ($page - 1) * $size]);
    sitemap_simple(array_map(fn ($t) => [abs_url('tag/' . $t['slug']), null, 'daily'], $list));
}

function sitemap_photos(): void
{
    xml_header();
    echo '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">' . "\n";
    foreach (rows("SELECT slug, preview, created_at FROM photos WHERE status = 'active' ORDER BY id DESC LIMIT 50000") as $p) {
        echo '<url><loc>' . x(abs_url('photos/' . $p['slug'])) . '</loc><image:image><image:loc>' . x(abs_url($p['preview'])) . "</image:loc></image:image></url>\n";
    }
    echo '</urlset>';
}

/** Serve a sitemap from a 1-hour file cache (big sitemaps are expensive to build). */
function sitemap_cached(string $name, callable $build): void
{
    $file = cache_dir('sitemaps') . '/' . preg_replace('~[^a-z0-9\-]~', '', $name) . '-' . md5(content_version()) . '.xml';
    if (!is_file($file) || filemtime($file) < time() - 3600) {
        ob_start();
        $build();
        file_put_contents($file, ob_get_clean(), LOCK_EX);
        foreach (glob(cache_dir('sitemaps') . '/' . preg_replace('~[^a-z0-9\-]~', '', $name) . '-*.xml') ?: [] as $old) {
            if ($old !== $file) {
                @unlink($old);
            }
        }
    }
    header('Content-Type: application/xml; charset=utf-8');
    header('X-Robots-Tag: noindex');
    readfile($file);
}

// ---------------------------------------------------------------------------
// RSS, robots.txt, ads.txt, IndexNow
// ---------------------------------------------------------------------------

function rss_feed(array $articles, string $title, string $link): void
{
    header('Content-Type: application/rss+xml; charset=utf-8');
    echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
    echo '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel>';
    echo '<title>' . x($title) . '</title><link>' . x($link) . '</link><description>' . x(setting('site_description', $title)) . '</description>';
    echo '<language>en-ca</language><lastBuildDate>' . date(DATE_RSS) . '</lastBuildDate>';
    echo '<atom:link href="' . x(abs_url(ltrim(substr(strtok($_SERVER['REQUEST_URI'] ?? '/feed', '?'), strlen(base_url())), '/'))) . '" rel="self" type="application/rss+xml"/>';
    echo '<image><url>' . x(abs_url('assets/img/icon-192.png')) . '</url><title>' . x($title) . '</title><link>' . x($link) . '</link></image>';
    media_prefetch($articles);
    foreach ($articles as $a) {
        $img = article_image($a);
        $cat = category((int) $a['category_id']);
        echo '<item><title>' . x($a['title']) . '</title><link>' . x(article_url($a, true)) . '</link><guid isPermaLink="true">' . x(article_url($a, true)) . '</guid>';
        echo '<pubDate>' . date(DATE_RSS, strtotime($a['published_at'])) . '</pubDate><dc:creator>' . x(article_byline($a)) . '</dc:creator>';
        if ($cat) {
            echo '<category>' . x($cat['name']) . '</category>';
        }
        echo '<description>' . x($a['standfirst'] ?: '') . '</description>';
        echo '<media:content url="' . x($img['abs']) . '" medium="image" width="' . (int) $img['width'] . '" height="' . (int) $img['height'] . '"/>';
        echo '</item>';
    }
    echo '</channel></rss>';
}

function robots_txt(): string
{
    $lines = [
        'User-agent: *',
        'Allow: /',
        'Disallow: ' . url('admin/'),
        'Disallow: ' . url('api/'),
        'Disallow: ' . url('search'),
        'Disallow: ' . url('photos/download/'),
        '',
    ];
    if ($extra = trim(setting('robots_extra'))) {
        $lines[] = $extra;
        $lines[] = '';
    }
    $lines[] = 'Sitemap: ' . abs_url('sitemap.xml');
    $lines[] = 'Sitemap: ' . abs_url('news-sitemap.xml');
    return implode("\n", $lines) . "\n";
}

function ads_txt(): string
{
    $out = [];
    $pub = trim(setting('adsense_client'));
    if ($pub !== '') {
        $out[] = 'google.com, ' . preg_replace('~^ca-~', '', $pub) . ', DIRECT, f08c47fec0942fa0';
    }
    if ($extra = trim(setting('ads_txt_extra'))) {
        $out[] = $extra;
    }
    return implode("\n", $out) . "\n";
}

/** Tell Bing, Yandex, Seznam, Naver … about new or updated URLs instantly (https://www.indexnow.org). */
function indexnow_ping(array $urls): bool
{
    $key = setting('indexnow_key');
    if ($key === '' || setting('indexnow_enabled', '1') !== '1' || !$urls) {
        return false;
    }
    $host = (string) parse_url(site_origin(), PHP_URL_HOST);
    if ($host === '' || $host === 'localhost' || filter_var($host, FILTER_VALIDATE_IP)) {
        return false;
    }
    $body = json_encode(['host' => $host, 'key' => $key, 'keyLocation' => abs_url($key . '.txt'), 'urlList' => array_values(array_slice($urls, 0, 10000))]);
    $r = http_request('POST', 'https://api.indexnow.org/indexnow', ['Content-Type: application/json; charset=utf-8'], $body, 6);
    return $r['status'] >= 200 && $r['status'] < 300;
}
