<?php
/**
 * The Guardia — articles, categories, tags, authors and HTML sanitising.
 */
defined('APP') || exit;

/** Columns needed to render a story card (body excluded for speed). */
const CARD_COLS = 'a.id, a.title, a.slug, a.standfirst, a.image_id, a.category_id, a.author_id, a.byline, a.published_at, a.updated_at, a.is_breaking, a.is_featured, a.views, a.word_count, a.location, a.source_name';

/** URL segments that can never be a category or page slug. */
const RESERVED_SLUGS = ['admin', 'api', 'app', 'assets', 'uploads', 'install', 'tag', 'author', 'search', 'archive', 'feed', 'photos',
    'sitemap', 'page', 'latest', 'robots', 'ads', 'cron', 'sw', 'manifest', 'offline', 'contact', 'login', 'amp'];

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

function categories(): array
{
    static $all = null;
    if ($all === null) {
        $all = [];
        foreach (rows('SELECT * FROM categories ORDER BY position, name') as $c) {
            $all[(int) $c['id']] = $c;
        }
    }
    return $all;
}

function category(?int $id): ?array
{
    return $id ? (categories()[$id] ?? null) : null;
}

function category_by_slug(string $slug): ?array
{
    foreach (categories() as $c) {
        if ($c['slug'] === $slug) {
            return $c;
        }
    }
    return null;
}

/** A category id plus all of its descendants (for section pages that include sub-sections). */
function category_tree_ids(int $id): array
{
    $ids = [$id];
    foreach (categories() as $c) {
        if ((int) $c['parent_id'] === $id) {
            $ids = array_merge($ids, category_tree_ids((int) $c['id']));
        }
    }
    return array_values(array_unique($ids));
}

function category_children(int $id): array
{
    return array_values(array_filter(categories(), fn ($c) => (int) $c['parent_id'] === $id));
}

function menu_categories(): array
{
    return array_values(array_filter(categories(), fn ($c) => $c['in_menu'] && !$c['parent_id']));
}

function category_url(array $c, int $page = 1): string
{
    return url($c['slug']) . ($page > 1 ? '?page=' . $page : '');
}

/** Default image for a category (its own upload, its parent's, or the bundled one). */
function category_image(?array $c): string
{
    $seen = 0;
    while ($c && $seen++ < 5) {
        if (!empty($c['image'])) {
            return $c['image'];
        }
        if (is_file(BASE_PATH . '/assets/img/defaults/' . $c['slug'] . '.jpg')) {
            return 'assets/img/defaults/' . $c['slug'] . '.jpg';
        }
        $c = category((int) $c['parent_id']);
    }
    return 'assets/img/defaults/news.jpg';
}

// ---------------------------------------------------------------------------
// Articles
// ---------------------------------------------------------------------------

function article_url(array $a, bool $absolute = false): string
{
    $d = $a['published_at'] ?: ($a['created_at'] ?? now());
    $path = date('Y/m/d', strtotime($d)) . '/' . $a['slug'];
    return $absolute ? abs_url($path) : url($path);
}

/** Published = status published and the publish time has passed. */
function published_sql(string $alias = 'a'): string
{
    return "$alias.status = 'published' AND $alias.published_at <= '" . now() . "'";
}

function article_by_slug(string $slug): ?array
{
    return row('SELECT * FROM articles WHERE slug = ?', [$slug]);
}

function article(int $id): ?array
{
    return row('SELECT * FROM articles WHERE id = ?', [$id]);
}

/**
 * Latest published stories, optionally in some categories, excluding ids.
 */
function latest_articles(int $limit, int $offset = 0, array $catIds = [], array $exclude = []): array
{
    $where = [published_sql()];
    $params = [];
    if ($catIds) {
        $where[] = 'a.category_id IN (' . placeholders($catIds) . ')';
        $params = array_merge($params, $catIds);
    }
    if ($exclude) {
        $where[] = 'a.id NOT IN (' . placeholders($exclude) . ')';
        $params = array_merge($params, $exclude);
    }
    $params[] = $limit;
    $params[] = $offset;
    return rows('SELECT ' . CARD_COLS . ' FROM articles a WHERE ' . implode(' AND ', $where) . ' ORDER BY a.published_at DESC LIMIT ? OFFSET ?', $params);
}

