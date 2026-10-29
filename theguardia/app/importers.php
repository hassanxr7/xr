<?php
/**
 * The Guardia — importers for official and openly licensed news sources.
 *
 * - "doj": U.S. Department of Justice press releases API (public domain). Each release is
 *   classified into a Courts & Justice sub-section (Sex Offender Cases, Fraud, Drugs …) and tagged.
 * - "rss": any RSS 2.0 / Atom feed whose licence allows republishing (CC BY, CC BY-ND, public domain).
 *
 * Imported stories always show their source and licence, link to the original, and by default
 * point their canonical URL at the original so search engines do not see duplicate content.
 * Images are never copied from sources (their licences often differ from the text).
 */
defined('APP') || exit;

/** Rules for classifying DOJ releases: section slug => pattern (first match wins). */
const DOJ_SECTIONS = [
    'sex-offender-cases' => '~\b(sex(ual)?\s+(abuse|assault|exploitation|offen[cs]e|offender|trafficking|predator)|child\s+(pornography|exploitation|sex(ual)?\s+abuse|sex\s+trafficking)|csam|enticement|entice|coercion and enticement|project safe childhood|rape|sexually explicit|transportation of (a )?minors?|travel(l)?ing to engage in illicit sexual|sorna|register as a sex offender|production of child|possession of child|receipt of child|distribution of child|sextortion|minor victims?)\b~i',
    'national-security'  => '~\b(terror\w*|isis|isil|al[- ]qaeda|hezbollah|hamas|espionage|spy|spying|export control|arms export|sanctions? (evasion|violations?)|ieepa|national security|foreign agent|fara|material support|cyber ?attack|ransomware|hack(er|ing|ed)|computer intrusion|botnet|state-sponsored)\b~i',
    'drugs'              => '~\b(fentanyl|methamphetamine|meth\b|cocaine|heroin|opioids?|oxycodone|narcotics?|drug traffick\w*|cartel|controlled substances?|marijuana|distribut\w+ drugs|pill press)\b~i',
    'fraud-corruption'   => '~\b(fraud\w*|ponzi|embezzl\w*|money launder\w*|brib\w*|kickbacks?|corruption|tax evasion|false claims|scheme to defraud|wire fraud|bank fraud|health care fraud|securities fraud|insider trading|identity theft|ppe? loan|cares act|extortion|price.fixing|antitrust)\b~i',
    'crime'              => '~\b(murder\w*|homicide|kill(ed|ing)|firearms?|gun|armed|robbery|carjack\w*|kidnap\w*|assault|violent|gang|racketeering|rico|arson|bank robbery|felon in possession|smuggl\w*|human trafficking|alien smuggling|illegal reentry|stalking|threat\w*)\b~i',
];

const DOJ_TAG_RULES = [
    'Sentencing'   => '~\bsentenced\b~i',
    'Guilty plea'  => '~\bplead(s|ed)? guilty\b|\bpleaded guilty\b~i',
    'Conviction'   => '~\bconvicted\b|\bfound guilty\b|\bjury\b~i',
    'Indictment'   => '~\bindicted\b|\bindictment\b|\bcharged\b|\barrested\b~i',
    'Child protection' => '~\bchild\b|\bminors?\b~i',
    'Sex offender registry' => '~register as a sex offender|sorna|failure to register~i',
];

function import_sources(): array
{
    return rows('SELECT * FROM import_sources ORDER BY id');
}

/** First page number of a source (DOJ API counts from 0, WordPress feeds from 1). */
function import_first_page(array $src): int
{
    return $src['type'] === 'doj' ? 0 : 1;
}

function import_page_url(array $src, int $page): string
{
    return str_replace('{page}', (string) $page, $src['url']);
}

/**
 * Run a source for up to $budget seconds.
 * $mode "latest" fetches the newest pages until it reaches stories already imported;
 * "backfill" continues from where it stopped last time, going back to the "since" date.
 */
