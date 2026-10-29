<?php
/**
 * The Guardia — common setup for every dashboard page (session, security headers, layout).
 */
require dirname(__DIR__) . '/app/bootstrap.php';

start_session();
send_admin_headers();
header('X-Robots-Tag: noindex, nofollow');

if (isset($_GET['lang']) && in_array($_GET['lang'], ['en', 'so'], true)) {
    $_SESSION['admin_lang'] = $_GET['lang'];
    $params = $_GET;
    unset($params['lang']);
    redirect(strtok($_SERVER['REQUEST_URI'], '?') . ($params ? '?' . http_build_query($params) : ''));
}

/** Dashboard navigation: [file, label, icon, minimum role]. */
function admin_nav(): array
{
    return [
        ['index.php', __('Dashboard'), '◧', 'writer'],
        ['articles.php', __('Stories'), '✎', 'writer'],
        ['article.php', __('Write a story'), '＋', 'writer'],
        ['newsroom.php', __('AI Newsroom'), '✦', 'editor'],
        ['media.php', __('Images'), '▣', 'writer'],
        ['analytics.php', __('Analytics'), '▥', 'editor'],
        ['push.php', __('Push alerts'), '🔔', 'editor'],
        ['imports.php', __('Imports'), '⇩', 'editor'],
        ['categories.php', __('Sections'), '☰', 'editor'],
        ['tags.php', __('Tags'), '#', 'editor'],
        ['pages.php', __('Pages'), '▤', 'editor'],
        ['photos.php', __('Photo store'), '◉', 'editor'],
        ['photo_orders.php', __('Photo orders'), '$', 'editor'],
        ['ads.php', __('Advertising'), '▭', 'admin'],
        ['messages.php', __('Messages'), '✉', 'editor'],
        ['users.php', __('Team'), '☺', 'admin'],
        ['settings.php', __('Settings'), '⚙', 'admin'],
    ];
}

function admin_header(string $title, string $active = ''): void
{
    $u = user();
    $active = $active ?: basename($_SERVER['SCRIPT_NAME']);
    $unread = $u && can('editor') ? (int) val('SELECT COUNT(*) FROM contact_messages WHERE is_read = 0') : 0;
    $orders = $u && can('editor') ? (int) val("SELECT COUNT(*) FROM photo_orders WHERE status = 'request'") : 0;
    $pending = $u && can('editor') ? (int) val("SELECT COUNT(*) FROM articles WHERE status = 'pending'") : 0;
    ?><!doctype html>
<html lang="<?= admin_lang() ?>"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title><?= e($title) ?> · <?= e(site_name()) ?></title>
<link rel="stylesheet" href="<?= e(asset('css/admin.css')) ?>">
<link rel="icon" href="<?= e(url('assets/img/favicon.svg')) ?>" type="image/svg+xml">
</head><body data-base="<?= e(base_url()) ?>" data-csrf="<?= e(csrf_token()) ?>">
<?php if ($u): ?>
<header class="a-top">
  <button type="button" class="a-burger js-nav" aria-label="Menu">☰</button>
  <a class="a-brand" href="<?= e(url('admin/')) ?>"><img src="<?= e(url('assets/img/logo-compact-white.svg')) ?>" alt="" width="120" height="41"><span><?= __('Newsroom') ?></span></a>
  <div class="a-top-right">
    <a href="<?= e(url('')) ?>" target="_blank" rel="noopener"><?= __('View site') ?> ↗</a>
    <a href="?lang=<?= admin_lang() === 'en' ? 'so' : 'en' ?>" class="a-lang"><?= admin_lang() === 'en' ? 'Soomaali' : 'English' ?></a>
    <a href="<?= e(url('admin/profile.php')) ?>"><?= e($u['name']) ?></a>
    <a href="<?= e(url('admin/logout.php')) ?>"><?= __('Sign out') ?></a>
  </div>
</header>
<div class="a-shell">
<nav class="a-nav" id="a-nav">
  <?php foreach (admin_nav() as [$file, $label, $icon, $role]): if (!can($role)) continue; ?>
    <a href="<?= e(url('admin/' . $file)) ?>"<?= $active === $file ? ' class="on"' : '' ?>><span class="ic"><?= $icon ?></span><?= e($label) ?>
      <?php if ($file === 'messages.php' && $unread): ?><b class="badge"><?= $unread ?></b><?php endif; ?>
      <?php if ($file === 'photo_orders.php' && $orders): ?><b class="badge"><?= $orders ?></b><?php endif; ?>
      <?php if ($file === 'articles.php' && $pending): ?><b class="badge"><?= $pending ?></b><?php endif; ?>
    </a>
  <?php endforeach; ?>
</nav>
<main class="a-main">
<?php endif; ?>
<?php foreach (flashes() as [$type, $msg]): ?><div class="a-flash a-flash-<?= e($type) ?>"><?= e($msg) ?></div><?php endforeach;
}

