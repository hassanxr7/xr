<?php
require __DIR__ . '/_init.php';

require_role('writer');

if (is_post()) {
    csrf_check();
    $id = (int) input('id');
    if (input('do') === 'delete' && can('editor')) {
        media_delete($id);
        content_changed();
        flash('success', __('Image deleted.'));
    } elseif (input('do') === 'save' && $id) {
        update('media', ['alt' => mb_substr((string) input('alt'), 0, 250), 'caption' => mb_substr((string) input('caption'), 0, 500), 'credit' => mb_substr((string) input('credit'), 0, 120)], 'id = ?', [$id]);
        content_changed();
        flash('success', __('Image details saved.'));
    } else {
        $n = 0;
        $files = $_FILES['files'] ?? null;
        if ($files && is_array($files['name'])) {
            foreach (array_keys($files['name']) as $i) {
                try {
                    media_save_upload(['name' => $files['name'][$i], 'tmp_name' => $files['tmp_name'][$i], 'error' => $files['error'][$i], 'size' => $files['size'][$i]], ['credit' => input('credit')]);
                    $n++;
                } catch (Throwable $e) {
                    flash('error', $files['name'][$i] . ': ' . $e->getMessage());
                }
            }
        }
        if ($n) {
            flash('success', __('{n} images uploaded.', ['n' => $n]));
        }
    }
    redirect('admin/media.php');
}

$page = max(1, (int) input('page', 1));
$total = (int) val('SELECT COUNT(*) FROM media');
$list = rows('SELECT * FROM media ORDER BY id DESC LIMIT 48 OFFSET ?', [($page - 1) * 48]);
$edit = (int) input('edit') ? media((int) input('edit')) : null;
admin_header(__('Images'));
?>
<div class="page-head"><h1><?= __('Images') ?> <small><?= fmt_num($total) ?></small></h1></div>
<form method="post" enctype="multipart/form-data" class="card upload-box">
  <?= csrf_field() ?>
  <label class="f"><span><?= __('Upload images (JPG, PNG, WebP, GIF — up to 15 MB each). They are resized and converted to fast WebP automatically.') ?></span>
    <input type="file" name="files[]" multiple accept="image/jpeg,image/png,image/webp,image/gif" required></label>
  <?= field('credit', __('Photo credit for these images'), '') ?>
  <button class="a-btn a-btn-primary"><?= __('Upload') ?></button>
  <p class="hint"><?= __('Only upload photos you took yourself, or that you have permission or a licence to use.') ?></p>
</form>
<?php if ($edit): ?>
<form method="post" class="card a-form media-edit">
  <?= csrf_field() ?><input type="hidden" name="id" value="<?= (int) $edit['id'] ?>"><input type="hidden" name="do" value="save">
  <img src="<?= e(media_url($edit, 800)) ?>" alt="">
  <div>
    <p class="muted small"><?= (int) $edit['width'] ?> × <?= (int) $edit['height'] ?> · <?= fmt_num(round($edit['bytes'] / 1024)) ?> KB · <a href="<?= e(media_url($edit)) ?>" target="_blank" rel="noopener"><?= __('Original') ?></a></p>
    <?= field('alt', __('Alt text'), $edit['alt']) ?>
    <?= field('caption', __('Caption'), $edit['caption']) ?>
    <?= field('credit', __('Credit'), $edit['credit']) ?>
    <button class="a-btn a-btn-primary"><?= __('Save') ?></button>
    <?php if (can('editor')): ?><button class="a-btn a-btn-danger js-confirm" name="do" value="delete" data-confirm="<?= e(__('Delete this image? Stories using it will show the section image.')) ?>"><?= __('Delete') ?></button><?php endif; ?>
  </div>
</form>
<?php endif; ?>
<div class="media-grid">
  <?php foreach ($list as $m): ?>
    <a class="media-item" href="?edit=<?= (int) $m['id'] ?>&page=<?= $page ?>"><img src="<?= e(media_url($m, 400)) ?>" alt="" loading="lazy"><span><?= e($m['alt'] ?: basename($m['file'])) ?></span></a>
  <?php endforeach; ?>
</div>
<?= admin_pager($page, (int) ceil($total / 48), []) ?>
<?php admin_footer(); ?>