function count_articles(array $catIds = []): int
{
    if ($catIds) {
        return (int) val('SELECT COUNT(*) FROM articles a WHERE ' . published_sql() . ' AND a.category_id IN (' . placeholders($catIds) . ')', $catIds);
    }
    return (int) val('SELECT COUNT(*) FROM articles a WHERE ' . published_sql());
}

function featured_articles(int $limit): array
{
    return rows('SELECT ' . CARD_COLS . ' FROM articles a WHERE ' . published_sql() . ' AND a.is_featured = 1 ORDER BY a.published_at DESC LIMIT ?', [$limit]);
}

function breaking_articles(): array
{
    $since = date('Y-m-d H:i:s', time() - 86400);
    return rows('SELECT ' . CARD_COLS . ' FROM articles a WHERE ' . published_sql() . ' AND a.is_breaking = 1 AND a.published_at >= ? ORDER BY a.published_at DESC LIMIT 5', [$since]);
}

/** Most-read stories over the last N days (from analytics; cached for 10 minutes). */
function most_read(int $limit = 6, int $days = 2): array
{
    $key = "most_read_{$limit}_{$days}";
    $ids = cache_get($key);
    if (!is_array($ids)) {
        $ids = array_map('intval', array_column(rows(
            'SELECT article_id, COUNT(*) n FROM hits WHERE ts >= ? AND article_id IS NOT NULL GROUP BY article_id ORDER BY n DESC LIMIT ?',
            [time() - $days * 86400, $limit * 2]
        ), 'article_id'));
        cache_set($key, $ids, 600);
    }
    $list = $ids ? articles_by_ids($ids) : [];
    if (count($list) < $limit) {
        // Young site / no traffic yet: fill with the most viewed recent stories.
        $more = rows('SELECT ' . CARD_COLS . ' FROM articles a WHERE ' . published_sql() . ' AND a.published_at >= ? '
            . ($ids ? 'AND a.id NOT IN (' . placeholders($ids) . ') ' : '') . 'ORDER BY a.views DESC, a.published_at DESC LIMIT ?',
            array_merge([date('Y-m-d', time() - 30 * 86400)], $ids, [$limit]));
        $list = array_merge($list, $more);
    }
    return array_slice($list, 0, $limit);
}

/** Published stories by id, keeping the order of $ids. */
function articles_by_ids(array $ids): array
{
    if (!$ids) {
        return [];
    }
    $byId = [];
    foreach (rows('SELECT ' . CARD_COLS . ' FROM articles a WHERE ' . published_sql() . ' AND a.id IN (' . placeholders($ids) . ')', $ids) as $r) {
        $byId[(int) $r['id']] = $r;
    }
    $out = [];
    foreach ($ids as $id) {
        if (isset($byId[$id])) {
            $out[] = $byId[$id];
        }
    }
    return $out;
}

/** Related stories: shared tags first, then the same section. */
function related_articles(array $a, int $limit = 4): array
{
    $tagged = rows(
        'SELECT ' . CARD_COLS . ', COUNT(*) score FROM article_tags t1 JOIN article_tags t2 ON t2.tag_id = t1.tag_id AND t2.article_id <> t1.article_id '
        . 'JOIN articles a ON a.id = t2.article_id WHERE t1.article_id = ? AND ' . published_sql() . ' AND a.published_at >= ? '
        . 'GROUP BY a.id ORDER BY score DESC, a.published_at DESC LIMIT ?',
        [$a['id'], date('Y-m-d', strtotime($a['published_at'] ?? 'now') - 180 * 86400), $limit]
    );
    if (count($tagged) < $limit && $a['category_id']) {
        $exclude = array_merge([(int) $a['id']], array_map('intval', array_column($tagged, 'id')));
        $tagged = array_merge($tagged, latest_articles($limit - count($tagged), 0, [(int) $a['category_id']], $exclude));
    }
    return $tagged;
}

/**
 * Full-text search over published stories. Returns [rows, total].
 */
