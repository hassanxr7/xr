<?php
require __DIR__ . '/_init.php';
require __DIR__ . '/_charts.php';

require_role('editor');

if (is_post()) {
    csrf_check();
    $do = (string) input('do');
    if ($do === 'chat') {
        $brief = trim((string) ($_POST['brief'] ?? ''));
        if (mb_strlen($brief) >= 2) {
            newsroom_assign($brief);
            redirect('admin/newsroom.php?kick=1#chat-log'); // the page starts the team right away
        }
    } elseif ($do === 'settings' && can('admin')) {
        $min = max(1, min(50, (int) input('ai_daily_min', 7)));
        $max = max($min, min(60, (int) input('ai_daily_max', 20)));
        save_setting('ai_newsroom_enabled', input('ai_newsroom_enabled') === '1' ? '1' : '0');
        save_setting('ai_daily_min', (string) $min);
        save_setting('ai_daily_max', (string) $max);
        save_setting('ai_autopublish', input('ai_autopublish') === '1' ? '1' : '0');
        save_setting('ai_push', input('ai_push') === '1' ? '1' : '0');
        save_setting('ai_min_confidence', (string) max(50, min(100, (int) input('ai_min_confidence', 75))));
        save_setting('ai_focus', mb_substr(trim((string) input('ai_focus')), 0, 1500));
        save_setting('ai_language', input('ai_language') === 'so' ? 'so' : 'en');
        save_setting('ai_sections', implode(',', array_map('intval', (array) ($_POST['ai_sections'] ?? []))));
        if (($k = trim((string) input('ai_image_key'))) !== '') {
            save_setting('ai_image_key', $k);
        }
        if (input('ai_image_key_clear') === '1') {
            save_setting('ai_image_key', '');
        }
        q('DELETE FROM settings WHERE `key` = ?', ['ai_target_' . date('Ymd')]); // new range applies today
        settings(true);
        audit('newsroom settings');
        flash('success', __('Newsroom settings saved.'));
    }
    redirect('admin/newsroom.php');
}

$stats = newsroom_stats();
$messages = array_reverse(rows('SELECT * FROM ai_messages ORDER BY id DESC LIMIT 60'));
$jobs = rows('SELECT j.*, a.views, a.slug, a.published_at, a.status AS a_status FROM ai_jobs j LEFT JOIN articles a ON a.id = j.article_id ORDER BY j.id DESC LIMIT 40');
$last = [];
foreach (['alex', 'kristov', 'david'] as $k) {
    $last[$k] = row('SELECT body, created_at FROM ai_messages WHERE sender = ? ORDER BY id DESC LIMIT 1', [$k]);
}
$stageLabels = ['researched' => __('Researched — waiting for Kristov'), 'written' => __('Written — waiting for David'), 'revise' => __('Sent back for changes'),
    'published' => __('Published'), 'rejected' => __('Rejected'), 'failed' => __('Failed')];
$allowed = array_filter(array_map('intval', explode(',', setting('ai_sections'))));

admin_header(__('AI Newsroom'));
?>
<div class="page-head"><h1>✦ <?= __('AI Newsroom') ?></h1>
  <div><span class="st <?= newsroom_enabled() ? 'st-published' : 'st-draft' ?>"><?= newsroom_enabled() ? __('Working automatically') : __('Paused') ?></span>
  <button type="button" class="a-btn a-btn-primary js-newsroom-step"<?= ai_enabled() ? '' : ' disabled' ?>>▶ <?= __('Run next step now') ?></button></div>
</div>
<?php if (!ai_enabled()): ?><div class="a-flash a-flash-error"><?= __('Add your Anthropic API key in Settings → AI assistant to start the newsroom.') ?></div><?php endif; ?>
<?php $cronAt = setting('cron_last_run'); $cronOk = $cronAt !== '' && strtotime($cronAt) > time() - 1800; $cronCmd = '/usr/bin/php ' . BASE_PATH . '/cron.php'; ?>
<?php if ($cronOk): ?>
  <div class="a-flash a-flash-success"><?= __('Automatic mode is on: the server runs the team every few minutes, even when your computer is off.') ?> <?= __('Last automatic run') ?>: <?= e(time_ago($cronAt)) ?>.</div>
