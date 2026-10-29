<?php
/**
 * The Guardia — public routes and page controllers.
 */
defined('APP') || exit;

const PER_PAGE = 20;

function route(string $path): void
{
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

    // Machine endpoints first (never cached as HTML pages).
    switch (true) {
        case $path === 'robots.txt':
            header('Content-Type: text/plain; charset=utf-8');
            exit(robots_txt());
        case $path === 'ads.txt':
            header('Content-Type: text/plain; charset=utf-8');
            exit(ads_txt());
        case $path === 'sitemap.xml':
            sitemap_cached('index', 'sitemap_index');
            exit;
        case $path === 'news-sitemap.xml':
            sitemap_news();
            exit;
        case $path === 'sitemap-pages.xml':
            sitemap_cached('pages', 'sitemap_pages');
            exit;
        case $path === 'sitemap-categories.xml':
            sitemap_cached('categories', 'sitemap_categories');
            exit;
        case $path === 'sitemap-photos.xml':
            sitemap_cached('photos', 'sitemap_photos');
            exit;
        case (bool) preg_match('~^sitemap-articles-(\d{1,4})\.xml$~', $path, $m):
            sitemap_cached('articles-' . (int) $m[1], fn () => sitemap_articles(max(1, (int) $m[1])));
            exit;
        case (bool) preg_match('~^sitemap-tags-(\d{1,4})\.xml$~', $path, $m):
            sitemap_cached('tags-' . (int) $m[1], fn () => sitemap_tags(max(1, (int) $m[1])));
            exit;
        case $path === 'manifest.webmanifest':
            manifest();
            exit;
        case setting('indexnow_key') !== '' && $path === setting('indexnow_key') . '.txt':
            header('Content-Type: text/plain; charset=utf-8');
            exit(setting('indexnow_key'));
        case $path === 'feed' || $path === 'rss':
            rss_feed(latest_articles(50), site_name(), abs_url(''));
            exit;
        case (bool) preg_match('~^feed/([a-z0-9\-]+)$~', $path, $m):
            $c = category_by_slug($m[1]);
            if (!$c) {
                not_found();
            }
            rss_feed(latest_articles(50, 0, category_tree_ids((int) $c['id'])), site_name() . ' – ' . $c['name'], abs_url($c['slug']));
            exit;
        case strpos($path, 'api/') === 0:
            api_route(substr($path, 4), $method);
            exit;
        case (bool) preg_match('~^photos/download/([A-Za-z0-9_\-]{20,})$~', $path, $m):
            photo_download($m[1]);
            exit;
    }

    if ($method === 'POST') {
        start_session();
        if ($path === 'contact') {
            contact_submit();
        } elseif (preg_match('~^photos/([a-z0-9\-]+)/buy$~', $path, $m)) {
            photo_buy($m[1]);
        }
        not_found();
    }

    // HTML pages — try the page cache first.
    page_cache_serve();
    if (has_session_cookie()) {
        start_session();
    }

    if ($path === '') {
        render('home', home_data());
    } elseif ($path === 'latest') {
        list_page('latest');
    } elseif ($path === 'search') {
        search_page();
    } elseif ($path === 'archive') {
        archive_index();
    } elseif (preg_match('~^archive/(\d{4})(?:/(\d{2}))?$~', $path, $m)) {
        archive_month((int) $m[1], isset($m[2]) ? (int) $m[2] : 0);
    } elseif (preg_match('~^tag/([a-z0-9\-]+)$~', $path, $m)) {
        list_page('tag', $m[1]);
    } elseif (preg_match('~^author/([a-z0-9\-]+)$~', $path, $m)) {
        list_page('author', $m[1]);
    } elseif ($path === 'photos') {
        photos_index();
    } elseif (preg_match('~^photos/order/([A-Za-z0-9]{6,})$~', $path, $m)) {
        photo_order_page($m[1]);
    } elseif (preg_match('~^photos/([a-z0-9\-]+)$~', $path, $m)) {
        photo_page($m[1]);
    } elseif ($path === 'contact') {
        start_session();
        render('contact', ['sent' => !empty($_GET['sent'])]);
    } elseif ($path === 'offline') {
        render('offline', []);
    } elseif (preg_match('~^(\d{4})/(\d{2})/(\d{2})/([a-z0-9\-]+)$~', $path, $m)) {
        article_page($m[4], "$m[1]-$m[2]-$m[3]");
    } elseif (preg_match('~^[a-z0-9\-]+$~', $path)) {
        if ($p = page_by_slug($path)) {
            static_page($p);
        } elseif ($c = category_by_slug($path)) {
            list_page('category', $path);
        }
    }
    try_redirect($path);
    not_found();
}

