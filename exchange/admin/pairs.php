<?php
require dirname(__DIR__) . '/app/bootstrap.php';

require_admin();

if (is_post()) {
    csrf_check();
    $id = (int) input('id');
    if (input('action') === 'toggle' && $id) {
        q('UPDATE pairs SET is_active = 1 - is_active WHERE id = ?', [$id]);
        flash('success', t('saved'));
    } elseif (input('action') === 'rates') {
        // Quick update of all rates/fees from the table
        foreach ((array) ($_POST['rate'] ?? []) as $pid => $rate) {
            $fee = $_POST['fee'][$pid] ?? null;
            if (is_numeric($rate) && (float) $rate > 0 && is_numeric($fee) && (float) $fee >= 0 && (float) $fee < 100) {
                update('pairs', ['rate' => (float) $rate, 'fee_percent' => (float) $fee], 'id = ?', [(int) $pid]);
            }
        }
        flash('success', t('a_rates_updated'));
    }
    redirect('admin/pairs.php');
}

$pairs = rows(PAIR_SELECT . ' ORDER BY p.sort_order, p.id');
$pageTitle = t('a_pairs');
require APP_PATH . '/views/admin_header.php';
?>
<div class="toolbar-row">
  <p class="muted mb-0"><?= e(t('a_pairs_help')) ?></p>
  <a class="btn btn-primary btn-sm" href="<?= e(url('admin/pair_edit.php')) ?>"><?= icon('plus', 16) ?> <?= e(t('a_add_pair')) ?></a>
</div>
<form method="post" class="card">
  <?= csrf_field() ?>
  <input type="hidden" name="action" value="rates">
  <div class="table-wrap">
    <table class="table">
      <thead><tr><th><?= e(t('a_pair')) ?></th><th><?= e(t('rate')) ?></th><th><?= e(t('fee')) ?> %</th><th class="num"><?= e(t('a_fixed_fee')) ?></th><th class="num"><?= e(t('limits')) ?></th><th class="num"><?= e(t('reserve')) ?></th><th><?= e(t('status')) ?></th><th></th></tr></thead>
      <tbody>
      <?php foreach ($pairs as $p): ?>
        <tr>
          <td><span class="pair-cell"><?= gw_badge($p['from_name'], $p['from_color'], $p['from_logo']) ?><?= icon('arrow-right', 14) ?><?= gw_badge($p['to_name'], $p['to_color'], $p['to_logo']) ?> <strong><?= e($p['from_name']) ?> → <?= e($p['to_name']) ?></strong></span></td>
          <td><input class="input" style="width:110px;padding:7px 9px" name="rate[<?= (int) $p['id'] ?>]" value="<?= e(trim_num($p['rate'])) ?>" inputmode="decimal"></td>
          <td><input class="input" style="width:80px;padding:7px 9px" name="fee[<?= (int) $p['id'] ?>]" value="<?= e(trim_num($p['fee_percent'])) ?>" inputmode="decimal"></td>
          <td class="num"><?= e(money($p['fee_fixed'], $p['from_currency'], (int) $p['from_decimals'])) ?></td>
          <td class="num small"><?= e(fmt_amount($p['min_amount'], (int) $p['from_decimals'])) ?> – <?= e(fmt_amount($p['max_amount'], (int) $p['from_decimals'])) ?> <?= e($p['from_currency']) ?></td>
          <td class="num"><?= e(money($p['to_reserve'], $p['to_currency'], (int) $p['to_decimals'])) ?></td>
          <td class="switch-cell">
            <button class="btn btn-sm <?= $p['is_active'] ? 'btn-outline' : 'btn-danger' ?>" form="toggle-<?= (int) $p['id'] ?>" type="submit"><?= $p['is_active'] ? icon('check', 14) . ' ' . e(t('active')) : icon('x', 14) . ' ' . e(t('inactive')) ?></button>
          </td>
          <td class="actions"><a class="btn btn-outline btn-sm" href="<?= e(url('admin/pair_edit.php?id=' . $p['id'])) ?>"><?= icon('edit', 15) ?></a></td>
        </tr>
      <?php endforeach; ?>
      </tbody>
    </table>
  </div>
  <div class="card-body" style="border-top:1px solid var(--line)">
    <button class="btn btn-primary" type="submit"><?= icon('check', 16) ?> <?= e(t('a_save_rates')) ?></button>
  </div>
</form>
<?php foreach ($pairs as $p): ?>
<form method="post" id="toggle-<?= (int) $p['id'] ?>" class="hidden"><?= csrf_field() ?><input type="hidden" name="action" value="toggle"><input type="hidden" name="id" value="<?= (int) $p['id'] ?>"></form>
<?php endforeach; ?>
<?php require APP_PATH . '/views/admin_footer.php'; ?>
