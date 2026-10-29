<?php
require __DIR__ . '/_init.php';
require __DIR__ . '/_charts.php';

require_role('editor');
stats_rollup();

$today = date('Y-m-d');
$ranges = [
    'today' => [__('Today'), $today, $today],
    'yesterday' => [__('Yesterday'), date('Y-m-d', strtotime('-1 day')), date('Y-m-d', strtotime('-1 day'))],
    '7d' => [__('Last 7 days'), date('Y-m-d', strtotime('-6 days')), $today],
    '30d' => [__('Last 30 days'), date('Y-m-d', strtotime('-29 days')), $today],
    'month' => [__('This month'), date('Y-m-01'), $today],
    'lastmonth' => [__('Last month'), date('Y-m-01', strtotime('first day of last month')), date('Y-m-t', strtotime('first day of last month'))],
    '12m' => [__('Last 12 months'), date('Y-m-01', strtotime('-11 months')), $today],
    'year' => [__('This year'), date('Y-01-01'), $today],
    'all' => [__('All time'), (string) (val('SELECT MIN(day) FROM stats_daily') ?: $today), $today],
];
$r = (string) input('range', '7d');
if ($r === 'custom' && preg_match('~^\d{4}-\d{2}-\d{2}$~', (string) input('from')) && preg_match('~^\d{4}-\d{2}-\d{2}$~', (string) input('to'))) {
    $from = min((string) input('from'), (string) input('to'));
    $to = max((string) input('from'), (string) input('to'));
    $label = fmt_date($from) . ' – ' . fmt_date($to);
} else {
    $r = isset($ranges[$r]) ? $r : '7d';
    [$label, $from, $to] = $ranges[$r];
}
$from = min($from, $to);
$days = (int) round((strtotime($to) - strtotime($from)) / 86400) + 1;
$unit = (string) input('unit', $days <= 1 ? 'hour' : ($days <= 62 ? 'day' : ($days <= 1100 ? 'month' : 'year')));
if (!in_array($unit, ['hour', 'day', 'month', 'year'], true)) {
    $unit = 'day';
}

$totals = stats_totals($from, $to);
$prevTo = date('Y-m-d', strtotime($from . ' -1 day'));
$prevFrom = date('Y-m-d', strtotime($prevTo . ' -' . ($days - 1) . ' days'));
$prev = stats_totals($prevFrom, $prevTo);
$series = stats_series($unit, $from, $to);
$fmt = ['hour' => fn ($l) => $l, 'day' => fn ($l) => date('M j', strtotime($l)), 'month' => fn ($l) => date('M Y', strtotime($l . '-01')), 'year' => fn ($l) => $l][$unit];
$live = stats_realtime(5);

$change = function (int $now, int $before): string {
    if ($before <= 0) {
        return '';
    }
    $p = round(($now - $before) / $before * 100);
    return '<span class="' . ($p >= 0 ? 'up' : 'down') . '">' . ($p >= 0 ? '▲' : '▼') . ' ' . abs($p) . '%</span> ' . e(__('vs previous period'));
};
$countries = stats_by('country', $from, $to, 25);
$cities = stats_by('city', $from, $to, 25);
$sources = stats_by('source', $from, $to, 20);
$refs = stats_by('ref', $from, $to, 20);
$campaigns = stats_by('campaign', $from, $to, 15);
$devices = stats_by('device', $from, $to, 5);
$browsers = stats_by('browser', $from, $to, 8);
$oses = stats_by('os', $from, $to, 8);
$articlesTop = stats_by('article', $from, $to, 25);

admin_header(__('Analytics'));
?>
<div class="page-head"><h1><?= __('Analytics') ?> <small><?= e($label) ?></small></h1>
  <span class="live-dot"><?= fmt_num($live['visitors']) ?> <?= __('reading now') ?></span></div>

<form class="filters" method="get">
  <nav class="tabs inline">
    <?php foreach ($ranges as $k => [$l]): ?><a href="?range=<?= $k ?>"<?= $r === $k ? ' class="on"' : '' ?>><?= e($l) ?></a><?php endforeach; ?>
  </nav>
  <input type="hidden" name="range" value="custom">
  <input type="date" name="from" value="<?= e($from) ?>"> – <input type="date" name="to" value="<?= e($to) ?>">
  <button class="a-btn"><?= __('Show') ?></button>
</form>

<div class="tiles">
  <?= stat_tile(__('Page views'), fmt_num($totals['views']), $change($totals['views'], $prev['views'])) ?>
  <?= stat_tile(__('Visitors'), fmt_num($totals['visitors']), $totals['exact'] ? $change($totals['visitors'], $prev['visitors']) : e(__('sum of daily visitors'))) ?>
  <?= stat_tile(__('New visitors'), fmt_num($totals['new'])) ?>
  <?= stat_tile(__('Pages per visitor'), $totals['visitors'] ? number_format($totals['views'] / $totals['visitors'], 2) : '0') ?>
</div>

