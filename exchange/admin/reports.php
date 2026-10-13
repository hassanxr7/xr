<?php
/** Printable business report (admin). */
require dirname(__DIR__) . '/app/bootstrap.php';

require_admin();
expire_orders();

$from = valid_date(qs('from')) ? qs('from') : date('Y-m-01');
$to = valid_date(qs('to')) ? qs('to') : date('Y-m-d');
if ($from > $to) {
    [$from, $to] = [$to, $from];
}
$status = qs('status', 'completed');
$pairId = (int) qs('pair');
$showList = qs('list', '1') === '1';

$where = ['o.created_at BETWEEN ? AND ?'];
$params = [$from . ' 00:00:00', $to . ' 23:59:59'];
if ($status === 'pending') {
    $where[] = "o.status IN ('pending','processing')";
} elseif ($status !== '' && $status !== 'all' && array_key_exists($status, statuses())) {
    $where[] = 'o.status = ?';
    $params[] = $status;
}
if ($pairId) {
    $where[] = 'o.pair_id = ?';
    $params[] = $pairId;
}
$whereSql = implode(' AND ', $where);

$byPair = rows(
    "SELECT o.from_name, o.to_name, o.from_currency, o.to_currency, MAX(o.from_decimals) AS fd, MAX(o.to_decimals) AS td,
            COUNT(*) AS n, SUM(o.status = 'completed') AS done,
            SUM(CASE WHEN o.status = 'completed' THEN o.send_amount ELSE 0 END) AS sent,
            SUM(CASE WHEN o.status = 'completed' THEN o.fee_amount ELSE 0 END) AS fees,
            SUM(CASE WHEN o.status = 'completed' THEN o.receive_amount ELSE 0 END) AS received
     FROM orders o WHERE $whereSql
     GROUP BY o.from_name, o.to_name, o.from_currency, o.to_currency
     ORDER BY sent DESC",
    $params
);
$byStatus = [];
foreach (rows("SELECT o.status, COUNT(*) AS n FROM orders o WHERE $whereSql GROUP BY o.status", $params) as $r) {
    $byStatus[$r['status']] = (int) $r['n'];
}
$orders = $showList ? rows("SELECT o.*, u.name AS customer FROM orders o JOIN users u ON u.id = o.user_id WHERE $whereSql ORDER BY o.created_at ASC, o.id ASC LIMIT 2000", $params) : [];

$totalOrders = array_sum($byStatus);
$totalDone = (int) ($byStatus['completed'] ?? 0);
$sentBy = [];
$feeBy = [];
foreach ($byPair as $r) {
    $sentBy[$r['from_currency']] = ($sentBy[$r['from_currency']] ?? 0) + (float) $r['sent'];
    $feeBy[$r['from_currency']] = ($feeBy[$r['from_currency']] ?? 0) + (float) $r['fees'];
}
$sentBy = $sentBy ?: ['USD' => 0.0];
$feeBy = $feeBy ?: ['USD' => 0.0];
$moneyLines = fn (array $by) => implode('<br>', array_map(fn ($c, $v) => e(money($v, $c)), array_keys($by), $by));
$pairs = rows('SELECT p.id, f.name AS f, t.name AS t FROM pairs p JOIN gateways f ON f.id = p.from_gateway_id JOIN gateways t ON t.id = p.to_gateway_id ORDER BY p.sort_order, p.id');
$statusLabel = $status === 'all' || $status === '' ? t('scope_all') : ($status === 'pending' ? t('a_to_review') : (statuses()[$status] ?? $status));

