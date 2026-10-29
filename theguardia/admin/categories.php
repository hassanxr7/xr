<?php
require __DIR__ . '/_init.php';

require_role('editor');

if (is_post()) {
    csrf_check();
    $id = (int) input('id');
    if (input('do') === 'delete' && $id) {
        $n = (int) val('SELECT COUNT(*) FROM articles WHERE category_id = ?', [$id]);
        $move = (int) input('move_to');
        if ($n && !$move) {
            flash('error', __('This section has {n} stories. Choose a section to move them to first.', ['n' => $n]));
        } else {
            q('UPDATE articles SET category_id = ? WHERE category_id = ?', [$move ?: null, $id]);
            q('UPDATE categories SET parent_id = NULL WHERE parent_id = ?', [$id]);
            q('DELETE FROM categories WHERE id = ?', [$id]);
            flash('success', __('Section deleted.'));
        }
    } else {
        $name = trim((string) input('name'));
        if ($name === '') {
            flash('error', __('Enter a name.'));
            redirect('admin/categories.php');
        }
        $parent = (int) input('parent_id') ?: null;
        if ($parent === $id) {
            $parent = null;
        }
        $data = [
            'name' => mb_substr($name, 0, 80),
            'slug' => unique_slug('categories', slugify((string) input('slug')) ?: slugify($name), $id),
            'description' => mb_substr(trim((string) input('description')), 0, 500),
            'seo_title' => mb_substr(trim((string) input('seo_title')), 0, 120) ?: null,
            'parent_id' => $parent,
            'position' => (int) input('position'),
            'in_menu' => (int) (input('in_menu') === '1'),
            'on_home' => (int) (input('on_home') === '1'),
        ];
        if (!empty($_FILES['image']['name'])) {
            try {
                $mid = media_save_upload($_FILES['image'], ['alt' => $name]);
                $data['image'] = media_url(media($mid), 1200) ? ltrim(substr(media_url(media($mid), 1200), strlen(base_url())), '/') : null;
            } catch (Throwable $e) {
                flash('error', $e->getMessage());
            }
        }
        if ($id) {
            update('categories', $data, 'id = ?', [$id]);
        } else {
            $data['created_at'] = now();
            insert('categories', $data);
        }
        flash('success', __('Section saved.'));
    }
    content_changed();
    redirect('admin/categories.php');
}

$edit = (int) input('edit') ? category((int) input('edit')) : null;
$counts = [];
foreach (rows('SELECT category_id, COUNT(*) n FROM articles GROUP BY category_id') as $r) {
    $counts[(int) $r['category_id']] = (int) $r['n'];
}
admin_header(__('Sections'));
?>
<div class="page-head"><h1><?= __('Sections') ?></h1></div>
<div class="grid-2">
  <section class="card">
    <table class="list">
      <thead><tr><th><?= __('Name') ?></th><th><?= __('In menu') ?></th><th class="num"><?= __('Stories') ?></th><th></th></tr></thead>
      <tbody>
      <?php foreach (categories() as $c): ?>
        <tr><td><?= $c['parent_id'] ? '— ' : '' ?><a class="strong" href="?edit=<?= (int) $c['id'] ?>"><?= e($c['name']) ?></a> <span class="muted small">/<?= e($c['slug']) ?></span></td>
          <td><?= $c['in_menu'] ? '✔' : '' ?></td><td class="num"><?= fmt_num($counts[(int) $c['id']] ?? 0) ?></td>
          <td><a href="<?= e(category_url($c)) ?>" target="_blank" rel="noopener">↗</a></td></tr>
      <?php endforeach; ?>
      </tbody>
    </table>
  </section>
  <section class="card">
    <h2><?= $edit ? __('Edit section') : __('New section') ?></h2>
    <form method="post" enctype="multipart/form-data" class="a-form">
      <?= csrf_field() ?><input type="hidden" name="id" value="<?= (int) ($edit['id'] ?? 0) ?>">
      <?= field('name', __('Name'), $edit['name'] ?? '', 'text', ['required' => true]) ?>
      <?= field('slug', __('URL'), $edit['slug'] ?? '', 'text', ['data-hint' => __('Leave empty to create it from the name.')]) ?>
      <label class="f"><span><?= __('Parent section') ?></span><select name="parent_id"><option value=""><?= __('— None (top level) —') ?></option><?= str_replace('<option value="">' . e(__('— Choose a section —')) . '</option>', '', category_options(isset($edit['parent_id']) ? (int) $edit['parent_id'] : null)) ?></select></label>
      <?= field('description', __('Description (shown on the section page and in Google)'), $edit['description'] ?? '', 'textarea', ['rows' => 3]) ?>
      <?= field('seo_title', __('SEO title (optional)'), $edit['seo_title'] ?? '') ?>
      <?= field('position', __('Order'), $edit['position'] ?? '0', 'number') ?>
      <?= checkbox('in_menu', __('Show in the main menu'), (bool) ($edit['in_menu'] ?? 1)) ?>
      <?= checkbox('on_home', __('Show a block on the home page'), (bool) ($edit['on_home'] ?? 1)) ?>
      <label class="f"><span><?= __('Default image for stories without a photo') ?></span><input type="file" name="image" accept="image/*"></label>
      <button class="a-btn a-btn-primary"><?= __('Save') ?></button>
      <?php if ($edit): ?><a class="a-btn" href="?"><?= __('Cancel') ?></a><?php endif; ?>
    </form>
    <?php if ($edit): ?>
      <form method="post" class="a-form danger-zone">
        <?= csrf_field() ?><input type="hidden" name="id" value="<?= (int) $edit['id'] ?>"><input type="hidden" name="do" value="delete">
        <label class="f"><span><?= __('Delete this section and move its stories to') ?></span><select name="move_to"><option value=""><?= __('— nowhere —') ?></option><?= str_replace('<option value="">' . e(__('— Choose a section —')) . '</option>', '', category_options(null)) ?></select></label>
        <button class="a-btn a-btn-danger js-confirm" data-confirm="<?= e(__('Delete this section?')) ?>"><?= __('Delete section') ?></button>
      </form>
    <?php endif; ?>
  </section>
</div>
<?php admin_footer(); ?>