function search_articles(string $query, int $limit, int $offset): array
{
    $terms = preg_split('~\s+~u', trim(preg_replace('~[^\p{L}\p{N}\s\-]+~u', ' ', $query)));
    $terms = array_filter($terms, fn ($t) => mb_strlen($t) > 1);
    if (!$terms) {
        return [[], 0];
    }
    $match = implode(' ', array_map(fn ($t) => '"' . str_replace('"', '', $t) . '"*', array_slice($terms, 0, 8)));
    $total = (int) val('SELECT COUNT(*) FROM articles_fts f JOIN articles a ON a.id = f.rowid WHERE articles_fts MATCH ? AND ' . published_sql(), [$match]);
    $list = rows('SELECT ' . CARD_COLS . ' FROM articles_fts f JOIN articles a ON a.id = f.rowid WHERE articles_fts MATCH ? AND ' . published_sql()
        . ' ORDER BY bm25(articles_fts, 10.0, 4.0, 1.0) + (julianday(\'now\') - julianday(a.published_at)) / 365.0 LIMIT ? OFFSET ?', [$match, $limit, $offset]);
    return [$list, $total];
}

function reading_minutes(int $words): int
{
    return max(1, (int) round($words / 230));
}

/** Byline text for a story. */
function article_byline(array $a): string
{
    if (!empty($a['byline'])) {
        return $a['byline'];
    }
    $u = author((int) $a['author_id']);
    return $u ? $u['name'] : site_name() . ' staff';
}

function author(int $id): ?array
{
    static $cache = [];
    if (!$id) {
        return null;
    }
    if (!array_key_exists($id, $cache)) {
        $cache[$id] = row('SELECT id, name, slug, title, bio, avatar, role FROM users WHERE id = ?', [$id]);
    }
    return $cache[$id];
}

function author_url(array $u): string
{
    return url('author/' . $u['slug']);
}

/** Unique slug for a table (adds -2, -3 … on collision). */
function unique_slug(string $table, string $base, int $ignoreId = 0): string
{
    $base = $base !== '' ? $base : 'story';
    if (in_array($base, RESERVED_SLUGS, true) && $table !== 'articles') {
        $base .= '-section';
    }
    $slug = $base;
    $n = 2;
    while ((int) val("SELECT COUNT(*) FROM `$table` WHERE slug = ? AND id <> ?", [$slug, $ignoreId]) > 0) {
        $slug = $base . '-' . $n++;
    }
    return $slug;
}

/**
 * Create or update a story. $data uses article columns; 'tags' may hold a list of tag names.
 * Returns the article id.
 */
function save_article(array $data, int $id = 0): int
{
    $tags = $data['tags'] ?? null;
    unset($data['tags']);
    if (isset($data['body'])) {
        $data['body'] = sanitize_html((string) $data['body']);
        $data['word_count'] = str_word_count(plain_text($data['body']));
    }
    $data['updated_at'] = now();
    $old = $id ? article($id) : null;
    if ($old) {
        update('articles', $data, 'id = ?', [$id]);
        // Keep old links working when a slug or date changes.
        $new = article($id);
        if ($old['status'] === 'published' && article_url($old) !== article_url($new)) {
            q('REPLACE INTO redirects (from_path, to_path, created_at) VALUES (?, ?, ?)', [ltrim(substr(article_url($old), strlen(base_url())), '/'), 'article:' . $id, now()]);
        }
    } else {
        $data['created_at'] = $data['created_at'] ?? now();
        $id = insert('articles', $data);
    }
    if (is_array($tags)) {
        set_article_tags($id, $tags);
    }
    if (empty($GLOBALS['tg_batch'])) {
        content_changed();
    }
    return $id;
}

function set_article_tags(int $articleId, array $names): void
{
    q('DELETE FROM article_tags WHERE article_id = ?', [$articleId]);
    $seen = [];
    foreach ($names as $name) {
        $name = trim(preg_replace('~\s+~u', ' ', (string) $name), " \t#,");
        $slug = slugify($name, 60);
        if ($name === '' || $slug === '' || isset($seen[$slug]) || count($seen) >= 15) {
            continue;
        }
        $seen[$slug] = true;
        $tagId = (int) val('SELECT id FROM tags WHERE slug = ?', [$slug]);
        if (!$tagId) {
            $tagId = insert('tags', ['name' => mb_substr($name, 0, 60), 'slug' => $slug]);
        }
        q('INSERT OR IGNORE INTO article_tags (article_id, tag_id) VALUES (?, ?)', [$articleId, $tagId]);
    }
}

