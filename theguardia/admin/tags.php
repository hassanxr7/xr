<?php
require __DIR__ . '/_init.php';

require_role('editor');

if (is_post()) {
    csrf_check();
    $id = (int) input('id');
    if (input('do') === 'delete') {
        q('DELETE FROM tags WHERE id = ?', [$id]);
        flash('success', __('Tag deleted.'));
    } elseif (input('do') === 'merge') {
        $into = (int) input('into');
        if ($into && $into !== $id) {
            q('INSERT OR IGNORE INTO article_tags (article_id, tag_id) SELECT article_id, ? FROM article_tags WHERE tag_id = ?', [$into, $id]);
            q('DELETE FROM tags WHERE id = ?', [$id]);
            flash('success', __('Tags merged.'));
        }
    } else {
        $name = trim((string) input('name'));
        update('tags', ['name' => mb_substr($name, 0, 60), 'slug' => unique_slug('tags', slugify($name, 60), $id), 'description' => mb_substr(trim((string) input('description')), 0, 500)], 'id = ?', [$id]);
        flash('success', __('Tag saved.'));
    }
    content_changed();
    redirect('admin/tags.php?' . http_build_query(['q' => input('q')]));
}

$search = trim((string) input('q'));
$page = max(1, (int) input('page', 1));
$where = $search !== '' ? "WHERE t.name LIKE ? ESCAPE '!'" : '';
$params = $search !== '' ? [like_param($search)] : [];
$total = (int) val("SELECT COUNT(*) FROM tags t $where", $params);
$list = rows("SELECT t.*, (SELECT COUNT(*) FROM article_tags x WHERE x.tag_id = t.id) n FROM tags t $where ORDER BY n DESC, t.name LIMIT 50 OFFSET ?", array_merge($params, [($page - 1) * 50]));
$edit = (int) input('edit') ? row('SELECT * FROM tags WHERE id = ?', [(int) input('edit')]) : null;

admin_header(__('Tags'));
?>
<div class="page-head"><h1><?= __('Tags') ?> <small><?= fmt_num($total) ?></small></h1></div>
<form class="filters" method="get"><input type="search" name="q" value="<?= e($search) ?>" placeholder="<?= e(__('Search tags')) ?>"><button class="a-btn"><?= __('Search') ?></button></form>
<div class="grid-2">
  <section class="card">
    <table class="list"><thead><tr><th><?= __('Tag') ?></th><th class="num"><?= __('Stories') ?></th><th></th></tr></thead><tbody>
    <?php foreach ($list as $t): ?>
      <tr><td><a class="strong" href="?edit=<?= (int) $t['id'] ?>&q=<?= e(rawurlencode($search)) ?>"><?= e($t['name']) ?></a></td><td class="num"><?= fmt_num($t['n']) ?></td><td><a href="<?= e(tag_url($t)) ?>" target="_blank" rel="noopener">↗</a></td></tr>
    <?php endforeach; ?>
    </tbody></table>
    <?= admin_pager($page, (int) ceil($total / 50), array_filter(['q' => $search])) ?>
  </section>
  <?php if ($edit): ?>
  <section class="card">
    <h2><?= __('Edit tag') ?></h2>
    <form method="post" class="a-form"><?= csrf_field() ?><input type="hidden" name="id" value="<?= (int) $edit['id'] ?>"><input type="hidden" name="q" value="<?= e($search) ?>">
      <?= field('name', __('Name'), $edit['name'], 'text', ['required' => true]) ?>
      <?= field('description', __('Description (shown on the tag page; helps SEO)'), $edit['description'] ?? '', 'textarea', ['rows' => 3]) ?>
      <button class="a-btn a-btn-primary"><?= __('Save') ?></button>
    </form>
    <form method="post" class="a-form"><?= csrf_field() ?><input type="hidden" name="id" value="<?= (int) $edit['id'] ?>"><input type="hidden" name="do" value="merge">
      <label class="f"><span><?= __('Merge into another tag (id)') ?></span><select name="into"><?php foreach (rows('SELECT id, name FROM tags WHERE id <> ? ORDER BY name LIMIT 500', [$edit['id']]) as $o): ?><option value="<?= (int) $o['id'] ?>"><?= e($o['name']) ?></option><?php endforeach; ?></select></label>
      <button class="a-btn"><?= __('Merge') ?></button>
    </form>
    <form method="post" class="a-form"><?= csrf_field() ?><input type="hidden" name="id" value="<?= (int) $edit['id'] ?>"><input type="hidden" name="do" value="delete">
      <button class="a-btn a-btn-danger js-confirm" data-confirm="<?= e(__('Delete this tag?')) ?>"><?= __('Delete tag') ?></button></form>
  </section>
  <?php endif; ?>
</div>
<?php admin_footer(); ?>
