<?php
require __DIR__ . '/_init.php';

require_role('editor');
$cents = fn ($v) => (int) round((float) str_replace(',', '.', (string) $v) * 100);

if (is_post()) {
    csrf_check();
    $id = (int) input('id');
    $data = [
        'title' => mb_substr(trim((string) input('title')), 0, 200), 'description' => mb_substr(trim((string) input('description')), 0, 2000),
        'location' => mb_substr(trim((string) input('location')), 0, 120), 'taken_at' => input('taken_at') ?: null,
        'photographer' => mb_substr(trim((string) input('photographer')), 0, 120), 'keywords' => mb_substr(trim((string) input('keywords')), 0, 500),
        'price_editorial' => $cents(input('price_editorial')), 'price_commercial' => $cents(input('price_commercial')), 'price_exclusive' => $cents(input('price_exclusive')),
        'status' => in_array(input('status'), ['active', 'hidden', 'sold'], true) ? (string) input('status') : 'active',
    ];
    try {
        if (input('do') === 'delete' && $id) {
            photo_delete($id);
            flash('success', __('Photo deleted.'));
        } elseif ($id) {
            update('photos', $data, 'id = ?', [$id]);
            content_changed();
            flash('success', __('Photo saved.'));
        } else {
            if ($data['title'] === '') {
                throw new RuntimeException(__('Enter a title.'));
            }
            $id = photo_save_upload($_FILES['photo'] ?? [], $data);
            flash('success', __('Photo added to the store.'));
        }
    } catch (Throwable $e) {
        flash('error', $e->getMessage());
    }
    redirect('admin/photos.php');
}

$list = rows('SELECT p.*, (SELECT COALESCE(SUM(amount), 0) FROM photo_orders o WHERE o.photo_id = p.id AND o.status = \'paid\') revenue FROM photos p ORDER BY p.id DESC LIMIT 200');
$edit = (int) input('edit') ? row('SELECT * FROM photos WHERE id = ?', [(int) input('edit')]) : null;
$cur = setting('store_currency', 'CAD');
$price = fn ($c) => $c ? number_format($c / 100, 2, '.', '') : '';
admin_header(__('Photo store'));
?>
<div class="page-head"><h1><?= __('Photo store') ?></h1><a class="a-btn" href="<?= e(url('photos')) ?>" target="_blank" rel="noopener"><?= __('View store') ?> ↗</a></div>
<?php if (!stripe_enabled()): ?><div class="a-flash a-flash-info"><?= __('Stripe is not connected: buyers send a licence request and you mark the order paid. Connect Stripe in Settings → Photo store for instant online payment.') ?></div><?php endif; ?>
<div class="grid-2">
  <form method="post" enctype="multipart/form-data" class="card a-form">
    <?= csrf_field() ?><input type="hidden" name="id" value="<?= (int) ($edit['id'] ?? 0) ?>">
    <h2><?= $edit ? __('Edit photo') : __('Add a photo for sale') ?></h2>
    <?php if ($edit): ?><img src="<?= e(url($edit['thumb'])) ?>" alt="" class="thumb-md"><?php else: ?>
      <label class="f"><span><?= __('Photo file (full resolution, JPG/PNG/WebP, up to 40 MB). The original stays private; visitors only see a watermarked preview.') ?></span><input type="file" name="photo" accept="image/jpeg,image/png,image/webp" required></label>
    <?php endif; ?>
    <?= field('title', __('Title'), $edit['title'] ?? '', 'text', ['required' => true]) ?>
    <?= field('description', __('Description'), $edit['description'] ?? '', 'textarea', ['rows' => 3]) ?>
    <div class="row-3">
      <?= field('location', __('Location'), $edit['location'] ?? '') ?>
      <?= field('taken_at', __('Date taken'), $edit['taken_at'] ?? '', 'date') ?>
      <?= field('photographer', __('Photographer'), $edit['photographer'] ?? '') ?>
    </div>
    <?= field('keywords', __('Keywords (for search)'), $edit['keywords'] ?? '') ?>
    <div class="row-3">
      <?= field('price_editorial', __('Editorial price') . " ($cur)", $price($edit['price_editorial'] ?? 4900), 'number', ['step' => '0.01', 'min' => '0']) ?>
      <?= field('price_commercial', __('Commercial price') . " ($cur)", $price($edit['price_commercial'] ?? 14900), 'number', ['step' => '0.01', 'min' => '0']) ?>
      <?= field('price_exclusive', __('Exclusive price') . " ($cur)", $price($edit['price_exclusive'] ?? 0), 'number', ['step' => '0.01', 'min' => '0', 'data-hint' => __('Empty or 0 = not offered')]) ?>
    </div>
    <?= select_field('status', __('Status'), ['active' => __('For sale'), 'hidden' => __('Hidden'), 'sold' => __('Sold (exclusive)')], $edit['status'] ?? 'active') ?>
    <button class="a-btn a-btn-primary"><?= __('Save') ?></button>
    <?php if ($edit): ?><a class="a-btn" href="?"><?= __('Cancel') ?></a> <button class="a-btn a-btn-danger js-confirm" name="do" value="delete" data-confirm="<?= e(__('Delete this photo and its original file?')) ?>"><?= __('Delete') ?></button><?php endif; ?>
  </form>
  <section class="card"><h2><?= __('Photos') ?> <small><?= count($list) ?></small></h2>
    <div class="table-wrap"><table class="list"><thead><tr><th></th><th><?= __('Title') ?></th><th class="num"><?= __('Sales') ?></th><th class="num"><?= __('Revenue') ?></th></tr></thead><tbody>
    <?php foreach ($list as $p): ?>
      <tr><td><img src="<?= e(url($p['thumb'])) ?>" alt="" class="thumb-xs"></td><td><a class="strong" href="?edit=<?= (int) $p['id'] ?>"><?= e($p['title']) ?></a><div class="muted small"><?= e($p['status']) ?></div></td>
        <td class="num"><?= fmt_num($p['sales']) ?></td><td class="num"><?= e(money((int) $p['revenue'], $p['currency'])) ?></td></tr>
    <?php endforeach; ?>
    </tbody></table></div></section>
</div>
<?php admin_footer(); ?>