<section class="card">
  <div class="card-head"><h2><?= __('Views and visitors') ?></h2>
    <nav class="tabs inline small">
      <?php foreach (['hour' => __('By hour'), 'day' => __('By day'), 'month' => __('By month'), 'year' => __('By year')] as $k => $l): ?>
        <a href="?<?= e(http_build_query(['range' => $r, 'from' => $from, 'to' => $to, 'unit' => $k])) ?>"<?= $unit === $k ? ' class="on"' : '' ?>><?= e($l) ?></a>
      <?php endforeach; ?>
    </nav></div>
  <?= views_chart($series, $fmt, __('Views and visitors')) ?>
  <?php if ($unit === 'hour' && $days > 1): ?><p class="hint"><?= __('Hours are added up over the whole period — this shows when readers are most active.') ?></p><?php endif; ?>
</section>

<div class="grid-2">
  <section class="card"><h2><?= __('Countries') ?></h2>
    <?= rank_table(array_map(fn ($k, $v) => [flag((string) $k) . ' ' . e($k !== '' ? country_name((string) $k) : __('Unknown')), $v['views'], $v['visitors']], array_keys($countries), $countries), __('Country')) ?></section>
  <section class="card"><h2><?= __('Cities') ?></h2>
    <?php if (!$cities && !geoip_file() && empty($_SERVER['HTTP_CF_IPCITY'])): ?><p class="hint"><?= __('City data needs the free city database: Settings → Analytics → Download.') ?></p><?php endif; ?>
    <?= rank_table(array_map(function ($k, $v) { [$city, $cc] = array_pad(explode('|', (string) $k), 2, ''); return [flag($cc) . ' ' . e($city) . ($cc ? ' <span class="muted">' . e($cc) . '</span>' : ''), $v['views'], $v['visitors']]; }, array_keys($cities), $cities), __('City')) ?></section>
  <section class="card"><h2><?= __('Where readers come from') ?></h2>
    <?= rank_table(array_map(fn ($k, $v) => [e(source_label((string) $k)), $v['views'], $v['visitors']], array_keys($sources), $sources), __('Source')) ?>
    <p class="hint"><?= __('WhatsApp and some apps hide the link they come from. Share buttons on the site add a tag so these visits are still counted correctly.') ?></p></section>
  <section class="card"><h2><?= __('Referring websites') ?></h2>
    <?= rank_table(array_map(fn ($k, $v) => [e($k), $v['views'], $v['visitors']], array_keys($refs), $refs), __('Website')) ?></section>
  <section class="card span-2"><h2><?= __('Top stories') ?></h2>
    <?php $rowsA = []; foreach ($articlesTop as $id => $v) { if ($a = article((int) $id)) { $c = category((int) $a['category_id']); $rowsA[] = ['<a href="' . e(article_url($a)) . '" target="_blank" rel="noopener">' . e($a['title']) . '</a> <span class="muted small">' . e($c['name'] ?? '') . '</span>', $v['views'], $v['visitors']]; } } echo rank_table($rowsA, __('Story')); ?></section>
  <section class="card"><h2><?= __('Devices') ?></h2>
    <?= rank_table(array_map(fn ($k, $v) => [e(ucfirst((string) $k)), $v['views'], $v['visitors']], array_keys($devices), $devices), __('Device')) ?></section>
  <section class="card"><h2><?= __('Browsers & systems') ?></h2>
    <?= rank_table(array_merge(array_map(fn ($k, $v) => [e($k), $v['views'], $v['visitors']], array_keys($browsers), $browsers)), __('Browser')) ?>
    <?= rank_table(array_map(fn ($k, $v) => [e($k), $v['views'], $v['visitors']], array_keys($oses), $oses), __('System')) ?></section>
  <?php if ($campaigns): ?>
  <section class="card"><h2><?= __('Campaigns (utm_campaign)') ?></h2>
    <?= rank_table(array_map(fn ($k, $v) => [e($k), $v['views'], $v['visitors']], array_keys($campaigns), $campaigns), __('Campaign')) ?></section>
  <?php endif; ?>
  <section class="card"><h2><?= __('Right now') ?> <small class="muted"><?= __('last 30 minutes') ?></small></h2>
    <table class="list"><?php foreach ($live['pages'] as $p): ?><tr><td><a href="<?= e($p['path']) ?>" target="_blank" rel="noopener"><?= e(str_limit($p['path'], 70)) ?></a></td><td class="num"><?= fmt_num($p['n']) ?></td></tr><?php endforeach; ?>
    <?php if (!$live['pages']): ?><tr><td class="muted"><?= __('No readers in the last 30 minutes.') ?></td></tr><?php endif; ?></table></section>
</div>
<p class="hint"><?= __('Visitor counts use an anonymous browser ID; IP addresses are never stored. Location data: Cloudflare or the city database.') ?> <?php if (geoip_file() && strpos((string) geoip_file(), 'dbip') !== false): ?><a href="https://db-ip.com" rel="noopener" target="_blank">IP Geolocation by DB-IP</a><?php endif; ?></p>
<?php admin_footer(); ?>