function import_run(int $sourceId, string $mode = 'latest', int $budget = 20): array
{
    $src = row('SELECT * FROM import_sources WHERE id = ?', [$sourceId]);
    $res = ['imported' => 0, 'skipped' => 0, 'pages' => 0, 'done' => false, 'error' => '', 'total' => 0];
    if (!$src) {
        $res['error'] = 'Unknown source';
        return $res;
    }
    @set_time_limit($budget + 60);
    $start = time();
    $paged = strpos($src['url'], '{page}') !== false;
    $page = $mode === 'backfill' ? max(import_first_page($src), (int) $src['backfill_page']) : import_first_page($src);
    if ($mode === 'backfill' && ($src['backfill_done'] || !$paged)) {
        $mode = 'latest';
        $page = import_first_page($src);
    }
    $GLOBALS['tg_batch'] = true;
    try {
        while (time() - $start < $budget) {
            $items = import_fetch($src, $page);
            $res['pages']++;
            if (!$items) {
                if ($mode === 'backfill') {
                    update('import_sources', ['backfill_done' => 1], 'id = ?', [$src['id']]);
                }
                $res['done'] = true;
                break;
            }
            $new = 0;
            $older = 0;
            db()->beginTransaction();
            foreach ($items as $it) {
                if ($it['date'] < $src['since']) {
                    $older++;
                    $res['skipped']++;
                    continue;
                }
                $r = import_item($src, $it);
                $r ? $new++ : $res['skipped']++;
            }
            db()->commit();
            $res['imported'] += $new;
            if ($mode === 'backfill') {
                update('import_sources', ['backfill_page' => $page + 1], 'id = ?', [$src['id']]);
                if ($older === count($items)) {
                    update('import_sources', ['backfill_done' => 1], 'id = ?', [$src['id']]);
                    $res['done'] = true;
                    break;
                }
            } elseif ($new === 0 || !$paged || $page - import_first_page($src) >= 4) {
                $res['done'] = true; // reached stories we already have
                break;
            }
            $page++;
            usleep(350000); // stay well under the DOJ limit of 4 requests per second
        }
        update('import_sources', ['last_run' => now(), 'last_error' => null, 'imported' => (int) val('SELECT COUNT(*) FROM articles WHERE external_id LIKE ?', [$src['type'] . ':' . $src['id'] . ':%'])], 'id = ?', [$src['id']]);
    } catch (Throwable $e) {
        if (db()->inTransaction()) {
            db()->commit();
        }
        $res['error'] = $e->getMessage();
        update('import_sources', ['last_run' => now(), 'last_error' => mb_substr($e->getMessage(), 0, 500)], 'id = ?', [$src['id']]);
    }
    $GLOBALS['tg_batch'] = false;
    if ($res['imported']) {
        content_changed();
    }
    $res['total'] = (int) val('SELECT imported FROM import_sources WHERE id = ?', [$src['id']]);
    return $res;
}

/** Fetch one page of a source and normalise items to [id, title, html, date, url, author, tags, teaser]. */
function import_fetch(array $src, int $page): array
{
    $url = import_page_url($src, $page);
    $accept = $src['type'] === 'doj' ? 'application/json' : 'application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.5';
    $r = http_request('GET', $url, ['Accept: ' . $accept], null, 40);
    if ($r['error'] !== '') {
        throw new RuntimeException('Could not download ' . $url . ': ' . $r['error']);
    }
    if ($r['status'] === 404 && $page > import_first_page($src)) {
        return []; // past the last page of a paged feed
    }
    if ($r['status'] !== 200) {
        throw new RuntimeException('HTTP ' . $r['status'] . ' from ' . $url);
    }
    return $src['type'] === 'doj' ? doj_parse($r['body']) : feed_parse($r['body']);
}