$reportNo = 'RP-' . date('Ymd', strtotime($from)) . '-' . date('Ymd', strtotime($to));
$docTitle = t('a_report_title') . ' ' . $reportNo;
$docHeading = t('a_report_title');
$docSubheading = t('a_report_title_alt');
$docMeta = [
    t('a_report_no') => $reportNo,
    t('issue_date')  => date('d/m/Y H:i'),
    t('period')      => fmt_date($from, false) . ' – ' . fmt_date($to, false),
];
require APP_PATH . '/views/doc_head.php';
?>
<div class="toolbar no-print">
  <div class="toolbar-inner">
    <a class="tb-back" href="<?= e(url('admin/orders.php')) ?>"><?= icon('arrow-left', 16) ?> <?= e(t('back')) ?></a>
    <form method="get" class="tb-form">
      <label><?= e(t('from')) ?> <input type="date" name="from" value="<?= e($from) ?>"></label>
      <label><?= e(t('to')) ?> <input type="date" name="to" value="<?= e($to) ?>"></label>
      <label><?= e(t('status')) ?>
        <select name="status">
          <option value="all" <?= $status === 'all' || $status === '' ? 'selected' : '' ?>><?= e(t('scope_all')) ?></option>
          <?php foreach (statuses() as $k => $label): ?><option value="<?= e($k) ?>" <?= $status === $k ? 'selected' : '' ?>><?= e($label) ?></option><?php endforeach; ?>
        </select>
      </label>
      <label><?= e(t('a_pair')) ?>
        <select name="pair"><option value=""><?= e(t('all')) ?></option>
          <?php foreach ($pairs as $pr): ?><option value="<?= (int) $pr['id'] ?>" <?= $pairId === (int) $pr['id'] ? 'selected' : '' ?>><?= e($pr['f'] . ' → ' . $pr['t']) ?></option><?php endforeach; ?>
        </select>
      </label>
      <label><?= e(t('a_include_list')) ?>
        <select name="list"><option value="1" <?= $showList ? 'selected' : '' ?>><?= e(t('yes')) ?></option><option value="0" <?= $showList ? '' : 'selected' ?>><?= e(t('no')) ?></option></select>
      </label>
      <button type="submit" class="tb-btn"><?= icon('refresh', 15) ?> <?= e(t('apply')) ?></button>
    </form>
    <button type="button" class="tb-btn tb-primary" data-print><?= icon('print', 16) ?> <?= e(t('print_pdf')) ?></button>
  </div>
</div>