/** Render a view inside the site layout, send it and store it in the page cache. */
function render(string $view, array $vars, int $status = 200): void
{
    http_response_code($status);
    $content = view($view, $vars);
    $html = view('layout', ['content' => $content, 'view' => $view] + $vars);
    send_public_headers();
    header('Content-Type: text/html; charset=utf-8');
    if ($status === 200 && session_status() !== PHP_SESSION_ACTIVE) {
        header('Cache-Control: public, max-age=60');
        page_cache_store($html);
    } else {
        header('Cache-Control: no-store');
    }
    echo $html;
    exit;
}

function view(string $name, array $vars = []): string
{
    extract($vars, EXTR_SKIP);
    ob_start();
    include APP_PATH . '/views/' . $name . '.php';
    return (string) ob_get_clean();
}

function not_found(): void
{
    seo(['title' => 'Page not found', 'robots' => 'noindex, follow']);
    render('404', ['latest' => latest_articles(6)], 404);
}

/** Old URLs (changed slugs) → 301 to the current address. */
function try_redirect(string $path): void
{
    $r = row('SELECT to_path FROM redirects WHERE from_path = ?', [$path]);
    if (!$r) {
        return;
    }
    if (strpos($r['to_path'], 'article:') === 0) {
        $a = article((int) substr($r['to_path'], 8));
        if ($a && $a['status'] === 'published') {
            redirect(article_url($a), 301);
        }
        return;
    }
    redirect($r['to_path'], 301);
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------

function home_data(): array
{
    $used = [];
    $featured = featured_articles(5);
    $top = $featured ?: latest_articles(5);
    if (count($top) < 5) {
        $top = array_merge($top, latest_articles(5 - count($top), 0, [], array_map('intval', array_column($top, 'id'))));
    }
    foreach ($top as $a) {
        $used[] = (int) $a['id'];
    }
    $latest = latest_articles(10, 0, [], $used);
    foreach ($latest as $a) {
        $used[] = (int) $a['id'];
    }
    $sections = [];
    foreach (categories() as $c) {
        if (!$c['on_home'] || $c['parent_id'] && !in_array($c['slug'], ['sex-offender-cases'], true)) {
            continue;
        }
        $list = latest_articles(5, 0, category_tree_ids((int) $c['id']), $used);
        if (count($list) >= 2) {
            $sections[] = ['cat' => $c, 'items' => $list];
            foreach ($list as $a) {
                $used[] = (int) $a['id'];
            }
        }
    }
    $all = array_merge($top, $latest, ...array_column($sections, 'items'));
    media_prefetch($all);
    seo([
        'title'       => '',
        'canonical'   => abs_url(''),
        'description' => setting('site_description', 'Breaking news, court reports and in-depth journalism from Canada and around the world.'),
        'jsonld'      => itemlist_jsonld(array_slice(array_merge($top, $latest), 0, 15)),
    ]);
    $photos = rows("SELECT * FROM photos WHERE status = 'active' ORDER BY id DESC LIMIT 4");
    return ['top' => $top, 'latest' => $latest, 'sections' => $sections, 'mostRead' => most_read(6), 'photos' => $photos];
}

// ---------------------------------------------------------------------------
// Article
// ---------------------------------------------------------------------------

function article_page(string $slug, string $date): void
{
    $a = article_by_slug($slug);
    $preview = $a && can('writer') && isset($_GET['preview']);
    if (!$a || ($a['status'] !== 'published' && !$preview) || ($a['status'] === 'published' && $a['published_at'] > now() && !$preview)) {
        try_redirect(trim(substr(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH), strlen(base_url())), '/'));
        not_found();
    }
    // Wrong date in the URL → canonical address.
    if (!$preview && date('Y-m-d', strtotime($a['published_at'])) !== $date) {
        redirect(article_url($a), 301);
    }
    $cat = category((int) $a['category_id']);
    $parent = $cat ? category((int) $cat['parent_id']) : null;
    $tags = article_tags((int) $a['id']);
    $img = article_image($a);
    [$body, $toc] = heading_anchors((string) $a['body']);

    // In-article ads after paragraphs N and N*2.5 (only on longer stories).
    $paras = substr_count($body, '</p>');
    $n = max(2, (int) setting('in_article_after', '3'));
    if ($paras > $n + 1) {
        $second = (int) round($n * 2.5);
        if ($paras > $second + 1) {
            $body = insert_after_paragraph($body, $second, ad('in_article_2'));
        }
        $body = insert_after_paragraph($body, $n, ad('in_article'));
    }

    $crumbs = [[site_name(), '']];
    if ($parent) {
        $crumbs[] = [$parent['name'], $parent['slug']];
    }
    if ($cat) {
        $crumbs[] = [$cat['name'], $cat['slug']];
    }
    $crumbs[] = [$a['title'], ltrim(substr(article_url($a), strlen(base_url())), '/')];

    $related = related_articles($a, 4);
    media_prefetch($related);
    seo([
        'title'         => $a['seo_title'] ?: $a['title'],
        'description'   => $a['seo_description'] ?: ($a['standfirst'] ?: str_limit(plain_text((string) $a['body']), 160)),
        'canonical'     => article_canonical($a),
        'image'         => $img['abs'],
        'image_w'       => $img['width'],
        'image_h'       => $img['height'],
        'type'          => 'article',
        'published'     => $a['published_at'],
        'modified'      => $a['updated_at'],
        'section'       => $cat['name'] ?? '',
        'tags'          => array_column($tags, 'name'),
        'author'        => article_byline($a),
        'lang'          => $a['lang'],
        'robots'        => $a['noindex'] || $a['status'] !== 'published' ? 'noindex, follow' : seo()['robots'],
        'news_keywords' => implode(', ', array_slice(array_column($tags, 'name'), 0, 8)),
        'jsonld'        => article_jsonld($a, $img, $tags),
    ]);
    seo(['jsonld' => breadcrumb_jsonld($crumbs)]);
    render('article', [
        'a' => $a, 'cat' => $cat, 'parent' => $parent, 'tags' => $tags, 'img' => $img, 'body' => $body, 'toc' => $toc,
        'related' => $related, 'mostRead' => most_read(5), 'author' => author((int) $a['author_id']), 'preview' => $preview,
    ]);
}

