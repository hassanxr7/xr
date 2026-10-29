<?php
/**
 * The Guardia — reusable public UI pieces (story cards, icons, share buttons, pager).
 */
defined('APP') || exit;

function icon(string $name, string $class = 'i'): string
{
    return '<svg class="' . $class . '" aria-hidden="true"><use href="#i-' . $name . '"/></svg>';
}

/** Inline SVG sprite (output once in the layout). */
function icon_sprite(): string
{
    $paths = [
        'search'   => '<circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="m20 20-4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
        'menu'     => '<path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
        'close'    => '<path d="M5 5l14 14M19 5 5 19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
        'bell'     => '<path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
        'arrow'    => '<path d="M5 12h14m-5-5 5 5-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
        'clock'    => '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
        'link'     => '<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
        'mail'     => '<rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="m3 7 9 6 9-6" fill="none" stroke="currentColor" stroke-width="2"/>',
        'camera'   => '<path d="M4 8h3l2-3h6l2 3h3v11H4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.5" fill="none" stroke="currentColor" stroke-width="2"/>',
        'facebook' => '<path fill="currentColor" d="M14 8.5V6.8c0-.8.2-1.3 1.4-1.3H17V2.3c-.3 0-1.3-.1-2.4-.1-2.4 0-4 1.5-4 4.1v2.2H8V12h2.6v9.8H14V12h2.7l.4-3.5z"/>',
        'whatsapp' => '<path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.6 0-3.1-.4-4.4-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.2.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3c-.2.3-.9.9-.9 2.2s.9 2.5 1 2.7c.1.2 1.8 2.8 4.4 3.9 1.6.7 2.3.8 3.1.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2l-.6-.3z"/>',
        'x'        => '<path fill="currentColor" d="M17.8 3h3.1l-6.8 7.7L22 21h-6.2l-4.9-6.4L5.3 21H2.2l7.2-8.3L2 3h6.4l4.4 5.8zm-1.1 16.2h1.7L7.4 4.7H5.6z"/>',
        'telegram' => '<path fill="currentColor" d="M21.9 4.3 18.7 19c-.2 1-.9 1.3-1.7.8l-4.8-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.3-4.9 8.9-8c.4-.3-.1-.5-.6-.2l-11 6.9L1.8 11.3c-1-.3-1-1 .2-1.5L20.6 2.7c.9-.3 1.6.2 1.3 1.6z"/>',
        'linkedin' => '<path fill="currentColor" d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9.5h4V21H3zM9.5 9.5h3.8v1.6h.1c.5-1 1.8-2 3.8-2 4 0 4.8 2.6 4.8 6V21h-4v-5.2c0-1.2 0-2.9-1.8-2.9s-2 1.4-2 2.8V21h-4z"/>',
        'instagram' => '<rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.5" cy="6.5" r="1.2" fill="currentColor"/>',
        'youtube'  => '<path fill="currentColor" d="M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 0 0 1 7.2 31 31 0 0 0 .5 12a31 31 0 0 0 .5 4.8 3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .5-4.8 31 31 0 0 0-.5-4.8zM9.7 15V9l5.8 3z"/>',
        'tiktok'   => '<path fill="currentColor" d="M16.6 5.8A4.3 4.3 0 0 1 15.5 3h-3.2v12.4a2.6 2.6 0 1 1-2.6-2.6c.3 0 .5 0 .8.1V9.6a5.9 5.9 0 1 0 5 5.8V9.1a7.4 7.4 0 0 0 4.3 1.4V7.3a4.3 4.3 0 0 1-3.2-1.5z"/>',
        'rss'      => '<path fill="currentColor" d="M5 17a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM3 10v3a8 8 0 0 1 8 8h3A11 11 0 0 0 3 10zm0-6v3a14 14 0 0 1 14 14h3A17 17 0 0 0 3 4z"/>',
    ];
    $out = '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>';
    foreach ($paths as $id => $p) {
        $out .= '<symbol id="i-' . $id . '" viewBox="0 0 24 24">' . $p . '</symbol>';
    }
    return $out . '</defs></svg>';
}

/** Section label above a headline. */
function kicker(array $a): string
{
    $c = category((int) $a['category_id']);
    if (!$c) {
        return '';
    }
    $live = !empty($a['is_breaking']) && strtotime((string) $a['published_at']) > time() - 86400;
    return '<a class="kicker" href="' . e(category_url($c)) . '">' . ($live ? '<span class="live">Breaking</span> ' : '') . e($c['name']) . '</a>';
}

function card_meta(array $a, bool $byline = false): string
{
    $t = '<time datetime="' . e(date('c', strtotime($a['published_at']))) . '">' . e(time_ago($a['published_at'])) . '</time>';
    return '<div class="meta">' . ($byline ? '<span>' . e(article_byline($a)) . '</span> · ' : '') . $t . '</div>';
}

/**
 * Story card. Variants: lead | standard | compact | text | number.
 */