<?php else: ?>
  <div class="a-flash a-flash-error">
    <strong><?= __('The cron job is not running yet — the team only works while this page is open.') ?></strong><br>
    <?= __('hPanel → Advanced → Cron Jobs → Custom → Command to run:') ?> <code class="break"><?= e($cronCmd) ?></code>
    <button type="button" class="a-btn a-btn-sm js-copy" data-copy="<?= e($cronCmd) ?>"><?= __('Copy') ?></button><br>
    <?= __('Schedule: minute */10, every hour, every day, every month, every weekday → Save.') ?>
    <?= $cronAt ? ' ' . __('Last run') . ': ' . e(time_ago($cronAt)) . '.' : '' ?>
  </div>
<?php endif; ?>
<?php $cur = newsroom_current(); ?>
<p class="newsroom-status<?= $cur ? ' busy' : '' ?>" aria-live="polite"><?= $cur ? e($cur['text']) : '' ?></p>

<div class="tiles">
  <?= stat_tile(__('Published today'), $stats['today'] . ' / ' . $stats['target'], __('daily target')) ?>
  <?= stat_tile(__('Last 7 days'), fmt_num($stats['week']), fmt_num($stats['rejected']) . ' ' . __('rejected by David')) ?>
  <?= stat_tile(__('In the pipeline'), fmt_num($stats['queue'])) ?>
  <?= stat_tile(__('AI stories total'), fmt_num($stats['total'])) ?>
  <?= stat_tile(__('Views of AI stories'), fmt_num($stats['views_total']), fmt_num($stats['views_7']) . ' ' . __('in 7 days')) ?>
</div>

<div class="agents">
  <?php foreach ([['alex', __('Researches world news, picks stories, collects facts & sources')], ['kristov', __('Writes the story, subtitle, SEO, tags and finds the photo')], ['david', __('Fact-checks, corrects, approves and publishes')]] as [$k, $role]): $ag = AGENTS[$k]; ?>
    <div class="agent agent-<?= $k ?>">
      <div class="agent-avatar"><?= e(mb_substr($ag['name'], 0, 1)) ?></div>
      <div><strong><?= e($ag['name']) ?></strong> <small><?= e($ag['title']) ?></small>
        <p><?= e($role) ?></p>
        <p class="muted small"><?= $last[$k] ? e(time_ago($last[$k]['created_at']) . ': ' . str_limit($last[$k]['body'], 120)) : e(__('No activity yet.')) ?></p></div>
    </div>
  <?php endforeach; ?>
</div>

<div class="grid-2">
  <section class="card chat">
    <h2><?= __('Chat with the newsroom') ?></h2>
    <div class="chat-log" id="chat-log" data-last="<?= (int) (end($messages)['id'] ?? 0) ?>" data-kick="<?= isset($_GET['kick']) && ai_enabled() ? '1' : '' ?>">
      <?php foreach ($messages as $msg): ?>
        <?= newsroom_message_html($msg) ?>
      <?php endforeach; ?>
      <?php if (!$messages): ?><p class="hint"><?= __('Tell the team what to work on, e.g. “Find the 3 most important stories about Somalia today” or “Write about the Bank of Canada rate decision”.') ?></p><?php endif; ?>
    </div>
    <form method="post" class="chat-form">
      <?= csrf_field() ?><input type="hidden" name="do" value="chat">
      <textarea name="brief" rows="3" required minlength="2" placeholder="<?= e(__('Message Alex: what should the team cover?')) ?>"></textarea>
      <button class="a-btn a-btn-primary"><?= __('Send') ?></button>
    </form>
  </section>

  <section class="card">
    <h2><?= __('Pipeline') ?></h2>
    <div class="table-wrap"><table class="list">
      <thead><tr><th><?= __('Story') ?></th><th><?= __('Stage') ?></th><th class="num"><?= __('Views') ?></th></tr></thead>
      <tbody>
      <?php foreach ($jobs as $j): $rev = json_decode((string) $j['review'], true) ?: []; ?>
        <tr><td><?php if ($j['article_id'] && $j['slug']): ?><a href="<?= e(url('admin/article.php?id=' . $j['article_id'])) ?>"><?= e($j['topic']) ?></a><?php else: ?><?= e($j['topic']) ?><?php endif; ?>
          <div class="muted small"><?= e(time_ago($j['updated_at'])) ?><?= $j['error'] ? ' · ' . e(str_limit($j['error'], 90)) : '' ?><?= $j['stage'] === 'rejected' && !empty($rev['issues']) ? ' · ' . e(str_limit(implode(' ', $rev['issues']), 120)) : '' ?></div></td>
          <td><span class="st st-<?= e(['published' => 'published', 'rejected' => 'draft', 'failed' => 'draft'][$j['stage']] ?? 'pending') ?>"><?= e($stageLabels[$j['stage']] ?? $j['stage']) ?></span></td>
          <td class="num"><?= $j['article_id'] ? fmt_num((int) $j['views']) : '—' ?></td></tr>
      <?php endforeach; ?>
      <?php if (!$jobs): ?><tr><td colspan="3" class="muted"><?= __('Nothing yet.') ?></td></tr><?php endif; ?>
      </tbody>
    </table></div>
  </section>
