<?php
require dirname(__DIR__) . '/app/bootstrap.php';

require_admin();
expire_orders();

$status = qs('status');
$pairId = (int) qs('pair');
$search = qs('q');
$from = valid_date(qs('from')) ? qs('from') : '';
$to = valid_date(qs('to')) ? qs('to') : '';

$where = ['1=1'];
$params = [];
if ($status === 'pending') {
    // "To review" groups everything waiting on us
    $where[] = "o.status IN ('pending','processing')";
} elseif ($status !== '' && array_key_exists($status, statuses())) {
    $where[] = 'o.status = ?';
    $params[] = $status;
}
if ($pairId) {
    $where[] = 'o.pair_id = ?';
    $params[] = $pairId;
}
if ($search !== '') {
    $where[] = '(o.order_no LIKE ? OR u.name LIKE ? OR u.phone LIKE ? OR o.sender_account LIKE ? OR o.receiver_account LIKE ? OR o.payment_ref LIKE ? OR o.payout_ref LIKE ?)';
    $like = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\%', '\_'], $search) . '%';
    array_push($params, $like, $like, $like, $like, $like, $like, $like);
}
if ($from !== '') {
    $where[] = 'o.created_at >= ?';
    $params[] = $from . ' 00:00:00';
}
if ($to !== '') {
    $where[] = 'o.created_at <= ?';
    $params[] = $to . ' 23:59:59';
}
$whereSql = implode(' AND ', $where);
$baseSql = "FROM orders o JOIN users u ON u.id = o.user_id WHERE $whereSql";

// ---- CSV export -----------------------------------------------------------
if (qs('export') === 'csv') {
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="orders-' . date('Ymd-His') . '.csv"');
    $out = fopen('php://output', 'w');
    fwrite($out, "\xEF\xBB\xBF"); // UTF-8 BOM so Excel shows Somali characters correctly
    fputcsv($out, ['Order No', 'Date', 'Customer', 'Phone', 'From', 'To', 'Sent', 'Send Currency', 'Fee', 'Rate', 'Received', 'Receive Currency', 'Sender Account', 'Receiver Account', 'Payment Ref', 'Payout Ref', 'Status', 'Completed At']);
    $st = q("SELECT o.*, u.name AS customer, u.phone AS customer_phone $baseSql ORDER BY o.id DESC", $params);
    while ($o = $st->fetch()) {
        fputcsv($out, [
            $o['order_no'], $o['created_at'], $o['customer'], $o['customer_phone'], $o['from_name'], $o['to_name'],
            number_format((float) $o['send_amount'], (int) $o['from_decimals'], '.', ''), $o['from_currency'],
            number_format((float) $o['fee_amount'], (int) $o['from_decimals'], '.', ''), (float) $o['rate'],
            number_format((float) $o['receive_amount'], (int) $o['to_decimals'], '.', ''), $o['to_currency'],
            $o['sender_account'], $o['receiver_account'], $o['payment_ref'], $o['payout_ref'], $o['status'], $o['completed_at'],
        ]);
    }
    fclose($out);
    exit;
}

$p = paginate((int) val("SELECT COUNT(*) $baseSql", $params), 25);
$orders = rows("SELECT o.*, u.name AS customer, u.phone AS customer_phone $baseSql ORDER BY o.id DESC LIMIT {$p['per']} OFFSET {$p['offset']}", $params);
$pairs = rows('SELECT p.id, f.name AS f, t.name AS t FROM pairs p JOIN gateways f ON f.id = p.from_gateway_id JOIN gateways t ON t.id = p.to_gateway_id ORDER BY p.sort_order, p.id');
$counts = [];
foreach (rows('SELECT status, COUNT(*) AS n FROM orders GROUP BY status') as $r) {
    $counts[$r['status']] = (int) $r['n'];
}

