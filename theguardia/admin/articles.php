<?php
require __DIR__ . '/_init.php';

$u = require_role('writer');
$isEditor = can('editor');

if (is_post()) {
    csrf_check();
    $ids = array_map('intval', (array) ($_POST['ids'] ?? []));
    $action = (string) input('action');
    if ($ids && $isEditor) {
        $in = placeholders($ids);
        switch ($action) {
            case 'publish':
                q("UPDATE articles SET status = 'published', published_at = COALESCE(published_at, ?), updated_at = ? WHERE id IN ($in)", array_merge([now(), now()], $ids));
                foreach ($ids as $id) {
                    after_publish($id);
                }
                break;
            case 'draft':
                q("UPDATE articles SET status = 'draft' WHERE id IN ($in)", $ids);
                break;
            case 'feature':
                q("UPDATE articles SET is_featured = 1 WHERE id IN ($in)", $ids);
                break;
            case 'unfeature':
                q("UPDATE articles SET is_featured = 0, is_breaking = 0 WHERE id IN ($in)", $ids);
                break;
            case 'delete':
                if (can('editor')) {
                    q("DELETE FROM articles WHERE id IN ($in)", $ids);
                }
                break;
        }
        content_changed();
        audit('bulk ' . $action, implode(',', $ids));
        flash('success', __('{n} stories updated.', ['n' => count($ids)]));
    }
    redirect('admin/articles.php?' . http_build_query(array_intersect_key($_GET, array_flip(['status', 'cat', 'q', 'src', 'page']))));
}

