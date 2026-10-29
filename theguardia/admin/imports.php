<?php
require __DIR__ . '/_init.php';

require_role('editor');

if (is_post()) {
    csrf_check();
    $id = (int) input('id');
    if (input('do') === 'delete' && can('admin')) {
        q('DELETE FROM import_sources WHERE id = ?', [$id]);
        flash('success', __('Source removed. Stories already imported stay on the site.'));
    } elseif (input('do') === 'reset') {
        update('import_sources', ['backfill_page' => 0, 'backfill_done' => 0], 'id = ?', [$id]);
        flash('success', __('History import will start again from the newest page.'));
    } else {
        $url = trim((string) input('url'));
        if (!filter_var(str_replace('{page}', '1', $url), FILTER_VALIDATE_URL) || trim((string) input('licence')) === '') {
            flash('error', __('Enter a valid feed address and the licence that allows republishing.'));
            redirect('admin/imports.php');
        }
        $data = [
            'type' => input('type') === 'doj' ? 'doj' : 'rss', 'name' => mb_substr(trim((string) input('name')), 0, 120) ?: parse_url($url, PHP_URL_HOST),
            'url' => $url, 'licence' => mb_substr(trim((string) input('licence')), 0, 200), 'category_id' => (int) input('category_id') ?: null,
            'auto_classify' => (int) (input('auto_classify') === '1'), 'keywords' => trim((string) input('keywords')),
            'since' => preg_match('~^\d{4}-\d{2}-\d{2}$~', (string) input('since')) ? (string) input('since') : '2015-01-01',
            'canonical' => input('canonical') === 'self' ? 'self' : 'source', 'enabled' => (int) (input('enabled') === '1'),
        ];
        $id ? update('import_sources', $data, 'id = ?', [$id]) : insert('import_sources', $data + ['created_at' => now()]);
        flash('success', __('Source saved.'));
    }
    redirect('admin/imports.php');
}

$sources = import_sources();
$edit = (int) input('edit') ? row('SELECT * FROM import_sources WHERE id = ?', [(int) input('edit')]) : (isset($_GET['new']) ? [] : null);
$byCat = [];
foreach (rows("SELECT category_id, COUNT(*) n FROM articles WHERE external_id LIKE 'doj:%' GROUP BY category_id") as $r) {
    $byCat[(int) $r['category_id']] = (int) $r['n'];
}
admin_header(__('Imports'));
?>
<div class="page-head"><h1><?= __('Imports: official & openly licensed news') ?></h1><a class="a-btn a-btn-primary" href="?new=1">＋ <?= __('Add a source') ?></a></div>
<div class="a-flash a-flash-info"><?= __('Only add sources whose licence allows republishing (public domain, CC BY, CC BY-SA, CC BY-ND). Every imported story shows its source and licence and links to the original. By default the canonical link points to the original, so Google does not treat it as duplicate content. Images are never copied.') ?></div>