function article_tags(int $articleId): array
{
    return rows('SELECT t.* FROM tags t JOIN article_tags x ON x.tag_id = t.id WHERE x.article_id = ? ORDER BY t.name', [$articleId]);
}

function tag_url(array $t): string
{
    return url('tag/' . $t['slug']);
}

/** Publish stories whose scheduled time has come (run on every request cheaply and by cron). */
function publish_scheduled(): int
{
    $due = rows("SELECT id FROM articles WHERE status = 'scheduled' AND published_at <= ?", [now()]);
    foreach ($due as $r) {
        update('articles', ['status' => 'published'], 'id = ?', [$r['id']]);
        after_publish((int) $r['id']);
    }
    if ($due) {
        content_changed();
    }
    return count($due);
}

/** Things to do when a story goes live: tell search engines (IndexNow) and queue a push alert if requested. */
function after_publish(int $id): void
{
    $a = article($id);
    if (!$a || $a['status'] !== 'published' || $a['noindex']) {
        return;
    }
    indexnow_ping([article_url($a, true)]);
}

// ---------------------------------------------------------------------------
// Static pages
// ---------------------------------------------------------------------------

function page_by_slug(string $slug): ?array
{
    return row('SELECT * FROM pages WHERE slug = ?', [$slug]);
}

function footer_pages(): array
{
    static $p = null;
    return $p ?? ($p = rows('SELECT title, slug FROM pages WHERE in_footer = 1 ORDER BY id'));
}

// ---------------------------------------------------------------------------
// HTML sanitising (article bodies, imported content)
// ---------------------------------------------------------------------------

/**
 * Keep only safe tags/attributes. Links get rel attributes, YouTube/Vimeo iframes are allowed,
 * everything else (scripts, styles, event handlers, unknown tags) is removed.
 */