function admin_footer(): void
{
    $u = user();
    if ($u) {
        echo '</main></div>';
    }
    echo '<script src="' . e(asset('js/admin.js')) . '" nonce="' . e(csp_nonce()) . '"></script></body></html>';
}

/** Small helpers for forms. */
function field(string $name, string $label, $value = '', string $type = 'text', array $attrs = []): string
{
    $extra = '';
    foreach ($attrs as $k => $v) {
        $extra .= $v === true ? ' ' . $k : ' ' . $k . '="' . e($v) . '"';
    }
    $hint = isset($attrs['data-hint']) ? '<small class="hint">' . e($attrs['data-hint']) . '</small>' : '';
    if ($type === 'textarea') {
        return '<label class="f"><span>' . e($label) . '</span><textarea name="' . e($name) . '"' . $extra . '>' . e($value) . '</textarea>' . $hint . '</label>';
    }
    return '<label class="f"><span>' . e($label) . '</span><input type="' . e($type) . '" name="' . e($name) . '" value="' . e($value) . '"' . $extra . '>' . $hint . '</label>';
}

function checkbox(string $name, string $label, bool $checked, string $hint = ''): string
{
    return '<label class="f-check"><input type="hidden" name="' . e($name) . '" value="0"><input type="checkbox" name="' . e($name) . '" value="1"' . ($checked ? ' checked' : '') . '> <span>' . e($label)
        . ($hint ? '<small class="hint">' . e($hint) . '</small>' : '') . '</span></label>';
}

function select_field(string $name, string $label, array $options, $value, string $hint = ''): string
{
    $out = '<label class="f"><span>' . e($label) . '</span><select name="' . e($name) . '">';
    foreach ($options as $k => $v) {
        $out .= '<option value="' . e($k) . '"' . ((string) $k === (string) $value ? ' selected' : '') . '>' . e($v) . '</option>';
    }
    return $out . '</select>' . ($hint ? '<small class="hint">' . e($hint) . '</small>' : '') . '</label>';
}

/** Category <option>s with sub-sections indented. */
function category_options(?int $selected, bool $blank = true): string
{
    $out = $blank ? '<option value="">' . e(__('— Choose a section —')) . '</option>' : '';
    $walk = function (?int $parent, int $depth) use (&$walk, &$out, $selected) {
        foreach (categories() as $c) {
            if ((int) $c['parent_id'] === (int) $parent) {
                $out .= '<option value="' . (int) $c['id'] . '"' . ((int) $c['id'] === (int) $selected ? ' selected' : '') . '>' . str_repeat('— ', $depth) . e($c['name']) . '</option>';
                $walk((int) $c['id'], $depth + 1);
            }
        }
    };
    $walk(null, 0);
    return $out;
}

function status_badge(string $status): string
{
    $labels = ['published' => __('Published'), 'draft' => __('Draft'), 'pending' => __('Waiting for review'), 'scheduled' => __('Scheduled')];
    return '<span class="st st-' . e($status) . '">' . e($labels[$status] ?? $status) . '</span>';
}

function admin_pager(int $page, int $pages, array $params): string
{
    if ($pages <= 1) {
        return '';
    }
    $out = '<nav class="a-pager">';
    foreach (pager_pages($page, $pages) as $p) {
        if ($p === '…') {
            $out .= '<span>…</span>';
        } else {
            $out .= $p === $page ? '<b>' . $p . '</b>' : '<a href="?' . e(http_build_query(['page' => $p] + $params)) . '">' . $p . '</a>';
        }
    }
    return $out . '</nav>';
}