<div class="sheet">
  <?php require APP_PATH . '/views/doc_letterhead.php'; ?>

  <section class="doc-parties">
    <div class="doc-box">
      <h4><?= e(t('a_report_scope')) ?></h4>
      <div><?= e(t('period')) ?>: <strong><?= e(fmt_date($from, false)) ?> – <?= e(fmt_date($to, false)) ?></strong></div>
      <div><?= e(t('status')) ?>: <strong><?= e($statusLabel) ?></strong></div>
      <div><?= e(t('a_pair')) ?>: <strong><?php if ($pairId) { foreach ($pairs as $pr) { if ((int) $pr['id'] === $pairId) { echo e($pr['f'] . ' → ' . $pr['t']); } } } else { echo e(t('all')); } ?></strong></div>
    </div>
    <div class="doc-box">
      <h4><?= e(t('a_by_status')) ?></h4>
      <?php if (!$byStatus): ?><div>—</div><?php endif; ?>
      <?php foreach ($byStatus as $s => $n): ?><div><?= e(statuses()[$s] ?? $s) ?>: <strong><?= $n ?></strong></div><?php endforeach; ?>
    </div>
  </section>

  <section class="doc-summary">
    <div class="doc-tile"><span><?= e(t('transactions')) ?></span><strong><?= $totalOrders ?></strong></div>
    <div class="doc-tile"><span><?= e(t('st_completed')) ?></span><strong><?= $totalDone ?></strong></div>
    <div class="doc-tile doc-tile-brand"><span><?= e(t('a_total_volume')) ?></span><strong><?= $moneyLines($sentBy) ?></strong></div>
    <div class="doc-tile"><span><?= e(t('a_total_fees')) ?></span><strong><?= $moneyLines($feeBy) ?></strong></div>
  </section>

  <div class="rp-section">
    <h3><?= e(t('a_by_pair')) ?></h3>
    <table class="doc-table rp-table">
      <thead><tr><th><?= e(t('a_pair')) ?></th><th class="r"><?= e(t('transactions')) ?></th><th class="r"><?= e(t('st_completed')) ?></th><th class="r"><?= e(t('sent')) ?></th><th class="r"><?= e(t('fee')) ?></th><th class="r"><?= e(t('a_paid_out')) ?></th></tr></thead>
      <tbody>
      <?php if (!$byPair): ?><tr><td colspan="6" class="doc-empty"><?= e(t('no_transactions_period')) ?></td></tr><?php endif; ?>
      <?php foreach ($byPair as $r): ?>
        <tr>
          <td class="label"><?= e($r['from_name']) ?> → <?= e($r['to_name']) ?></td>
          <td class="r"><?= (int) $r['n'] ?></td>
          <td class="r"><?= (int) $r['done'] ?></td>
          <td class="r nowrap"><?= e(fmt_amount($r['sent'], (int) $r['fd'])) ?> <small><?= e($r['from_currency']) ?></small></td>
          <td class="r nowrap"><?= e(fmt_amount($r['fees'], (int) $r['fd'])) ?> <small><?= e($r['from_currency']) ?></small></td>
          <td class="r nowrap"><strong><?= e(fmt_amount($r['received'], (int) $r['td'])) ?></strong> <small><?= e($r['to_currency']) ?></small></td>
        </tr>
      <?php endforeach; ?>
      </tbody>
      <?php if ($byPair): ?>
      <tfoot><tr><td><?= e(t('total')) ?></td><td class="r"><?= $totalOrders ?></td><td class="r"><?= $totalDone ?></td><td class="r nowrap"><?= $moneyLines($sentBy) ?></td><td class="r nowrap"><?= $moneyLines($feeBy) ?></td><td></td></tr></tfoot>
      <?php endif; ?>
    </table>
    <p class="doc-footnote">* <?= e(t('totals_note')) ?></p>
  </div>

  <?php if ($showList): ?>
  <div class="rp-section">
    <h3><?= e(t('a_transactions_list')) ?></h3>
    <table class="doc-table">
      <thead><tr><th>#</th><th><?= e(t('date')) ?></th><th><?= e(t('order_no')) ?></th><th><?= e(t('customer')) ?></th><th><?= e(t('description')) ?></th><th class="r"><?= e(t('sent')) ?></th><th class="r"><?= e(t('fee')) ?></th><th class="r"><?= e(t('received')) ?></th><th><?= e(t('status')) ?></th></tr></thead>
      <tbody>
      <?php if (!$orders): ?><tr><td colspan="9" class="doc-empty"><?= e(t('no_transactions_period')) ?></td></tr><?php endif; ?>
      <?php foreach ($orders as $i => $o): ?>
        <tr class="<?= $o['status'] === 'completed' ? '' : 'muted-row' ?>">
          <td class="idx"><?= $i + 1 ?></td>
          <td class="nowrap"><?= e(fmt_date($o['created_at'], false)) ?><div class="sub"><?= e(date('H:i', strtotime($o['created_at']))) ?></div></td>
          <td class="mono nowrap"><?= e($o['order_no']) ?></td>
          <td><?= e($o['customer']) ?><div class="sub"><?= e($o['sender_account']) ?></div></td>
          <td><?= e($o['from_name']) ?> → <?= e($o['to_name']) ?></td>
          <td class="r nowrap"><?= e(fmt_amount($o['send_amount'], (int) $o['from_decimals'])) ?> <small><?= e($o['from_currency']) ?></small></td>
          <td class="r nowrap"><?= e(fmt_amount($o['fee_amount'], (int) $o['from_decimals'])) ?></td>
          <td class="r nowrap"><strong><?= e(fmt_amount($o['receive_amount'], (int) $o['to_decimals'])) ?></strong> <small><?= e($o['to_currency']) ?></small></td>
          <td><span class="st st-<?= e($o['status']) ?>"><?= e(statuses()[$o['status']] ?? $o['status']) ?></span></td>
        </tr>
      <?php endforeach; ?>
      </tbody>
    </table>
  </div>
  <?php endif; ?>

  <section class="doc-end">
    <div class="doc-note">
      <h4><?= e(t('important_note')) ?></h4>
      <p><?= e(t('a_report_note')) ?></p>
    </div>
    <div class="doc-sign">
      <?= company_stamp(t('verified'), date('d.m.Y')) ?>
      <div class="doc-sign-line"><?= e(t('authorized_signature')) ?> · <?= e(admin()['name'] ?? '') ?></div>
    </div>
  </section>
  <footer class="doc-footer">
    <span><?= e(t('computer_generated')) ?></span>
    <span><?= e($reportNo) ?> · <?= date('d/m/Y H:i') ?></span>
  </footer>
</div>
<script src="<?= e(asset('js/app.js')) ?>"></script>
</body>
</html>
