<?php
require dirname(__DIR__) . '/app/bootstrap.php';

require_admin();

if (is_post()) {
    csrf_check();
    $id = (int) input('id');
    if (input('action') === 'toggle' && $id) {
        q('UPDATE gateways SET is_active = 1 - is_active WHERE id = ?', [$id]);
        flash('success', t('saved'));
    } elseif (input('action') === 'reserve' && $id && is_numeric(input('reserve'))) {
        update('gateways', ['reserve' => max(0, (float) input('reserve'))], 'id = ?', [$id]);
        flash('success', t('saved'));
    }
    redirect('admin/gateways.php');
}

$gateways = rows('SELECT g.*, (SELECT COUNT(*) FROM pairs p WHERE p.from_gateway_id = g.id OR p.to_gateway_id = g.id) AS pair_count FROM gateways g ORDER BY sort_order, id');
$pageTitle = t('a_gateways');
require APP_PATH . '/views/admin_header.php';
?>
<div class="toolbar-row">
  <p class="muted mb-0"><?= e(t('a_gateways_help')) ?></p>
  <a class="btn btn-primary btn-sm" href="<?= e(url('admin/gateway_edit.php')) ?>"><?= icon('plus', 16) ?> <?= e(t('a_add_gateway')) ?></a>
</div>
<div class="card">
  <div class="table-wrap">
    <table class="table">
      <thead><tr><th><?= e(t('a_gateway')) ?></th><th><?= e(t('a_currency')) ?></th><th><?= e(t('a_pay_to')) ?></th><th><?= e(t('reserve')) ?></th><th><?= e(t('a_pairs')) ?></th><th><?= e(t('status')) ?></th><th></th></tr></thead>
      <tbody>
      <?php foreach ($gateways as $g): ?>
        <tr>
          <td><span class="pair-cell"><?= gw_badge($g['name'], $g['color'], $g['logo']) ?> <strong><?= e($g['name']) ?></strong> <span class="small muted mono"><?= e($g['code']) ?></span></span></td>
          <td><?= e($g['currency']) ?></td>
          <td class="mono small"><?= e($g['pay_to'] ?: '—') ?></td>
          <td>
            <form method="post" class="inline-form">
              <?= csrf_field() ?><input type="hidden" name="action" value="reserve"><input type="hidden" name="id" value="<?= (int) $g['id'] ?>">
              <input class="input" style="width:130px;padding:7px 9px" name="reserve" value="<?= e(number_format((float) $g['reserve'], (int) $g['decimals'], '.', '')) ?>" inputmode="decimal">
              <button class="btn btn-outline btn-sm" type="submit" title="<?= e(t('save')) ?>"><?= icon('check', 14) ?></button>
            </form>
          </td>
          <td><?= (int) $g['pair_count'] ?></td>
          <td>
            <form method="post" class="inline"><?= csrf_field() ?><input type="hidden" name="action" value="toggle"><input type="hidden" name="id" value="<?= (int) $g['id'] ?>">
              <button class="btn btn-sm <?= $g['is_active'] ? 'btn-outline' : 'btn-danger' ?>" type="submit"><?= $g['is_active'] ? icon('check', 14) . ' ' . e(t('active')) : icon('x', 14) . ' ' . e(t('inactive')) ?></button>
            </form>
          </td>
          <td class="actions"><a class="btn btn-outline btn-sm" href="<?= e(url('admin/gateway_edit.php?id=' . $g['id'])) ?>"><?= icon('edit', 15) ?></a></td>
        </tr>
      <?php endforeach; ?>
      </tbody>
    </table>
  </div>
</div>
<?php require APP_PATH . '/views/admin_footer.php'; ?>
