<?php
require dirname(__DIR__) . '/app/bootstrap.php';

require_admin();
expire_orders();

$today = date('Y-m-d');
$stats = row(
    "SELECT
        SUM(created_at >= ?) AS today_orders,
        SUM(status IN ('pending','processing')) AS to_review,
        SUM(status = 'awaiting_payment') AS awaiting,
        COALESCE(SUM(CASE WHEN status = 'completed' AND completed_at >= ? THEN send_amount END), 0) AS today_volume,
        COALESCE(SUM(CASE WHEN status = 'completed' AND completed_at >= ? THEN fee_amount END), 0) AS today_fees,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN send_amount END), 0) AS total_volume,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN fee_amount END), 0) AS total_fees,
        SUM(status = 'completed') AS completed
     FROM orders",
    [$today . ' 00:00:00', $today . ' 00:00:00', $today . ' 00:00:00']
);
$customers = (int) val('SELECT COUNT(*) FROM users');

// Last 7 days completed volume
$days = [];
for ($i = 6; $i >= 0; $i--) {
    $days[date('Y-m-d', strtotime("-$i days"))] = 0.0;
}
foreach (rows(
    "SELECT DATE(completed_at) AS d, SUM(send_amount) AS v FROM orders WHERE status = 'completed' AND completed_at >= ? GROUP BY DATE(completed_at)",
    [array_key_first($days) . ' 00:00:00']
) as $r) {
    if (isset($days[$r['d']])) {
        $days[$r['d']] = (float) $r['v'];
    }
}
$maxDay = max($days) ?: 1;

$review = rows("SELECT o.*, u.name AS customer FROM orders o JOIN users u ON u.id = o.user_id WHERE o.status IN ('pending','processing') ORDER BY o.paid_at ASC, o.id ASC LIMIT 8");
$recent = rows('SELECT o.*, u.name AS customer FROM orders o JOIN users u ON u.id = o.user_id ORDER BY o.id DESC LIMIT 8');
$gateways = rows('SELECT * FROM gateways WHERE is_active = 1 ORDER BY sort_order, id');

$pageTitle = t('a_dashboard');
require APP_PATH . '/views/admin_header.php';
?>
<div class="grid grid-4">
  <a class="card stat" href="<?= e(url('admin/orders.php?status=pending')) ?>"><span class="stat-ic orange"><?= icon('clock', 20) ?></span><div><span class="stat-label"><?= e(t('a_to_review')) ?></span><span class="stat-value"><?= (int) $stats['to_review'] ?></span></div></a>
  <div class="card stat"><span class="stat-ic blue"><?= icon('list', 20) ?></span><div><span class="stat-label"><?= e(t('a_today_orders')) ?></span><span class="stat-value"><?= (int) $stats['today_orders'] ?></span></div></div>
  <div class="card stat"><span class="stat-ic"><?= icon('wallet', 20) ?></span><div><span class="stat-label"><?= e(t('a_today_volume')) ?></span><span class="stat-value">$<?= e(fmt_amount($stats['today_volume'])) ?></span></div></div>
  <div class="card stat"><span class="stat-ic violet"><?= icon('chart', 20) ?></span><div><span class="stat-label"><?= e(t('a_today_fees')) ?></span><span class="stat-value">$<?= e(fmt_amount($stats['today_fees'])) ?></span></div></div>
</div>
<div class="grid grid-4 section-gap">
  <div class="card stat"><span class="stat-ic"><?= icon('check-circle', 20) ?></span><div><span class="stat-label"><?= e(t('st_completed')) ?></span><span class="stat-value"><?= (int) $stats['completed'] ?></span></div></div>
  <div class="card stat"><span class="stat-ic blue"><?= icon('swap', 20) ?></span><div><span class="stat-label"><?= e(t('a_total_volume')) ?></span><span class="stat-value">$<?= e(fmt_amount($stats['total_volume'])) ?></span></div></div>
  <div class="card stat"><span class="stat-ic violet"><?= icon('chart', 20) ?></span><div><span class="stat-label"><?= e(t('a_total_fees')) ?></span><span class="stat-value">$<?= e(fmt_amount($stats['total_fees'])) ?></span></div></div>
  <a class="card stat" href="<?= e(url('admin/customers.php')) ?>"><span class="stat-ic orange"><?= icon('users', 20) ?></span><div><span class="stat-label"><?= e(t('a_customers')) ?></span><span class="stat-value"><?= $customers ?></span></div></a>