// ---------------------------------------------------------------------------
// Lists: category, tag, author, latest, search, archive
// ---------------------------------------------------------------------------

function current_page(): int
{
    return max(1, min(5000, (int) ($_GET['page'] ?? 1)));
}

function list_page(string $type, string $slug = ''): void
{
    $page = current_page();
    $offset = ($page - 1) * PER_PAGE;
    $title = $intro = '';
    $base = '';
    $children = [];
    $robots = null;
    $feed = '';
    switch ($type) {
        case 'category':
            $c = category_by_slug($slug);
            $ids = category_tree_ids((int) $c['id']);
            $items = latest_articles(PER_PAGE, $offset, $ids);
            $total = count_articles($ids);
            $title = $c['name'];
            $intro = (string) $c['description'];
            $base = $c['slug'];
            $children = category_children((int) $c['id']);
            $feed = abs_url('feed/' . $c['slug']);
            seo(['title' => ($c['seo_title'] ?: $c['name'] . ' – latest news') . ($page > 1 ? " – page $page" : ''), 'section' => $c['name'], 'feed' => $feed]);
            $parent = category((int) $c['parent_id']);
            seo(['jsonld' => breadcrumb_jsonld(array_filter([[site_name(), ''], $parent ? [$parent['name'], $parent['slug']] : null, [$c['name'], $c['slug']]]))]);
            break;
        case 'tag':
            $t = row('SELECT * FROM tags WHERE slug = ?', [$slug]);
            if (!$t) {
                not_found();
            }
            $total = (int) val('SELECT COUNT(*) FROM article_tags x JOIN articles a ON a.id = x.article_id WHERE x.tag_id = ? AND ' . published_sql(), [$t['id']]);
            $items = rows('SELECT ' . CARD_COLS . ' FROM article_tags x JOIN articles a ON a.id = x.article_id WHERE x.tag_id = ? AND ' . published_sql()
                . ' ORDER BY a.published_at DESC LIMIT ? OFFSET ?', [$t['id'], PER_PAGE, $offset]);
            $title = $t['name'];
            $intro = (string) $t['description'];
            $base = 'tag/' . $t['slug'];
            seo(['title' => $t['name'] . ' – news and updates' . ($page > 1 ? " – page $page" : '')]);
            if ($total < 2) {
                $robots = 'noindex, follow';
            }
            break;
        case 'author':
            $u = row("SELECT * FROM users WHERE slug = ? AND status = 'active'", [$slug]);
            if (!$u) {
                not_found();
            }
            $total = (int) val('SELECT COUNT(*) FROM articles a WHERE a.author_id = ? AND ' . published_sql(), [$u['id']]);
            $items = rows('SELECT ' . CARD_COLS . ' FROM articles a WHERE a.author_id = ? AND ' . published_sql() . ' ORDER BY a.published_at DESC LIMIT ? OFFSET ?', [$u['id'], PER_PAGE, $offset]);
            $title = $u['name'];
            $intro = trim(($u['title'] ? $u['title'] . '. ' : '') . $u['bio']);
            $base = 'author/' . $u['slug'];
            seo(['title' => $u['name'] . ($u['title'] ? ', ' . $u['title'] : '') . ($page > 1 ? " – page $page" : '')]);
            seo(['jsonld' => ['@type' => 'ProfilePage', 'mainEntity' => ['@type' => 'Person', 'name' => $u['name'], 'jobTitle' => $u['title'] ?: null, 'description' => $u['bio'] ?: null, 'url' => abs_url($base)]]]);
            break;
        default: // latest
            $items = latest_articles(PER_PAGE, $offset);
            $total = count_articles();
            $title = 'Latest news';
            $intro = 'Every story, newest first.';
            $base = 'latest';
            seo(['title' => 'Latest news' . ($page > 1 ? " – page $page" : '')]);
    }
    $pages = max(1, (int) ceil($total / PER_PAGE));
    if ($page > $pages && $page > 1) {
        not_found();
    }
    media_prefetch($items);
    seo(['canonical' => abs_url($base) . ($page > 1 ? '?page=' . $page : ''), 'description' => $intro ?: $title . ' – the latest news, analysis and reports from ' . site_name() . '.']);
    if ($robots) {
        seo(['robots' => $robots]);
    }
    if ($items) {
        seo(['jsonld' => ['@type' => 'CollectionPage', 'name' => $title, 'url' => abs_url($base), 'isPartOf' => ['@id' => abs_url('#website')]]]);
    }
    render('list', [
        'type' => $type, 'title' => $title, 'intro' => $intro, 'items' => $items, 'page' => $page, 'pages' => $pages, 'total' => $total,
        'base' => $base, 'children' => $children, 'mostRead' => most_read(5), 'feed' => $feed, 'category' => $type === 'category' ? category_by_slug($slug) : null,
    ]);
}

