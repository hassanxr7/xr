<?php
require __DIR__ . '/app/bootstrap.php';

$me = require_user();
expire_orders();

$status = qs('status');
$where = 'o.user_id = ?';
$params = [$me['id']];
if ($status !== '' && array_key_exists($status, statuses())) {
    $where .= ' AND o.status = ?';
    $params[] = $status;
}

$stats = row(
    "SELECT COUNT(*) AS total,
            SUM(status = 'completed') AS completed,
            SUM(status IN ('awaiting_payment','pending','processing')) AS open_orders,
            COALESCE(SUM(CASE WHEN status = 'completed' THEN send_amount END), 0) AS volume
     FROM orders WHERE user_id = ?",
    [$me['id']]
);

$p = paginate((int) val("SELECT COUNT(*) FROM orders o WHERE $where", $params), 15);
$orders = rows(
    "SELECT o.*, f.color AS from_color, f.logo AS from_logo, t.color AS to_color, t.logo AS to_logo
     FROM orders o
     LEFT JOIN gateways f ON f.id = o.from_gateway_id
     LEFT JOIN gateways t ON t.id = o.to_gateway_id
     WHERE $where ORDER BY o.id DESC LIMIT {$p['per']} OFFSET {$p['offset']}",
    $params
);

$pageTitle = t('my_account');
$robotsMeta = 'noindex, follow';
require APP_PATH . '/views/header.php';
?>
<div class="page">
  <div class="container">
    <div class="page-head">
      <div>
        <h1><?= e(t('hello', ['name' => $me['name']])) ?></h1>
        <p><?= e(t('account_sub')) ?></p>
      </div>
      <div class="btn-group">
        <a class="btn btn-outline btn-sm" href="<?= e(url('profile.php')) ?>"><?= icon('user', 16) ?> <?= e(t('profile')) ?></a>
        <a class="btn btn-outline btn-sm" href="<?= e(url('statement.php')) ?>"><?= icon('print', 16) ?> <?= e(t('nav_statement')) ?></a>
        <a class="btn btn-primary btn-sm" href="<?= e(url('')) ?>#exchange"><?= icon('plus', 16) ?> <?= e(t('new_exchange')) ?></a>
      </div>
    </div>

    <div class="grid grid-4">
      <div class="card stat"><span class="stat-ic"><?= icon('list', 20) ?></span><div><span class="stat-label"><?= e(t('total_orders')) ?></span><span class="stat-value"><?= (int) $stats['total'] ?></span></div></div>
      <div class="card stat"><span class="stat-ic blue"><?= icon('check-circle', 20) ?></span><div><span class="stat-label"><?= e(t('st_completed')) ?></span><span class="stat-value"><?= (int) $stats['completed'] ?></span></div></div>
      <div class="card stat"><span class="stat-ic orange"><?= icon('clock', 20) ?></span><div><span class="stat-label"><?= e(t('open_orders')) ?></span><span class="stat-value"><?= (int) $stats['open_orders'] ?></span></div></div>
      <div class="card stat"><span class="stat-ic violet"><?= icon('wallet', 20) ?></span><div><span class="stat-label"><?= e(t('total_exchanged')) ?></span><span class="stat-value">$<?= e(fmt_amount($stats['volume'])) ?></span></div></div>
    </div>

    <div class="card mt-3">
      <div class="card-head">
        <h2><?= icon('list', 18) ?> <?= e(t('my_orders')) ?></h2>
        <form method="get" class="btn-group">
          <select class="input" name="status" data-autosubmit style="width:auto;padding:8px 12px">
            <option value=""><?= e(t('all_statuses')) ?></option>
            <?php foreach (statuses() as $k => $label): ?>
              <option value="<?= e($k) ?>" <?= $status === $k ? 'selected' : '' ?>><?= e($label) ?></option>
            <?php endforeach; ?>
          </select>
        </form>
      </div>
      <?php if (!$orders): ?>
        <div class="empty"><?= icon('list', 36) ?><p><?= e(t('no_orders')) ?></p><a class="btn btn-primary btn-sm" href="<?= e(url('')) ?>#exchange"><?= e(t('exchange_now')) ?></a></div>
      <?php else: ?>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th><?= e(t('order_no')) ?></th><th><?= e(t('date')) ?></th><th><?= e(t('exchange')) ?></th><th class="num"><?= e(t('sent')) ?></th><th class="num"><?= e(t('received')) ?></th><th><?= e(t('status')) ?></th><th></th></tr></thead>
          <tbody>
          <?php foreach ($orders as $o): ?>
            <tr>
              <td><a class="mono" href="<?= e(url('order.php?no=' . urlencode($o['order_no']))) ?>"><strong><?= e($o['order_no']) ?></strong></a></td>
              <td class="nowrap"><?= e(fmt_date($o['created_at'])) ?></td>
              <td><span class="pair-cell"><?= gw_badge($o['from_name'], $o['from_color'], $o['from_logo']) ?><?= icon('arrow-right', 14) ?><?= gw_badge($o['to_name'], $o['to_color'], $o['to_logo']) ?> <span class="small"><?= e($o['to_name']) ?></span></span></td>
              <td class="num"><?= e(money($o['send_amount'], $o['from_currency'], (int) $o['from_decimals'])) ?></td>
              <td class="num"><strong><?= e(money($o['receive_amount'], $o['to_currency'], (int) $o['to_decimals'])) ?></strong></td>
              <td><?= status_badge($o['status']) ?></td>
              <td class="text-right"><a class="btn btn-outline btn-sm" href="<?= e(url('order.php?no=' . urlencode($o['order_no']))) ?>"><?= icon('eye', 15) ?></a></td>
            </tr>
          <?php endforeach; ?>
          </tbody>
        </table>
      </div>
      <?= pagination_links($p) ?>
      <?php endif; ?>
    </div>
  </div>
</div>
<?php require APP_PATH . '/views/footer.php'; ?>