</div>

<div class="grid grid-main section-gap">
  <div class="card">
    <div class="card-head"><h3><?= icon('chart', 18) ?> <?= e(t('a_volume_7d')) ?></h3></div>
    <div class="card-body">
      <div class="bars">
        <?php foreach ($days as $d => $v): ?>
          <div class="bar" title="<?= e(fmt_date($d, false)) ?>: $<?= e(fmt_amount($v)) ?>">
            <span class="bar-val"><?= $v > 0 ? '$' . e(number_format($v)) : '' ?></span>
            <span class="bar-fill" style="height:<?= max(2, round($v / $maxDay * 140)) ?>px"></span>
            <span class="bar-lbl"><?= e(date('d/m', strtotime($d))) ?></span>
          </div>
        <?php endforeach; ?>
      </div>
    </div>
  </div>
  <div class="card">
    <div class="card-head"><h3><?= icon('wallet', 18) ?> <?= e(t('reserves_title')) ?></h3><a class="btn btn-ghost btn-sm" href="<?= e(url('admin/gateways.php')) ?>"><?= icon('edit', 15) ?></a></div>
    <div class="card-body reserve-list">
      <?php foreach ($gateways as $g): ?>
        <div class="reserve-row"><?= gw_badge($g['name'], $g['color'], $g['logo'], 'sm') ?> <span><?= e($g['name']) ?></span><strong><?= e(money($g['reserve'], $g['currency'], (int) $g['decimals'])) ?></strong></div>
      <?php endforeach; ?>
    </div>
  </div>
</div>

<?php
$orderTable = function (array $list, string $empty) {
    if (!$list) {
        echo '<div class="empty">' . icon('check-circle', 30) . '<p>' . e($empty) . '</p></div>';
        return;
    }
    echo '<div class="table-wrap"><table class="table"><thead><tr><th>' . e(t('order_no')) . '</th><th>' . e(t('customer')) . '</th><th>' . e(t('exchange')) . '</th><th class="num">' . e(t('sent')) . '</th><th class="num">' . e(t('received')) . '</th><th>' . e(t('status')) . '</th><th>' . e(t('date')) . '</th></tr></thead><tbody>';
    foreach ($list as $o) {
        echo '<tr><td><a class="mono" href="' . e(url('admin/order.php?id=' . $o['id'])) . '"><strong>' . e($o['order_no']) . '</strong></a></td>'
            . '<td>' . e($o['customer']) . '</td>'
            . '<td class="nowrap">' . e($o['from_name']) . ' → ' . e($o['to_name']) . '</td>'
            . '<td class="num">' . e(money($o['send_amount'], $o['from_currency'], (int) $o['from_decimals'])) . '</td>'
            . '<td class="num"><strong>' . e(money($o['receive_amount'], $o['to_currency'], (int) $o['to_decimals'])) . '</strong></td>'
            . '<td>' . status_badge($o['status']) . '</td>'
            . '<td class="nowrap">' . e(fmt_date($o['created_at'])) . '</td></tr>';
    }
    echo '</tbody></table></div>';
};
?>
<div class="card section-gap">
  <div class="card-head"><h3><?= icon('clock', 18) ?> <?= e(t('a_needs_attention')) ?></h3><a class="btn btn-outline btn-sm" href="<?= e(url('admin/orders.php?status=pending')) ?>"><?= e(t('a_view_all')) ?></a></div>
  <?php $orderTable($review, t('a_nothing_to_review')); ?>
</div>
<div class="card section-gap">
  <div class="card-head"><h3><?= icon('list', 18) ?> <?= e(t('a_recent_orders')) ?></h3><a class="btn btn-outline btn-sm" href="<?= e(url('admin/orders.php')) ?>"><?= e(t('a_view_all')) ?></a></div>
  <?php $orderTable($recent, t('no_orders')); ?>
</div>
<?php require APP_PATH . '/views/admin_footer.php'; ?>