function search_page(): void
{
    $q = mb_substr(trim((string) ($_GET['q'] ?? '')), 0, 100);
    $page = current_page();
    [$items, $total] = $q !== '' ? search_articles($q, PER_PAGE, ($page - 1) * PER_PAGE) : [[], 0];
    media_prefetch($items);
    seo(['title' => $q !== '' ? 'Search: ' . $q : 'Search', 'robots' => 'noindex, follow']);
    render('list', [
        'type' => 'search', 'title' => $q !== '' ? 'Results for “' . $q . '”' : 'Search', 'intro' => $q !== '' ? fmt_num($total) . ' stories found' : '',
        'items' => $items, 'page' => $page, 'pages' => max(1, (int) ceil($total / PER_PAGE)), 'total' => $total, 'base' => 'search?q=' . rawurlencode($q),
        'children' => [], 'mostRead' => most_read(5), 'q' => $q, 'feed' => '', 'category' => null,
    ]);
}

function archive_index(): void
{
    $years = rows("SELECT substr(published_at, 1, 7) ym, COUNT(*) n FROM articles a WHERE " . published_sql() . ' GROUP BY ym ORDER BY ym DESC');
    $byYear = [];
    foreach ($years as $r) {
        $byYear[substr($r['ym'], 0, 4)][(int) substr($r['ym'], 5, 2)] = (int) $r['n'];
    }
    seo(['title' => 'News archive since ' . setting('founding_year', '2015'), 'description' => 'Browse every story published by ' . site_name() . ' by year and month.']);
    render('archive', ['byYear' => $byYear]);
}