<?php foreach ($sources as $s): $c = category((int) $s['category_id']); ?>
  <section class="card import-card" data-source="<?= (int) $s['id'] ?>">
    <div class="card-head">
      <div><h2><?= e($s['name']) ?> <?= $s['enabled'] ? '<span class="st st-published">' . __('Automatic') . '</span>' : '<span class="st st-draft">' . __('Off') . '</span>' ?></h2>
        <p class="muted small"><?= e($s['licence']) ?> · <?= __('Section') ?>: <?= e($c['name'] ?? '—') ?><?= $s['auto_classify'] ? ' (' . __('auto-sorted into sub-sections') . ')' : '' ?> · <?= __('since') ?> <?= e($s['since']) ?></p></div>
      <a class="a-btn" href="?edit=<?= (int) $s['id'] ?>"><?= __('Edit') ?></a>
    </div>
    <p><strong><?= fmt_num($s['imported']) ?></strong> <?= __('stories imported') ?> · <?= __('last run') ?>: <?= e($s['last_run'] ? time_ago($s['last_run']) : __('never')) ?>
      · <?= __('history') ?>: <?= $s['backfill_done'] ? __('complete') : __('page {p}', ['p' => (int) $s['backfill_page']]) ?></p>
    <?php if ($s['last_error']): ?><p class="a-flash a-flash-error small"><?= e($s['last_error']) ?></p><?php endif; ?>
    <div class="btn-row">
      <button type="button" class="a-btn a-btn-primary js-import" data-mode="latest"><?= __('Get latest stories') ?></button>
      <?php if (strpos($s['url'], '{page}') !== false): ?><button type="button" class="a-btn js-import" data-mode="backfill"><?= __('Import history back to {d}', ['d' => e($s['since'])]) ?></button><?php endif; ?>
      <button type="button" class="a-btn js-import-stop" hidden><?= __('Stop') ?></button>
      <form method="post" class="inline"><?= csrf_field() ?><input type="hidden" name="id" value="<?= (int) $s['id'] ?>"><button class="a-btn a-btn-sm" name="do" value="reset"><?= __('Restart history') ?></button></form>
    </div>
    <pre class="import-log" hidden></pre>
    <?php if ($s['type'] === 'doj' && $byCat): ?>
      <p class="small muted"><?php foreach ($byCat as $cid => $n): ?><?= e(category($cid)['name'] ?? '—') ?>: <?= fmt_num($n) ?> &nbsp; <?php endforeach; ?></p>
    <?php endif; ?>
  </section>
<?php endforeach; ?>

<?php if ($edit !== null): ?>
<form method="post" class="card a-form">
  <?= csrf_field() ?><input type="hidden" name="id" value="<?= (int) ($edit['id'] ?? 0) ?>">
  <h2><?= $edit ? __('Edit source') : __('Add a source') ?></h2>
  <?= select_field('type', __('Type'), ['rss' => 'RSS / Atom feed', 'doj' => 'U.S. Department of Justice API'], $edit['type'] ?? 'rss') ?>
  <?= field('name', __('Name'), $edit['name'] ?? '') ?>
  <?= field('url', __('Feed address'), $edit['url'] ?? '', 'text', ['required' => true, 'data-hint' => __('Use {page} where the page number goes to allow importing history, e.g. https://example.org/feed/?paged={page}')]) ?>
  <?= field('licence', __('Licence that allows republishing'), $edit['licence'] ?? '', 'text', ['required' => true, 'placeholder' => 'CC BY 4.0']) ?>
  <label class="f"><span><?= __('Section') ?></span><select name="category_id"><?= category_options(isset($edit['category_id']) ? (int) $edit['category_id'] : null) ?></select></label>
  <?= checkbox('auto_classify', __('Sort court stories automatically (sex offences, fraud, drugs, crime, national security)'), (bool) ($edit['auto_classify'] ?? 0)) ?>
  <?= field('keywords', __('Only import stories containing one of these words (one per line, optional)'), $edit['keywords'] ?? '', 'textarea', ['rows' => 3, 'placeholder' => "sentenced\nconvicted"]) ?>
  <?= field('since', __('Import history back to'), $edit['since'] ?? '2015-01-01', 'date') ?>
  <?= select_field('canonical', __('Canonical link'), ['source' => __('Original source (recommended — avoids duplicate content)'), 'self' => __('This site (only if the licence allows and you add your own value)')], $edit['canonical'] ?? 'source') ?>
  <?= checkbox('enabled', __('Import new stories automatically (cron)'), (bool) ($edit['enabled'] ?? 1)) ?>
  <button class="a-btn a-btn-primary"><?= __('Save') ?></button> <a class="a-btn" href="?"><?= __('Cancel') ?></a>
  <?php if ($edit && can('admin')): ?><button class="a-btn a-btn-danger js-confirm" name="do" value="delete" data-confirm="<?= e(__('Remove this source?')) ?>"><?= __('Remove source') ?></button><?php endif; ?>
</form>
<?php endif; ?>
<?php admin_footer(); ?>