$status = (string) input('status');
$cat = (int) input('cat');
$search = trim((string) input('q'));
$src = (string) input('src');
$page = max(1, (int) input('page', 1));
$where = ['1'];
$params = [];
if (!$isEditor) {
    $where[] = 'a.author_id = ?';
    $params[] = $u['id'];
}
if ($status !== '') {
    $where[] = 'a.status = ?';
    $params[] = $status;
}
if ($cat) {
    $ids = category_tree_ids($cat);
    $where[] = 'a.category_id IN (' . placeholders($ids) . ')';
    $params = array_merge($params, $ids);
}
if ($src === 'own') {
    $where[] = 'a.external_id IS NULL';
} elseif ($src === 'imported') {
    $where[] = 'a.external_id IS NOT NULL';
}
if ($search !== '') {
    $where[] = "a.title LIKE ? ESCAPE '!'";
    $params[] = like_param($search);
}
$w = implode(' AND ', $where);
$total = (int) val("SELECT COUNT(*) FROM articles a WHERE $w", $params);
$per = 30;
$list = rows("SELECT a.id, a.title, a.slug, a.status, a.published_at, a.created_at, a.updated_at, a.category_id, a.author_id, a.byline, a.views, a.is_featured, a.is_breaking, a.external_id
    FROM articles a WHERE $w ORDER BY COALESCE(a.published_at, a.created_at) DESC LIMIT ? OFFSET ?", array_merge($params, [$per, ($page - 1) * $per]));
$counts = [];
foreach (rows('SELECT status, COUNT(*) n FROM articles' . ($isEditor ? '' : ' WHERE author_id = ' . (int) $u['id']) . ' GROUP BY status') as $r) {
    $counts[$r['status']] = (int) $r['n'];
}

admin_header(__('Stories'));
?>
<div class="page-head"><h1><?= __('Stories') ?> <small><?= fmt_num($total) ?></small></h1><a class="a-btn a-btn-primary" href="<?= e(url('admin/article.php')) ?>">＋ <?= __('Write a story') ?></a></div>

<nav class="tabs">
  <a href="?"<?= $status === '' ? ' class="on"' : '' ?>><?= __('All') ?> <small><?= fmt_num(array_sum($counts)) ?></small></a>
  <?php foreach (['published' => __('Published'), 'scheduled' => __('Scheduled'), 'pending' => __('Waiting for review'), 'draft' => __('Drafts')] as $k => $label): ?>
    <a href="?status=<?= $k ?>"<?= $status === $k ? ' class="on"' : '' ?>><?= e($label) ?> <small><?= fmt_num($counts[$k] ?? 0) ?></small></a>
  <?php endforeach; ?>
</nav>

<form class="filters" method="get">
  <input type="hidden" name="status" value="<?= e($status) ?>">
  <input type="search" name="q" value="<?= e($search) ?>" placeholder="<?= e(__('Search headlines')) ?>">
  <select name="cat"><option value=""><?= __('All sections') ?></option><?= str_replace('<option value="">' . e(__('— Choose a section —')) . '</option>', '', category_options($cat ?: null)) ?></select>
  <select name="src"><option value=""><?= __('All sources') ?></option><option value="own"<?= $src === 'own' ? ' selected' : '' ?>><?= __('Written by us') ?></option><option value="imported"<?= $src === 'imported' ? ' selected' : '' ?>><?= __('Imported') ?></option></select>
  <button class="a-btn"><?= __('Filter') ?></button>
</form>

<form method="post">
  <?= csrf_field() ?>
  <?php if ($isEditor): ?>
  <div class="bulk">
    <select name="action"><option value=""><?= __('Bulk action…') ?></option><option value="publish"><?= __('Publish') ?></option><option value="draft"><?= __('Move to drafts') ?></option>
      <option value="feature"><?= __('Feature on home page') ?></option><option value="unfeature"><?= __('Remove from featured') ?></option><option value="delete"><?= __('Delete') ?></option></select>
    <button class="a-btn js-confirm" data-confirm="<?= e(__('Apply to the selected stories?')) ?>"><?= __('Apply') ?></button>
  </div>
  <?php endif; ?>
  <div class="table-wrap">
  <table class="list">
    <thead><tr><?php if ($isEditor): ?><th><input type="checkbox" class="js-check-all"></th><?php endif; ?><th><?= __('Headline') ?></th><th><?= __('Section') ?></th><th><?= __('Status') ?></th><th><?= __('Date') ?></th><th class="num"><?= __('Views') ?></th></tr></thead>
    <tbody>
    <?php foreach ($list as $a): $c = category((int) $a['category_id']); ?>
      <tr>
        <?php if ($isEditor): ?><td><input type="checkbox" name="ids[]" value="<?= (int) $a['id'] ?>"></td><?php endif; ?>
        <td><a class="strong" href="<?= e(url('admin/article.php?id=' . $a['id'])) ?>"><?= e($a['title']) ?></a>
          <div class="muted small"><?= e(article_byline($a)) ?><?= $a['is_featured'] ? ' · ★ ' . __('Featured') : '' ?><?= $a['is_breaking'] ? ' · ' . __('Breaking') : '' ?><?= $a['external_id'] ? ' · ' . __('Imported') : '' ?>
          · <a href="<?= e(article_url($a)) ?><?= $a['status'] !== 'published' ? '?preview=1' : '' ?>" target="_blank" rel="noopener"><?= __('View') ?></a></div></td>
        <td><?= e($c['name'] ?? '—') ?></td>
        <td><?= status_badge($a['status']) ?></td>
        <td class="muted nowrap"><?= e(fmt_date($a['published_at'] ?: $a['created_at'], 'M j, Y H:i')) ?></td>
        <td class="num"><?= fmt_num($a['views']) ?></td>
      </tr>
    <?php endforeach; ?>
    <?php if (!$list): ?><tr><td colspan="6" class="muted"><?= __('No stories found.') ?></td></tr><?php endif; ?>
    </tbody>
  </table>
  </div>
</form>
<?= admin_pager($page, (int) ceil($total / $per), array_filter(['status' => $status, 'cat' => $cat ?: '', 'q' => $search, 'src' => $src])) ?>
<?php admin_footer(); ?>