function archive_month(int $year, int $month): void
{
    $page = current_page();
    if ($month) {
        $from = sprintf('%04d-%02d-01 00:00:00', $year, $month);
        $to = date('Y-m-d H:i:s', strtotime($from . ' +1 month'));
        $label = date('F Y', strtotime($from));
        $base = sprintf('archive/%04d/%02d', $year, $month);
    } else {
        $from = "$year-01-01 00:00:00";
        $to = ($year + 1) . '-01-01 00:00:00';
        $label = (string) $year;
        $base = "archive/$year";
    }
    $total = (int) val('SELECT COUNT(*) FROM articles a WHERE ' . published_sql() . ' AND a.published_at >= ? AND a.published_at < ?', [$from, $to]);
    if (!$total) {
        not_found();
    }
    $items = rows('SELECT ' . CARD_COLS . ' FROM articles a WHERE ' . published_sql() . ' AND a.published_at >= ? AND a.published_at < ? ORDER BY a.published_at DESC LIMIT ? OFFSET ?',
        [$from, $to, PER_PAGE, ($page - 1) * PER_PAGE]);
    media_prefetch($items);
    seo(['title' => 'News from ' . $label . ($page > 1 ? " – page $page" : ''), 'canonical' => abs_url($base) . ($page > 1 ? '?page=' . $page : '')]);
    render('list', [
        'type' => 'archive', 'title' => 'News from ' . $label, 'intro' => fmt_num($total) . ' stories', 'items' => $items, 'page' => $page,
        'pages' => max(1, (int) ceil($total / PER_PAGE)), 'total' => $total, 'base' => $base, 'children' => [], 'mostRead' => most_read(5), 'feed' => '', 'category' => null,
    ]);
}

function static_page(array $p): void
{
    seo(['title' => $p['title'], 'description' => str_limit(plain_text((string) $p['body']), 160), 'canonical' => abs_url($p['slug'])]);
    render('page', ['p' => $p]);
}