function sanitize_html(string $html): string
{
    $html = trim($html);
    if ($html === '') {
        return '';
    }
    $allowed = [
        'p' => [], 'br' => [], 'h2' => ['id'], 'h3' => ['id'], 'h4' => [], 'strong' => [], 'b' => [], 'em' => [], 'i' => [], 'u' => [], 's' => [],
        'a' => ['href', 'title'], 'ul' => [], 'ol' => [], 'li' => [], 'blockquote' => ['class'], 'q' => [], 'cite' => [], 'sup' => [], 'sub' => [],
        'figure' => ['class'], 'figcaption' => [], 'img' => ['src', 'alt', 'width', 'height', 'loading', 'srcset', 'sizes'],
        'table' => [], 'thead' => [], 'tbody' => [], 'tr' => [], 'th' => ['colspan', 'rowspan', 'scope'], 'td' => ['colspan', 'rowspan'],
        'hr' => [], 'pre' => [], 'code' => [], 'iframe' => ['src', 'width', 'height', 'title', 'allowfullscreen'], 'div' => ['class'], 'span' => [],
        'abbr' => ['title'], 'mark' => [], 'small' => [], 'aside' => ['class'],
    ];
    $drop = ['script', 'style', 'object', 'embed', 'form', 'input', 'button', 'select', 'textarea', 'link', 'meta', 'svg', 'math', 'noscript', 'template', 'head', 'title'];

    $doc = new DOMDocument();
    libxml_use_internal_errors(true);
    $doc->loadHTML('<?xml encoding="utf-8"?><div id="tg-root">' . $html . '</div>', LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD | LIBXML_NONET);
    libxml_clear_errors();
    $root = $doc->getElementById('tg-root') ?: $doc->documentElement;

    $walk = function (DOMNode $node) use (&$walk, $allowed, $drop, $doc) {
        for ($i = $node->childNodes->length - 1; $i >= 0; $i--) {
            $child = $node->childNodes->item($i);
            if ($child instanceof DOMComment || $child instanceof DOMProcessingInstruction) {
                $node->removeChild($child);
                continue;
            }
            if (!$child instanceof DOMElement) {
                continue;
            }
            $tag = strtolower($child->tagName);
            if (in_array($tag, $drop, true)) {
                $node->removeChild($child);
                continue;
            }
            $walk($child);
            if (!isset($allowed[$tag])) {
                // Unwrap unknown tags but keep their text/children.
                while ($child->firstChild) {
                    $node->insertBefore($child->firstChild, $child);
                }
                $node->removeChild($child);
                continue;
            }
            foreach (iterator_to_array($child->attributes) as $attr) {
                $name = strtolower($attr->name);
                if (!in_array($name, $allowed[$tag], true)) {
                    $child->removeAttribute($attr->name);
                }
            }
            if ($tag === 'a') {
                $href = trim($child->getAttribute('href'));
                if ($href === '' || !preg_match('~^(https?://|mailto:|/|#)~i', $href)) {
                    $child->removeAttribute('href');
                } elseif (preg_match('~^https?://~i', $href) && parse_url($href, PHP_URL_HOST) !== parse_url(site_origin(), PHP_URL_HOST)) {
                    $child->setAttribute('rel', 'noopener nofollow');
                    $child->setAttribute('target', '_blank');
                }
            }
            if ($tag === 'img') {
                $src = trim($child->getAttribute('src'));
                if (!preg_match('~^(https?://|/)~i', $src)) {
                    $node->removeChild($child);
                    continue;
                }
                $child->setAttribute('loading', 'lazy');
                $child->setAttribute('decoding', 'async');
            }
            if ($tag === 'iframe') {
                $src = $child->getAttribute('src');
                if (!preg_match('~^https://(www\.)?(youtube(-nocookie)?\.com/embed/|player\.vimeo\.com/video/)~i', $src)) {
                    $node->removeChild($child);
                    continue;
                }
                $child->setAttribute('loading', 'lazy');
                $child->setAttribute('allowfullscreen', '');
            }
            foreach (['class'] as $c) {
                if ($child->hasAttribute($c) && !preg_match('~^[a-z0-9 _-]{1,60}$~i', $child->getAttribute($c))) {
                    $child->removeAttribute($c);
                }
            }
        }
    };
    $walk($root);

    $out = '';
    foreach ($root->childNodes as $n) {
        $out .= $doc->saveHTML($n);
    }
    // Drop empty paragraphs produced by editors.
    $out = preg_replace('~<p>(\s|&nbsp;|<br\s*/?>)*</p>~i', '', $out);
    return trim((string) $out);
}

/** Wrap plain text (e.g. from a textarea or a feed) into paragraphs. */
function text_to_html(string $text): string
{
    $paras = preg_split("~\n\s*\n~", trim(str_replace("\r", '', $text)));
    return implode("\n", array_map(fn ($p) => '<p>' . nl2br(e(trim($p)), false) . '</p>', array_filter($paras, fn ($p) => trim($p) !== '')));
}

/**
 * Insert $insert after the Nth paragraph of $html (used for in-article ads and "read more" boxes).
 */
function insert_after_paragraph(string $html, int $n, string $insert): string
{
    if ($insert === '' || $n < 1) {
        return $html;
    }
    $count = 0;
    $result = preg_replace_callback('~</p>~i', function ($m) use (&$count, $n, $insert) {
        $count++;
        return $count === $n ? $m[0] . $insert : $m[0];
    }, $html);
    return $count >= $n ? (string) $result : $html;
}

/** Add id attributes to h2 headings so they can be linked (and used for a table of contents). */
function heading_anchors(string $html): array
{
    $toc = [];
    $html = preg_replace_callback('~<h2(?: id="[^"]*")?>(.*?)</h2>~is', function ($m) use (&$toc) {
        $text = plain_text($m[1]);
        $id = slugify($text, 50) ?: 'section-' . (count($toc) + 1);
        $toc[] = ['id' => $id, 'text' => $text];
        return '<h2 id="' . e($id) . '">' . $m[1] . '</h2>';
    }, $html);
    return [(string) $html, $toc];
}