$pageTitle = t('a_orders');
require APP_PATH . '/views/admin_header.php';
?>
<div class="card">
  <nav class="tabs">
    <a href="<?= e(url('admin/orders.php')) ?>" class="<?= $status === '' ? 'active' : '' ?>"><?= e(t('all_statuses')) ?> (<?= array_sum($counts) ?>)</a>
    <a href="?status=pending" class="<?= $status === 'pending' ? 'active' : '' ?>"><?= e(t('a_to_review')) ?> (<?= ($counts['pending'] ?? 0) + ($counts['processing'] ?? 0) ?>)</a>
    <?php foreach (['awaiting_payment', 'completed', 'cancelled', 'rejected', 'expired'] as $s): ?>
      <a href="?status=<?= e($s) ?>" class="<?= $status === $s ? 'active' : '' ?>"><?= e(statuses()[$s]) ?> (<?= $counts[$s] ?? 0 ?>)</a>
    <?php endforeach; ?>
  </nav>
  <form method="get" class="filters">
    <input type="hidden" name="status" value="<?= e($status) ?>">
    <div class="form-group" style="flex:2"><label><?= e(t('search')) ?></label><input class="input" name="q" value="<?= e($search) ?>" placeholder="<?= e(t('a_search_ph')) ?>"></div>
    <div class="form-group"><label><?= e(t('a_pair')) ?></label>
      <select class="input" name="pair"><option value=""><?= e(t('all')) ?></option>
        <?php foreach ($pairs as $pr): ?><option value="<?= (int) $pr['id'] ?>" <?= $pairId === (int) $pr['id'] ? 'selected' : '' ?>><?= e($pr['f'] . ' → ' . $pr['t']) ?></option><?php endforeach; ?>
      </select>
    </div>
    <div class="form-group"><label><?= e(t('from')) ?></label><input class="input" type="date" name="from" value="<?= e($from) ?>"></div>
    <div class="form-group"><label><?= e(t('to')) ?></label><input class="input" type="date" name="to" value="<?= e($to) ?>"></div>
    <div class="btn-group">
      <button class="btn btn-primary btn-sm" type="submit"><?= icon('search', 15) ?> <?= e(t('apply')) ?></button>
      <a class="btn btn-outline btn-sm" href="<?= e(query_with(['export' => 'csv', 'page' => null])) ?>"><?= icon('download', 15) ?> CSV</a>
      <a class="btn btn-outline btn-sm" target="_blank" href="<?= e(url('admin/reports.php' . query_with(['page' => null, 'q' => null, 'export' => null]))) ?>"><?= icon('print', 15) ?> <?= e(t('a_print_report')) ?></a>
    </div>
  </form>
  <?php if (!$orders): ?>
    <div class="empty"><?= icon('list', 36) ?><p><?= e(t('no_orders')) ?></p></div>
  <?php else: ?>
  <div class="table-wrap">
    <table class="table">
      <thead><tr><th><?= e(t('order_no')) ?></th><th><?= e(t('customer')) ?></th><th><?= e(t('exchange')) ?></th><th class="num"><?= e(t('sent')) ?></th><th class="num"><?= e(t('received')) ?></th><th><?= e(t('payment_ref')) ?></th><th><?= e(t('status')) ?></th><th><?= e(t('date')) ?></th><th></th></tr></thead>
      <tbody>
      <?php foreach ($orders as $o): ?>
        <tr>
          <td><a class="mono" href="<?= e(url('admin/order.php?id=' . $o['id'])) ?>"><strong><?= e($o['order_no']) ?></strong></a></td>
          <td><a href="<?= e(url('admin/customer.php?id=' . $o['user_id'])) ?>"><?= e($o['customer']) ?></a><div class="small muted"><?= e($o['customer_phone']) ?></div></td>
          <td class="nowrap"><?= e($o['from_name']) ?> → <?= e($o['to_name']) ?></td>
          <td class="num"><?= e(money($o['send_amount'], $o['from_currency'], (int) $o['from_decimals'])) ?></td>
          <td class="num"><strong><?= e(money($o['receive_amount'], $o['to_currency'], (int) $o['to_decimals'])) ?></strong></td>
          <td class="mono small"><?= e($o['payment_ref'] ?: '—') ?></td>
          <td><?= status_badge($o['status']) ?></td>
          <td class="nowrap small"><?= e(fmt_date($o['created_at'])) ?></td>
          <td class="actions"><a class="btn btn-outline btn-sm" href="<?= e(url('admin/order.php?id=' . $o['id'])) ?>"><?= icon('eye', 15) ?></a></td>
        </tr>
      <?php endforeach; ?>
      </tbody>
    </table>
  </div>
  <?= pagination_links($p) ?>
  <?php endif; ?>
</div>
<?php require APP_PATH . '/views/admin_footer.php'; ?>