function contact_submit(): void
{
    csrf_check();
    $name = mb_substr(trim((string) ($_POST['name'] ?? '')), 0, 100);
    $email = trim((string) ($_POST['email'] ?? ''));
    $subject = mb_substr(trim((string) ($_POST['subject'] ?? '')), 0, 150);
    $message = mb_substr(trim((string) ($_POST['message'] ?? '')), 0, 5000);
    // Honeypot field: bots fill it, people never see it.
    if (!empty($_POST['website'])) {
        redirect('contact?sent=1');
    }
    if ($name === '' || !filter_var($email, FILTER_VALIDATE_EMAIL) || mb_strlen($message) < 10) {
        flash('error', 'Please enter your name, a valid email address and a message.');
        redirect('contact');
    }
    if (!rate_limit('contact', 5, 3600)) {
        flash('error', 'Too many messages. Please try again later.');
        redirect('contact');
    }
    insert('contact_messages', ['name' => $name, 'email' => $email, 'subject' => $subject, 'message' => $message, 'created_at' => now()]);
    if ($to = setting('contact_email')) {
        send_mail($to, '[Contact] ' . ($subject ?: $name), "From: $name <$email>\n\n$message");
    }
    redirect('contact?sent=1');
}

/**
 * Backup for hosts without a working cron job: when the real cron has not run for 10 minutes,
 * a reader's page view starts cron.php in the background (it answers at once and keeps working).
 */
function maybe_pseudo_cron(): void
{
    $last = setting('cron_last_run');
    $cli = setting('cron_last_cli');
    if (setting('pseudo_cron', '1') !== '1' || ($last !== '' && strtotime($last) > time() - 600)
        || ($cli !== '' && strtotime($cli) > time() - 1800) // a real cron job is working: never compete with it
        || cache_get('pseudo_cron') !== null) {
        return;
    }
    cache_set('pseudo_cron', 1, 300);
    $ch = curl_init(abs_url('cron.php') . '?key=' . rawurlencode(setting('cron_key')));
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 4, CURLOPT_CONNECTTIMEOUT => 3, CURLOPT_NOSIGNAL => true]);
    curl_exec($ch);
    curl_close($ch);
}

function manifest(): void
{
    header('Content-Type: application/manifest+json');
    echo json_encode([
        'name' => site_name(), 'short_name' => site_name(), 'start_url' => url('') . '?utm_source=pwa', 'scope' => url(''),
        'display' => 'standalone', 'background_color' => '#FAF8F4', 'theme_color' => '#121212',
        'icons' => [
            ['src' => url('assets/img/icon-192.png'), 'sizes' => '192x192', 'type' => 'image/png'],
            ['src' => url('assets/img/icon-512.png'), 'sizes' => '512x512', 'type' => 'image/png', 'purpose' => 'any maskable'],
        ],
    ], JSON_UNESCAPED_SLASHES);
}

// ---------------------------------------------------------------------------
// Small JSON API used by the site's JavaScript and outside services
// ---------------------------------------------------------------------------

function api_route(string $path, string $method): void
{
    if ($path === 'track' && $method === 'POST') {
        track_hit(json_input(8192));
        maybe_pseudo_cron();
        http_response_code(204);
        exit;
    }
    if ($path === 'push/subscribe' && $method === 'POST') {
        json_out(push_subscribe(json_input()));
    }
    if ($path === 'push/unsubscribe' && $method === 'POST') {
        $d = json_input();
        q('DELETE FROM push_subscriptions WHERE endpoint = ?', [(string) ($d['endpoint'] ?? '')]);
        json_out(['ok' => true]);
    }
    if (preg_match('~^push/click/(\d+)$~', $path, $m)) {
        q('UPDATE push_messages SET clicks = clicks + 1 WHERE id = ?', [(int) $m[1]]);
        http_response_code(204);
        exit;
    }
    if (preg_match('~^ad-click/(\d+)$~', $path, $m)) {
        $ad = row('SELECT * FROM ads WHERE id = ?', [(int) $m[1]]);
        if ($ad && $ad['link_url']) {
            q('UPDATE ads SET clicks = clicks + 1 WHERE id = ?', [$ad['id']]);
            header('X-Robots-Tag: noindex');
            redirect($ad['link_url']);
        }
        not_found();
    }
    if ($path === 'stripe-webhook' && $method === 'POST') {
        stripe_webhook();
        exit;
    }
    json_out(['error' => 'Not found'], 404);
}