/** Parse a DOJ press_releases.json page. */
function doj_parse(string $json): array
{
    $data = json_decode($json, true);
    if (!is_array($data)) {
        throw new RuntimeException('The DOJ API did not return JSON.');
    }
    $names = function ($v): array {
        $out = [];
        foreach ((array) $v as $x) {
            $n = is_array($x) ? ($x['name'] ?? '') : (string) $x;
            if ($n !== '') {
                $out[] = trim($n);
            }
        }
        return $out;
    };
    $items = [];
    foreach ($data['results'] ?? [] as $it) {
        $body = $it['body'] ?? '';
        if (is_array($body)) {
            $body = $body['value'] ?? ($body[0]['value'] ?? '');
        }
        $date = $it['date'] ?? $it['created'] ?? '';
        $ts = ctype_digit((string) $date) ? (int) $date : strtotime((string) $date);
        $link = (string) ($it['url'] ?? '');
        if ($link !== '' && $link[0] === '/') {
            $link = 'https://www.justice.gov' . $link;
        }
        $title = trim(html_entity_decode(strip_tags((string) ($it['title'] ?? '')), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
        if ($title === '' || !$ts) {
            continue;
        }
        $items[] = [
            'id'     => (string) ($it['uuid'] ?? sha1($link . $title)),
            'title'  => $title,
            'html'   => (string) $body,
            'teaser' => trim(plain_text((string) ($it['teaser'] ?? ''))),
            'date'   => date('Y-m-d H:i:s', $ts),
            'url'    => $link,
            'author' => '',
            'tags'   => $names($it['topic'] ?? []),
            'components' => $names($it['component'] ?? []),
        ];
    }
    return $items;
}

/** Parse RSS 2.0 or Atom. */
function feed_parse(string $xml): array
{
    libxml_use_internal_errors(true);
    $doc = simplexml_load_string($xml, 'SimpleXMLElement', LIBXML_NOCDATA | LIBXML_NONET);
    libxml_clear_errors();
    if (!$doc) {
        throw new RuntimeException('The feed is not valid RSS/Atom XML.');
    }
    $items = [];
    if (isset($doc->channel->item)) {
        foreach ($doc->channel->item as $it) {
            $content = $it->children('http://purl.org/rss/1.0/modules/content/');
            $dc = $it->children('http://purl.org/dc/elements/1.1/');
            $tags = [];
            foreach ($it->category as $c) {
                $tags[] = trim((string) $c);
            }
            $link = trim((string) $it->link);
            $items[] = [
                'id' => trim((string) ($it->guid ?: $link)), 'title' => trim(html_entity_decode((string) $it->title, ENT_QUOTES | ENT_HTML5, 'UTF-8')),
                'html' => (string) ($content->encoded ?: $it->description), 'teaser' => trim(plain_text((string) $it->description)),
                'date' => date('Y-m-d H:i:s', strtotime((string) ($it->pubDate ?: $dc->date)) ?: time()), 'url' => $link,
                'author' => trim((string) ($dc->creator ?: $it->author)), 'tags' => $tags, 'components' => [],
            ];
        }
    } else {
        $doc->registerXPathNamespace('a', 'http://www.w3.org/2005/Atom');
        foreach ($doc->entry ?? [] as $it) {
            $link = '';
            foreach ($it->link as $l) {
                if ((string) $l['rel'] === '' || (string) $l['rel'] === 'alternate') {
                    $link = (string) $l['href'];
                    break;
                }
            }
            $tags = [];
            foreach ($it->category as $c) {
                $tags[] = trim((string) ($c['label'] ?: $c['term']));
            }
            $items[] = [
                'id' => trim((string) ($it->id ?: $link)), 'title' => trim(html_entity_decode(strip_tags((string) $it->title), ENT_QUOTES | ENT_HTML5, 'UTF-8')),
                'html' => (string) ($it->content ?: $it->summary), 'teaser' => trim(plain_text((string) $it->summary)),
                'date' => date('Y-m-d H:i:s', strtotime((string) ($it->published ?: $it->updated)) ?: time()), 'url' => $link,
                'author' => trim((string) ($it->author->name ?? '')), 'tags' => $tags, 'components' => [],
            ];
        }
    }
    return array_values(array_filter($items, fn ($i) => $i['title'] !== '' && $i['url'] !== ''));
}

/** Section for a DOJ release (falls back to the source's section). */
function doj_section(string $title, string $text, ?int $fallback): ?int
{
    $hay = $title . ' ' . mb_substr($text, 0, 1500);
    foreach (DOJ_SECTIONS as $slug => $re) {
        if (preg_match($re, $hay) && ($c = category_by_slug($slug))) {
            return (int) $c['id'];
        }
    }
    return $fallback;
}

/** Insert one item. Returns the new article id, or 0 if it already exists or is filtered out. */
function import_item(array $src, array $it): int
{
    $ext = $src['type'] . ':' . $src['id'] . ':' . sha1($it['id']);
    if (val('SELECT 1 FROM articles WHERE external_id = ?', [$ext])) {
        return 0;
    }
    $html = sanitize_html($it['html']);
    // Never copy images or embeds from the source.
    $html = preg_replace('~<(figure|iframe)\b.*?</\1>|<img\b[^>]*>~is', '', $html);
    $text = plain_text($html);
    if ($text === '' && $it['teaser'] === '') {
        return 0;
    }
    if (trim((string) $src['keywords']) !== '') {
        $hit = false;
        foreach (preg_split('~\R~', $src['keywords']) as $kw) {
            $kw = trim($kw);
            if ($kw !== '' && (mb_stripos($it['title'], $kw) !== false || mb_stripos($text, $kw) !== false)) {
                $hit = true;
                break;
            }
        }
        if (!$hit) {
            return 0;
        }
    }
    $catId = $src['category_id'] ? (int) $src['category_id'] : null;
    $tags = $it['tags'];
    $location = null;
    $sourceName = $src['name'];
    if ($src['type'] === 'doj') {
        $sourceName = 'U.S. Department of Justice';
        if ($src['auto_classify']) {
            $catId = doj_section($it['title'], $text, $catId);
        }
        foreach (DOJ_TAG_RULES as $tag => $re) {
            if (preg_match($re, $it['title'])) {
                $tags[] = $tag;
            }
        }
        foreach ($it['components'] as $c) {
            $c = preg_replace('~^USAO\s*-\s*~i', '', $c);
            // "Ohio, Southern" → "Southern District of Ohio"
            $c = preg_replace('~^(.+),\s*(Northern|Southern|Eastern|Western|Middle|Central)$~', '$2 District of $1', $c);
            $c = str_replace(',', '', $c);
            if (mb_strlen($c) <= 60) {
                $tags[] = $c;
            }
        }
        $tags[] = 'U.S. Department of Justice';
        // Dateline such as "ALEXANDRIA, Va. –" at the start of the release.
        if (preg_match('~^\s*([A-Z][A-Z .\'\-]{2,30}(?:,\s*[A-Z][A-Za-z.]{1,12})?)\s*[–—-]\s+~u', $text, $m)) {
            $location = trim($m[1]);
        }
        $html = '<p>' . e('This is an official press release from the U.S. Department of Justice' . ($it['components'] ? ' (' . $it['components'][0] . ')' : '') . ', published as received.') . '</p>' . $html;
    }
    $standfirst = $it['teaser'] !== '' ? $it['teaser'] : $text;
    if ($location) {
        $standfirst = preg_replace('~^\s*' . preg_quote($location, '~') . '\s*[–—-]\s*~u', '', $standfirst);
    }
    $standfirst = str_limit($standfirst, 260);
    $byline = $src['type'] === 'doj' ? 'U.S. Department of Justice' : trim(($it['author'] ? $it['author'] . ' / ' : '') . preg_replace('~\s+[–-]\s+.*$~', '', $src['name']));
    $title = mb_substr($it['title'], 0, 250);
    return save_article([
        'title' => $title, 'slug' => unique_slug('articles', slugify($title)), 'standfirst' => $standfirst, 'body' => $html,
        'category_id' => $catId, 'byline' => $byline, 'status' => 'published', 'published_at' => $it['date'], 'created_at' => now(),
        'location' => $location, 'lang' => 'en', 'seo_description' => str_limit($standfirst, 155),
        'canonical_url' => $src['canonical'] === 'source' ? $it['url'] : null,
        'source_name' => $sourceName, 'source_url' => $it['url'], 'source_licence' => $src['licence'], 'external_id' => $ext,
        'tags' => array_slice(array_unique(array_filter($tags)), 0, 10),
    ]);
}

/** Import cron: newest items from every enabled source, then a little backfill. */
function import_cron(int $budget = 120): void
{
    $end = time() + $budget;
    foreach (rows('SELECT id, backfill_done FROM import_sources WHERE enabled = 1 ORDER BY id') as $s) {
        if (time() >= $end) {
            break;
        }
        import_run((int) $s['id'], 'latest', max(5, min(30, $end - time())));
    }
    foreach (rows('SELECT id FROM import_sources WHERE enabled = 1 AND backfill_done = 0 ORDER BY id') as $s) {
        if (time() >= $end - 5) {
            break;
        }
        import_run((int) $s['id'], 'backfill', max(5, $end - time() - 5));
    }
}
