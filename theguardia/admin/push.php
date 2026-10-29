<?php
require __DIR__ . '/_init.php';
require __DIR__ . '/_charts.php';

require_role('editor');
if (setting('vapid_public') === '') {
    vapid_generate();
}

if (is_post()) {
    csrf_check();
    $title = trim((string) input('title'));
    $link = trim((string) input('url'));
    $articleId = (int) input('article_id');
    if ($articleId && ($a = article($articleId)) && $a['status'] === 'published') {
        $mid = push_article($a);
        if ($title !== '') {
            update('push_messages', ['title' => mb_substr($title, 0, 120)], 'id = ?', [$mid]);
        }
    } elseif ($title !== '' && filter_var($link, FILTER_VALIDATE_URL)) {
        $mid = push_queue($title, (string) input('body'), $link, null, null, (int) input('audience') ?: null);
    } else {
        flash('error', __('Choose a story, or enter a title and a full link.'));
        redirect('admin/push.php');
    }
    audit('push', $title);
    redirect('admin/push.php?sending=' . $mid);
}

$subs = (int) val('SELECT COUNT(*) FROM push_subscriptions');
$new7 = (int) val('SELECT COUNT(*) FROM push_subscriptions WHERE created_at >= ?', [date('Y-m-d', strtotime('-6 days'))]);
$byDevice = rows('SELECT COALESCE(device, \'?\') k, COUNT(*) n FROM push_subscriptions GROUP BY k ORDER BY n DESC');
$byCountry = rows('SELECT COALESCE(country, \'\') k, COUNT(*) n FROM push_subscriptions GROUP BY k ORDER BY n DESC LIMIT 10');
$history = rows('SELECT * FROM push_messages ORDER BY id DESC LIMIT 25');
$recent = rows("SELECT id, title FROM articles WHERE status = 'published' AND push_sent = 0 ORDER BY published_at DESC LIMIT 25");
$sending = (int) input('sending');

admin_header(__('Push alerts'));
?>
<div class="page-head"><h1><?= __('Push alerts') ?></h1></div>
<?php if ($sending): ?><div class="a-flash a-flash-success" data-push-message="<?= $sending ?>"><?= __('Sending…') ?></div><?php endif; ?>
<div class="tiles">
  <?= stat_tile(__('Subscribers'), fmt_num($subs), '+' . fmt_num($new7) . ' ' . __('in 7 days')) ?>
  <?php foreach (array_slice($byDevice, 0, 3) as $d): ?><?= stat_tile(ucfirst($d['k']), fmt_num($d['n'])) ?><?php endforeach; ?>
</div>
<div class="grid-2">
  <form method="post" class="card a-form">
    <?= csrf_field() ?>
    <h2><?= __('Send an alert') ?></h2>
    <label class="f"><span><?= __('Story') ?></span><select name="article_id"><option value=""><?= __('— a custom message instead —') ?></option>
      <?php foreach ($recent as $a): ?><option value="<?= (int) $a['id'] ?>"><?= e(str_limit($a['title'], 90)) ?></option><?php endforeach; ?></select></label>
    <?= field('title', __('Title (optional for a story)'), '', 'text', ['maxlength' => 120]) ?>
    <?= field('body', __('Text (custom message)'), '', 'text', ['maxlength' => 240]) ?>
    <?= field('url', __('Link (custom message)'), '', 'url', ['placeholder' => abs_url('')]) ?>
    <label class="f"><span><?= __('Audience') ?></span><select name="audience"><option value=""><?= __('Everyone') ?></option><?= str_replace('<option value="">' . e(__('— Choose a section —')) . '</option>', '', category_options(null)) ?></select>
      <small class="hint"><?= __('A section = only readers who followed that section.') ?></small></label>
    <button class="a-btn a-btn-primary js-confirm" data-confirm="<?= e(__('Send this alert to subscribers now?')) ?>">🔔 <?= __('Send now') ?></button>
    <p class="hint"><?= __('Use alerts for important news only — too many alerts make readers unsubscribe.') ?></p>
  </form>
  <section class="card"><h2><?= __('Subscribers by country') ?></h2>
    <?= rank_table(array_map(fn ($r) => [flag($r['k']) . ' ' . e($r['k'] ? country_name($r['k']) : __('Unknown')), (int) $r['n'], 0], $byCountry), __('Country'), false) ?></section>
</div>
<section class="card"><h2><?= __('History') ?></h2>
  <div class="table-wrap"><table class="list"><thead><tr><th><?= __('Alert') ?></th><th><?= __('Date') ?></th><th class="num"><?= __('Sent') ?></th><th class="num"><?= __('Clicks') ?></th><th><?= __('Status') ?></th></tr></thead><tbody>
  <?php foreach ($history as $m): ?>
    <tr><td><a href="<?= e($m['url']) ?>" target="_blank" rel="noopener"><?= e($m['title']) ?></a></td><td class="muted nowrap"><?= e(fmt_date($m['created_at'], 'M j, H:i')) ?></td>
      <td class="num"><?= fmt_num($m['sent']) ?> / <?= fmt_num($m['total']) ?></td><td class="num"><?= fmt_num($m['clicks']) ?><?= $m['sent'] ? ' <span class="muted">(' . round($m['clicks'] / max(1, $m['sent']) * 100, 1) . '%)</span>' : '' ?></td><td><?= e($m['status']) ?></td></tr>
  <?php endforeach; ?>
  <?php if (!$history): ?><tr><td colspan="5" class="muted"><?= __('No alerts sent yet.') ?></td></tr><?php endif; ?>
  </tbody></table></div>
</section>
<?php admin_footer(); ?>
