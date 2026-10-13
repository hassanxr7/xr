<?php
require dirname(__DIR__) . '/app/bootstrap.php';

require_admin();

$id = (int) ($_GET['id'] ?? 0);
$pair = $id ? row('SELECT * FROM pairs WHERE id = ?', [$id]) : null;
if ($id && !$pair) {
    redirect('admin/pairs.php');
}
$gateways = rows('SELECT * FROM gateways ORDER BY sort_order, id');
$data = $pair ?: ['from_gateway_id' => '', 'to_gateway_id' => '', 'rate' => 1, 'fee_percent' => 0, 'fee_fixed' => 0, 'min_amount' => 1, 'max_amount' => 5000, 'is_active' => 1, 'sort_order' => 0];
$errors = [];

if (is_post()) {
    csrf_check();
    if (input('action') === 'delete' && $pair) {
        // Orders keep their own snapshot of names/amounts; the FK just clears their pair_id.
        q('DELETE FROM pairs WHERE id = ?', [$pair['id']]);
        flash('success', t('deleted'));
        redirect('admin/pairs.php');
    }
    $num = fn ($k) => is_numeric(input($k)) ? (float) input($k) : null;
    $data = [
        'from_gateway_id' => (int) input('from_gateway_id'),
        'to_gateway_id'   => (int) input('to_gateway_id'),
        'rate'            => $num('rate'),
        'fee_percent'     => $num('fee_percent') ?? 0,
        'fee_fixed'       => $num('fee_fixed') ?? 0,
        'min_amount'      => $num('min_amount'),
        'max_amount'      => $num('max_amount'),
        'is_active'       => empty($_POST['is_active']) ? 0 : 1,
        'sort_order'      => (int) input('sort_order'),
    ];
    if (!$data['from_gateway_id'] || !$data['to_gateway_id'] || $data['from_gateway_id'] === $data['to_gateway_id']) {
        $errors[] = t('a_err_pair_gateways');
    }
    if (!$data['rate'] || $data['rate'] <= 0) {
        $errors[] = t('a_err_rate');
    }
    if ($data['fee_percent'] < 0 || $data['fee_percent'] >= 100 || $data['fee_fixed'] < 0) {
        $errors[] = t('a_err_fee');
    }
    if ($data['min_amount'] === null || $data['max_amount'] === null || $data['min_amount'] <= 0 || $data['max_amount'] < $data['min_amount']) {
        $errors[] = t('a_err_limits');
    }
    $dupe = val('SELECT id FROM pairs WHERE from_gateway_id = ? AND to_gateway_id = ? AND id <> ?', [$data['from_gateway_id'], $data['to_gateway_id'], $id]);
    if ($dupe) {
        $errors[] = t('a_err_pair_exists');
    }
    if (!$errors) {
        if ($pair) {
            update('pairs', $data, 'id = ?', [$id]);
        } else {
            $id = insert('pairs', $data);
        }
        flash('success', t('saved'));
        redirect('admin/pairs.php');
    }
}

$pageTitle = $pair ? t('a_edit_pair') : t('a_add_pair');
require APP_PATH . '/views/admin_header.php';
?>
<div class="toolbar-row"><a class="btn btn-ghost btn-sm" href="<?= e(url('admin/pairs.php')) ?>"><?= icon('arrow-left', 16) ?> <?= e(t('a_pairs')) ?></a></div>
<?php foreach ($errors as $err): ?><div class="alert alert-error"><?= icon('alert') ?><span><?= e($err) ?></span></div><?php endforeach; ?>
<form method="post" class="card medium" style="margin:0">
  <?= csrf_field() ?>
  <div class="card-body">
    <div class="form-row">
      <div class="form-group"><label><?= e(t('a_from_gateway')) ?></label>
        <select class="input" name="from_gateway_id" required><option value=""></option>
          <?php foreach ($gateways as $g): ?><option value="<?= (int) $g['id'] ?>" <?= (int) $data['from_gateway_id'] === (int) $g['id'] ? 'selected' : '' ?>><?= e($g['name'] . ' (' . $g['currency'] . ')') ?></option><?php endforeach; ?>
        </select>
        <div class="help"><?= e(t('a_from_gateway_help')) ?></div>
      </div>
      <div class="form-group"><label><?= e(t('a_to_gateway')) ?></label>
        <select class="input" name="to_gateway_id" required><option value=""></option>
          <?php foreach ($gateways as $g): ?><option value="<?= (int) $g['id'] ?>" <?= (int) $data['to_gateway_id'] === (int) $g['id'] ? 'selected' : '' ?>><?= e($g['name'] . ' (' . $g['currency'] . ')') ?></option><?php endforeach; ?>
        </select>
        <div class="help"><?= e(t('a_to_gateway_help')) ?></div>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label><?= e(t('rate')) ?></label><input class="input" name="rate" value="<?= e((string) (float) $data['rate']) ?>" inputmode="decimal" required><div class="help"><?= e(t('a_rate_help')) ?></div></div>
      <div class="form-group"><label><?= e(t('a_sort')) ?></label><input class="input" name="sort_order" type="number" value="<?= (int) $data['sort_order'] ?>"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label><?= e(t('fee')) ?> (%)</label><input class="input" name="fee_percent" value="<?= e((string) (float) $data['fee_percent']) ?>" inputmode="decimal"></div>
      <div class="form-group"><label><?= e(t('a_fixed_fee')) ?></label><input class="input" name="fee_fixed" value="<?= e((string) (float) $data['fee_fixed']) ?>" inputmode="decimal"><div class="help"><?= e(t('a_fixed_fee_help')) ?></div></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label><?= e(t('min')) ?></label><input class="input" name="min_amount" value="<?= e((string) (float) $data['min_amount']) ?>" inputmode="decimal" required></div>
      <div class="form-group"><label><?= e(t('max')) ?></label><input class="input" name="max_amount" value="<?= e((string) (float) $data['max_amount']) ?>" inputmode="decimal" required></div>
    </div>
    <label class="check"><input type="checkbox" name="is_active" value="1" <?= $data['is_active'] ? 'checked' : '' ?>> <?= e(t('active')) ?></label>
    <div class="alert alert-info mt-2"><?= icon('info') ?><span><?= e(t('a_formula')) ?></span></div>
    <div class="btn-group mt-2">
      <button class="btn btn-primary" type="submit"><?= e(t('save')) ?></button>
    </div>
  </div>
</form>
<?php if ($pair): ?>
<form method="post" class="mt-2" data-confirm="<?= e(t('a_confirm_delete')) ?>">
  <?= csrf_field() ?><input type="hidden" name="action" value="delete">
  <button class="btn btn-danger btn-sm" type="submit"><?= icon('x', 15) ?> <?= e(t('delete')) ?></button>
</form>
<?php endif; ?>
<?php require APP_PATH . '/views/admin_footer.php'; ?>
