<?php
require __DIR__ . '/_init.php';

require_role('editor');

if (is_post()) {
    csrf_check();
    $id = (int) input('id');
    if (input('do') === 'delete') {
        q('DELETE FROM pages WHERE id = ?', [$id]);
        flash('success', __('Page deleted.'));
    } else {
        $title = trim((string) input('title'));
        $slug = slugify((string) input('slug')) ?: slugify($title);
        if (category_by_slug($slug) || in_array($slug, RESERVED_SLUGS, true)) {
            $slug .= '-page';
        }
        $data = ['title' => mb_substr($title, 0, 150), 'slug' => unique_slug('pages', $slug, $id), 'body' => sanitize_html((string) ($_POST['body'] ?? '')),
            'in_footer' => (int) (input('in_footer') === '1'), 'updated_at' => now()];
        $id ? update('pages', $data, 'id = ?', [$id]) : insert('pages', $data);
        flash('success', __('Page saved.'));
    }
    content_changed();
    redirect('admin/pages.php');
}
$edit = (int) input('edit') ? row('SELECT * FROM pages WHERE id = ?', [(int) input('edit')]) : null;
$new = isset($_GET['new']);
admin_header(__('Pages'));
?>
<div class="page-head"><h1><?= __('Pages') ?></h1><a class="a-btn a-btn-primary" href="?new=1">＋ <?= __('New page') ?></a></div>
<?php if ($edit || $new): ?>
<form method="post" class="card a-form" id="page-form">
  <?= csrf_field() ?><input type="hidden" name="id" value="<?= (int) ($edit['id'] ?? 0) ?>">
  <?= field('title', __('Title'), $edit['title'] ?? '', 'text', ['required' => true]) ?>
  <?= field('slug', __('URL'), $edit['slug'] ?? '') ?>
  <?= field('body', __('Content (HTML allowed: p, h2, h3, ul, li, a, strong, em)'), $edit['body'] ?? '', 'textarea', ['rows' => 16]) ?>
  <?= checkbox('in_footer', __('Link in the footer'), (bool) ($edit['in_footer'] ?? 1)) ?>
  <button class="a-btn a-btn-primary"><?= __('Save') ?></button> <a class="a-btn" href="?"><?= __('Cancel') ?></a>
  <?php if ($edit): ?><button class="a-btn a-btn-danger js-confirm" name="do" value="delete" data-confirm="<?= e(__('Delete this page?')) ?>"><?= __('Delete') ?></button><?php endif; ?>
</form>
<?php endif; ?>
<section class="card"><table class="list"><thead><tr><th><?= __('Title') ?></th><th><?= __('URL') ?></th><th><?= __('Updated') ?></th></tr></thead><tbody>
<?php foreach (rows('SELECT * FROM pages ORDER BY title') as $p): ?>
  <tr><td><a class="strong" href="?edit=<?= (int) $p['id'] ?>"><?= e($p['title']) ?></a></td><td><a href="<?= e(url($p['slug'])) ?>" target="_blank" rel="noopener">/<?= e($p['slug']) ?></a></td><td class="muted"><?= e(fmt_date($p['updated_at'])) ?></td></tr>
<?php endforeach; ?>
</tbody></table></section>
<?php admin_footer(); ?>