function card(array $a, string $variant = 'standard', array $opt = []): string
{
    $href = e(article_url($a));
    $title = e($a['title']);
    switch ($variant) {
        case 'lead':
            $img = picture(article_image($a), '(min-width: 1100px) 700px, (min-width: 760px) 60vw, 100vw', '', !empty($opt['eager']));
            return '<article class="card card-lead"><a class="card-img" href="' . $href . '" tabindex="-1">' . $img . '</a><div class="card-body">'
                . kicker($a) . '<h2 class="card-title"><a href="' . $href . '">' . $title . '</a></h2>'
                . ($a['standfirst'] ? '<p class="standfirst">' . e(str_limit($a['standfirst'], 230)) . '</p>' : '') . card_meta($a, true) . '</div></article>';
        case 'compact':
            $img = picture(article_image($a), '120px');
            return '<article class="card card-compact"><div class="card-body">' . kicker($a) . '<h3 class="card-title"><a href="' . $href . '">' . $title . '</a></h3>'
                . card_meta($a) . '</div><a class="card-img" href="' . $href . '" tabindex="-1">' . $img . '</a></article>';
        case 'text':
            return '<article class="card card-text">' . (!empty($opt['kicker']) ? kicker($a) : '') . '<h3 class="card-title"><a href="' . $href . '">' . $title . '</a></h3>' . card_meta($a) . '</article>';
        case 'number':
            return '<li class="card card-number"><a href="' . $href . '">' . $title . '</a></li>';
        default:
            $img = picture(article_image($a), '(min-width: 1100px) 300px, (min-width: 640px) 45vw, 100vw');
            return '<article class="card card-standard"><a class="card-img" href="' . $href . '" tabindex="-1">' . $img . '</a><div class="card-body">'
                . kicker($a) . '<h3 class="card-title"><a href="' . $href . '">' . $title . '</a></h3>'
                . (!empty($opt['standfirst']) && $a['standfirst'] ? '<p class="standfirst">' . e(str_limit($a['standfirst'], 140)) . '</p>' : '')
                . card_meta($a) . '</div></article>';
    }
}

/** Share buttons. Each link carries utm tags so the dashboard can tell which network brought readers. */
function share_buttons(array $a): string
{
    $u = article_url($a, true);
    $t = $a['title'];
    $tag = fn ($src) => $u . '?utm_source=' . $src . '&utm_medium=social&utm_campaign=share';
    $links = [
        'facebook' => ['Facebook', 'https://www.facebook.com/sharer/sharer.php?u=' . rawurlencode($tag('facebook'))],
        'whatsapp' => ['WhatsApp', 'https://wa.me/?text=' . rawurlencode($t . ' ' . $tag('whatsapp'))],
        'x'        => ['X', 'https://x.com/intent/post?text=' . rawurlencode($t) . '&url=' . rawurlencode($tag('x'))],
        'telegram' => ['Telegram', 'https://t.me/share/url?url=' . rawurlencode($tag('telegram')) . '&text=' . rawurlencode($t)],
        'linkedin' => ['LinkedIn', 'https://www.linkedin.com/sharing/share-offsite/?url=' . rawurlencode($tag('linkedin'))],
        'mail'     => ['Email', 'mailto:?subject=' . rawurlencode($t) . '&body=' . rawurlencode($tag('email'))],
    ];
    $out = '<div class="share" aria-label="Share this story">';
    foreach ($links as $k => [$label, $href]) {
        $out .= '<a class="share-' . $k . '" href="' . e($href) . '" target="_blank" rel="noopener" title="Share on ' . $label . '" aria-label="Share on ' . $label . '">' . icon($k) . '</a>';
    }
    $out .= '<button type="button" class="share-copy" data-copy="' . e($tag('copy')) . '" title="Copy link" aria-label="Copy link">' . icon('link') . '</button>';
    return $out . '</div>';
}

function pager(int $page, int $pages, string $base): string
{
    if ($pages <= 1) {
        return '';
    }
    $sep = strpos($base, '?') === false ? '?' : '&';
    $href = fn ($p) => e(url($base) . ($p > 1 ? $sep . 'page=' . $p : ''));
    $out = '<nav class="pager" aria-label="Pages">';
    if ($page > 1) {
        $out .= '<a rel="prev" href="' . $href($page - 1) . '">← Newer</a>';
    }
    foreach (pager_pages($page, $pages) as $p) {
        $out .= $p === '…' ? '<span class="gap">…</span>' : ($p === $page ? '<span class="current" aria-current="page">' . $p . '</span>' : '<a href="' . $href($p) . '">' . $p . '</a>');
    }
    if ($page < $pages) {
        $out .= '<a rel="next" href="' . $href($page + 1) . '">Older →</a>';
    }
    return $out . '</nav>';
}

function section_head(string $title, string $href = '', string $more = 'More'): string
{
    return '<header class="section-head"><h2>' . ($href ? '<a href="' . e($href) . '">' . e($title) . '</a>' : e($title)) . '</h2>'
        . ($href ? '<a class="more" href="' . e($href) . '">' . e($more) . ' ' . icon('arrow') . '</a>' : '') . '</header>';
}

function social_links(): string
{
    $out = '';
    foreach (['facebook' => 'social_facebook', 'x' => 'social_x', 'instagram' => 'social_instagram', 'youtube' => 'social_youtube', 'tiktok' => 'social_tiktok', 'telegram' => 'social_telegram', 'linkedin' => 'social_linkedin'] as $icon => $key) {
        if ($u = setting($key)) {
            $out .= '<a href="' . e($u) . '" rel="me noopener" target="_blank" aria-label="' . ucfirst($icon) . '">' . icon($icon) . '</a>';
        }
    }
    return $out;
}
