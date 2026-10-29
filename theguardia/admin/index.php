<?php
require __DIR__ . '/_init.php';
require __DIR__ . '/_charts.php';

$u = require_role('writer');
stats_rollup();
$today = date('Y-m-d');
$t = stats_totals($today, $today);
$y = stats_totals(date('Y-m-d', strtotime('-1 day')), date('Y-m-d', strtotime('-1 day')));
$month = stats_totals(date('Y-m-01'), $today);
$live = stats_realtime(5);
$series = stats_series('day', date('Y-m-d', strtotime('-13 days')), $today);
$sources = stats_by('source', $today, $today, 6);
$topArticles = stats_by('article', $today, $today, 8);
$stories = (int) val("SELECT COUNT(*) FROM articles WHERE status = 'published'");
$storiesMonth = (int) val("SELECT COUNT(*) FROM articles WHERE status = 'published' AND published_at >= ?", [date('Y-m-01')]);
$subs = (int) val('SELECT COUNT(*) FROM push_subscriptions');
$mine = rows('SELECT id, title, status, published_at, updated_at FROM articles WHERE ' . (can('editor') ? '1' : 'author_id = ' . (int) $u['id']) . ' ORDER BY COALESCE(updated_at, created_at) DESC LIMIT 8');

$checklist = [];
if (can('admin')) {
    $checklist = [
        [setting('adsense_client') !== '', __('Connect Google AdSense'), 'ads.php'],
        [ai_enabled(), __('Add the AI assistant key (Anthropic)'), 'settings.php#ai'],
        [setting('cron_last_run') !== '' && strtotime(setting('cron_last_run')) > time() - 3600, __('Set up the cron job (imports, push, stats)'), 'settings.php#cron'],
        [geoip_file() !== null, __('Download the city database (visitor cities)'), 'settings.php#analytics'],
        [(int) val('SELECT COUNT(*) FROM articles WHERE external_id IS NOT NULL') > 0, __('Start importing official court news'), 'imports.php'],
        [stripe_enabled(), __('Connect Stripe to sell photos'), 'settings.php#store'],
        [setting('google_verification') !== '', __('Verify the site in Google Search Console'), 'settings.php#seo'],
    ];
}
$todo = array_filter($checklist, fn ($c) => !$c[0]);

admin_header(__('Dashboard'));
?>
<h1><?= __('Good to see you, {name}', ['name' => e(explode(' ', $u['name'])[0])]) ?></h1>

<div class="tiles">
  <?= stat_tile(__('Reading now'), fmt_num($live['visitors']), __('last 5 minutes')) ?>
  <?= stat_tile(__('Views today'), fmt_num($t['views']), __('Yesterday') . ': ' . fmt_num($y['views'])) ?>
  <?= stat_tile(__('Visitors today'), fmt_num($t['visitors']), __('This month') . ': ' . fmt_num($month['visitors'])) ?>
  <?= stat_tile(__('Published stories'), fmt_num($stories), __('This month') . ': ' . fmt_num($storiesMonth)) ?>
  <?= stat_tile(__('Alert subscribers'), fmt_num($subs)) ?>
</div>

<?php if ($todo): ?>
<section class="card">
  <h2><?= __('Finish setting up') ?></h2>
  <ul class="checklist"><?php foreach ($checklist as [$ok, $label, $link]): ?><li class="<?= $ok ? 'done' : '' ?>"><?= $ok ? '✔' : '○' ?> <a href="<?= e(url('admin/' . $link)) ?>"><?= e($label) ?></a></li><?php endforeach; ?></ul>
</section>
<?php endif; ?>

<div class="grid-2">
  <section class="card span-2">
    <div class="card-head"><h2><?= __('Last 14 days') ?></h2><?php if (can('editor')): ?><a href="<?= e(url('admin/analytics.php')) ?>"><?= __('Full analytics') ?> →</a><?php endif; ?></div>
    <?= views_chart($series, fn ($d) => date('M j', strtotime($d)), __('Views per day, last 14 days')) ?>
  </section>
  <section class="card">
    <h2><?= __('Top stories today') ?></h2>
    <?php
    $rowsA = [];
    foreach ($topArticles as $id => $r) {
        $a = article((int) $id);
        if ($a) {
            $rowsA[] = ['<a href="' . e(article_url($a)) . '" target="_blank" rel="noopener">' . e(str_limit($a['title'], 70)) . '</a>', $r['views'], $r['visitors']];
        }
    }
    echo rank_table($rowsA, __('Story'));
    ?>
  </section>
  <section class="card">
    <h2><?= __('Where readers come from today') ?></h2>
    <?= rank_table(array_map(fn ($k, $r) => [e(source_label((string) $k)), $r['views'], $r['visitors']], array_keys($sources), $sources), __('Source')) ?>
  </section>
  <section class="card span-2">
    <div class="card-head"><h2><?= can('editor') ? __('Recently edited') : __('My stories') ?></h2><a class="a-btn a-btn-primary" href="<?= e(url('admin/article.php')) ?>">＋ <?= __('Write a story') ?></a></div>
    <table class="list">
      <?php foreach ($mine as $a): ?>
        <tr><td><a href="<?= e(url('admin/article.php?id=' . $a['id'])) ?>"><?= e($a['title']) ?></a></td><td><?= status_badge($a['status']) ?></td><td class="muted"><?= e(time_ago($a['updated_at'] ?: $a['published_at'])) ?></td></tr>
      <?php endforeach; ?>
      <?php if (!$mine): ?><tr><td class="muted"><?= __('No stories yet.') ?></td></tr><?php endif; ?>
    </table>
  </section>
</div>
<?php admin_footer(); ?>