</div>

<?php if (can('admin')): ?>
<form method="post" class="card a-form">
  <?= csrf_field() ?><input type="hidden" name="do" value="settings">
  <h2><?= __('Newsroom settings') ?></h2>
  <?= checkbox('ai_newsroom_enabled', __('Work automatically every day (runs with the cron job)'), setting('ai_newsroom_enabled', '0') === '1') ?>
  <div class="row-3">
    <?= field('ai_daily_min', __('Minimum stories per day'), setting('ai_daily_min', '7'), 'number', ['min' => 1, 'max' => 50]) ?>
    <?= field('ai_daily_max', __('Maximum stories per day'), setting('ai_daily_max', '20'), 'number', ['min' => 1, 'max' => 60]) ?>
    <?= field('ai_min_confidence', __('David must be at least this sure (%)'), setting('ai_min_confidence', '75'), 'number', ['min' => 50, 'max' => 100]) ?>
  </div>
  <?= checkbox('ai_autopublish', __('Publish automatically after David approves'), setting('ai_autopublish', '1') === '1', __('Off = approved stories wait in Stories → Waiting for review for a human editor.')) ?>
  <?= checkbox('ai_push', __('Send a push alert for trending AI stories'), setting('ai_push', '0') === '1') ?>
  <?= field('ai_focus', __('Editorial focus (what the team should prioritise)'), setting('ai_focus'), 'textarea', ['rows' => 3, 'placeholder' => __('e.g. Canada and Somalia first; politics, courts, business; avoid celebrity gossip.')]) ?>
  <?= select_field('ai_language', __('Language of AI stories'), ['en' => 'English', 'so' => 'Soomaali'], setting('ai_language', 'en')) ?>
  <fieldset class="f"><legend><?= __('Sections the team may write for (none ticked = all)') ?></legend><div class="checks-grid">
    <?php foreach (categories() as $c): ?><label><input type="checkbox" name="ai_sections[]" value="<?= (int) $c['id'] ?>"<?= in_array((int) $c['id'], $allowed, true) ? ' checked' : '' ?>> <?= e($c['name']) ?></label><?php endforeach; ?>
  </div></fieldset>
  <h3><?= __('Photos') ?></h3>
  <p class="hint"><?= __('Kristov first looks for free-licence photos (CC0, public domain, CC BY, CC BY-SA) on Openverse and credits them. If none fits and you add an OpenAI key, he generates an illustration that is labelled “AI-generated illustration”. Otherwise the section image is used.') ?></p>
  <?= field('ai_image_key', __('OpenAI API key for illustrations (optional)'), '', 'password', ['autocomplete' => 'off', 'placeholder' => setting('ai_image_key') !== '' ? '•••••••• ' . __('saved') : 'sk-…']) ?>
  <?php if (setting('ai_image_key') !== ''): ?><?= checkbox('ai_image_key_clear', __('Remove the saved image key'), false) ?><?php endif; ?>
  <button class="a-btn a-btn-primary"><?= __('Save settings') ?></button>
</form>
<?php endif; ?>
<?php admin_footer(); ?>
