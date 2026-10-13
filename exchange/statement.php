<?php
/**
 * Printable account statement.
 * Customers see their own; an admin can open any customer's with ?user=ID.
 */
require __DIR__ . '/app/bootstrap.php';

$adm = admin();
$userId = (int) ($_GET['user'] ?? 0);
if ($adm && $userId) {
    $customer = row('SELECT * FROM users WHERE id = ?', [$userId]);
    if (!$customer) {
        http_response_code(404);
        exit('Customer not found');
    }
} else {
    $customer = require_user();
    $userId = 0;
}
expire_orders();

// ---- Period ---------------------------------------------------------------
$today = date('Y-m-d');
$range = qs('range');
switch ($range) {
    case 'last_month':
        $from = date('Y-m-01', strtotime('first day of last month'));
        $to = date('Y-m-t', strtotime('last day of last month'));
        break;
    case 'last_3':
        $from = date('Y-m-d', strtotime('-3 months'));
        $to = $today;
        break;
    case 'this_year':
        $from = date('Y-01-01');
        $to = $today;
        break;
    case 'all':
        $from = date('Y-m-d', strtotime($customer['created_at']));
        $to = $today;
        break;
    case 'this_month':
        $from = date('Y-m-01');
        $to = $today;
        break;
    default:
        $from = valid_date(qs('from')) ? qs('from') : date('Y-m-01');
        $to = valid_date(qs('to')) ? qs('to') : $today;
}
if ($from > $to) {
    [$from, $to] = [$to, $from];
}
$scope = qs('scope') === 'all' ? 'all' : 'completed';

$sql = 'SELECT * FROM orders WHERE user_id = ? AND created_at BETWEEN ? AND ?';
$params = [$customer['id'], $from . ' 00:00:00', $to . ' 23:59:59'];
if ($scope === 'completed') {
    $sql .= " AND status = 'completed'";
}
$orders = rows($sql . ' ORDER BY created_at ASC, id ASC', $params);

// ---- Totals (completed orders only) ---------------------------------------
$completed = array_filter($orders, fn ($o) => $o['status'] === 'completed');
$sentBy = [];
$feeBy = [];
$received = [];
foreach ($completed as $o) {
    $cur = $o['from_currency'];
    $sentBy[$cur] = ($sentBy[$cur] ?? 0) + (float) $o['send_amount'];
    $feeBy[$cur] = ($feeBy[$cur] ?? 0) + (float) $o['fee_amount'];
    $key = $o['to_name'] . '|' . $o['to_currency'];
    $received[$key] ??= ['name' => $o['to_name'], 'currency' => $o['to_currency'], 'dec' => (int) $o['to_decimals'], 'amount' => 0.0, 'count' => 0];
    $received[$key]['amount'] += (float) $o['receive_amount'];
    $received[$key]['count']++;
}
$sendCurrency = $orders ? $orders[0]['from_currency'] : 'USD';
$sentBy = $sentBy ?: [$sendCurrency => 0.0];
$feeBy = $feeBy ?: [$sendCurrency => 0.0];
/** Several currencies are listed one per line. */
$moneyLines = fn (array $by) => implode('<br>', array_map(fn ($c, $v) => e(money($v, $c)), array_keys($by), $by));

$statementNo = 'ST-' . str_pad((string) $customer['id'], 6, '0', STR_PAD_LEFT) . '-' . date('Ymd', strtotime($to));
$docTitle = t('stmt_title') . ' — ' . $customer['name'];
$docHeading = t('stmt_title');
$docSubheading = t('stmt_title_alt');
$docMeta = [
    t('stmt_no')     => $statementNo,
    t('issue_date')  => date('d/m/Y H:i'),
    t('period')      => fmt_date($from, false) . ' – ' . fmt_date($to, false),
];
$autoPrint = isset($_GET['print']);
$base = $userId ? ['user' => $userId] : [];

require APP_PATH . '/views/doc_head.php';
?>
<div class="toolbar no-print">
  <div class="toolbar-inner">
    <a class="tb-back" href="<?= e($userId ? url('admin/customer.php?id=' . $userId) : url('account.php')) ?>"><?= icon('arrow-left', 16) ?> <?= e(t('back')) ?></a>
    <form method="get" class="tb-form">
      <?php if ($userId): ?><input type="hidden" name="user" value="<?= $userId ?>"><?php endif; ?>
      <label><?= e(t('from')) ?> <input type="date" name="from" value="<?= e($from) ?>"></label>
      <label><?= e(t('to')) ?> <input type="date" name="to" value="<?= e($to) ?>"></label>
      <label><?= e(t('show')) ?>
        <select name="scope">
          <option value="completed" <?= $scope === 'completed' ? 'selected' : '' ?>><?= e(t('scope_completed')) ?></option>
          <option value="all" <?= $scope === 'all' ? 'selected' : '' ?>><?= e(t('scope_all')) ?></option>
        </select>
      </label>
      <button type="submit" class="tb-btn"><?= icon('refresh', 15) ?> <?= e(t('apply')) ?></button>
    </form>
    <button type="button" class="tb-btn tb-primary" data-print><?= icon('print', 16) ?> <?= e(t('print_pdf')) ?></button>
  </div>
  <div class="toolbar-inner tb-ranges">
    <?php foreach (['this_month', 'last_month', 'last_3', 'this_year', 'all'] as $r): ?>
      <a href="?<?= e(http_build_query($base + ['range' => $r, 'scope' => $scope])) ?>" class="<?= $range === $r ? 'active' : '' ?>"><?= e(t('range_' . $r)) ?></a>
    <?php endforeach; ?>
    <span class="tb-lang"><a href="<?= e(query_with(['lang' => lang() === 'so' ? 'en' : 'so'])) ?>"><?= icon('globe', 14) ?> <?= lang() === 'so' ? 'English' : 'Soomaali' ?></a></span>
  </div>
</div>

<div class="sheet">
  <?php require APP_PATH . '/views/doc_letterhead.php'; ?>

  <section class="doc-parties">
    <div class="doc-box">
      <h4><?= e(t('customer')) ?></h4>
      <div class="doc-party-name"><?= e($customer['name']) ?></div>
      <div><?= e(t('customer_id')) ?>: <strong>CUS-<?= str_pad((string) $customer['id'], 6, '0', STR_PAD_LEFT) ?></strong></div>
      <div><?= e(t('phone')) ?>: <?= e($customer['phone']) ?></div>
      <?php if ($customer['email']): ?><div><?= e(t('email')) ?>: <?= e($customer['email']) ?></div><?php endif; ?>
      <div><?= e(t('member_since_short')) ?>: <?= e(fmt_date($customer['created_at'], false)) ?></div>
    </div>
    <div class="doc-box">
      <h4><?= e(t('statement_info')) ?></h4>
      <div><?= e(t('period')) ?>: <strong><?= e(fmt_date($from, false)) ?> – <?= e(fmt_date($to, false)) ?></strong></div>
      <div><?= e(t('show')) ?>: <?= e($scope === 'all' ? t('scope_all') : t('scope_completed')) ?></div>
      <div><?= e(t('transactions')) ?>: <?= count($orders) ?></div>
      <div><?= e(t('base_currency')) ?>: <?= e(implode(', ', array_keys($sentBy))) ?></div>
    </div>
  </section>

  <section class="doc-summary">
    <div class="doc-tile"><span><?= e(t('transactions')) ?></span><strong><?= count($orders) ?></strong></div>
    <div class="doc-tile"><span><?= e(t('st_completed')) ?></span><strong><?= count($completed) ?></strong></div>
    <div class="doc-tile doc-tile-brand"><span><?= e(t('total_sent')) ?></span><strong><?= $moneyLines($sentBy) ?></strong></div>
    <div class="doc-tile"><span><?= e(t('total_fees')) ?></span><strong><?= $moneyLines($feeBy) ?></strong></div>
  </section>

  <?php if ($received): ?>
  <section class="doc-received">
    <h4><?= e(t('received_by_method')) ?></h4>
    <div class="doc-chips">
      <?php foreach ($received as $r): ?>
        <div class="doc-chip"><span><?= e($r['name']) ?> <em>× <?= $r['count'] ?></em></span><strong><?= e(money($r['amount'], $r['currency'], $r['dec'])) ?></strong></div>
      <?php endforeach; ?>
    </div>
  </section>
  <?php endif; ?>

  <table class="doc-table">
    <thead>
      <tr>
        <th>#</th>
        <th><?= e(t('date')) ?></th>
        <th><?= e(t('order_no')) ?></th>
        <th><?= e(t('description')) ?></th>
        <th class="r"><?= e(t('sent')) ?></th>
        <th class="r"><?= e(t('fee')) ?></th>
        <th class="r"><?= e(t('received')) ?></th>
        <th><?= e(t('status')) ?></th>
      </tr>
    </thead>
    <tbody>
    <?php if (!$orders): ?>
      <tr><td colspan="8" class="doc-empty"><?= e(t('no_transactions_period')) ?></td></tr>
    <?php endif; ?>
    <?php foreach ($orders as $i => $o): $done = $o['status'] === 'completed'; ?>
      <tr class="<?= $done ? '' : 'muted-row' ?>">
        <td class="idx"><?= $i + 1 ?></td>
        <td class="nowrap"><?= e(fmt_date($o['created_at'], false)) ?><div class="sub"><?= e(date('H:i', strtotime($o['created_at']))) ?></div></td>
        <td class="mono nowrap"><?= e($o['order_no']) ?></td>
        <td><strong><?= e($o['from_name']) ?> → <?= e($o['to_name']) ?></strong><div class="sub mono"><?= e(mb_strimwidth($o['receiver_account'], 0, 34, '…')) ?></div></td>
        <td class="r nowrap"><?= e(fmt_amount($o['send_amount'], (int) $o['from_decimals'])) ?> <small><?= e($o['from_currency']) ?></small></td>
        <td class="r nowrap"><?= e(fmt_amount($o['fee_amount'], (int) $o['from_decimals'])) ?></td>
        <td class="r nowrap"><strong><?= e(fmt_amount($o['receive_amount'], (int) $o['to_decimals'])) ?></strong> <small><?= e($o['to_currency']) ?></small></td>
        <td><span class="st st-<?= e($o['status']) ?>"><?= e(statuses()[$o['status']] ?? $o['status']) ?></span></td>
      </tr>
    <?php endforeach; ?>
    </tbody>
    <?php if ($completed): ?>
    <tfoot>
      <tr>
        <td colspan="4"><?= e(t('total_completed')) ?> (<?= count($completed) ?>)</td>
        <td class="r nowrap"><?= $moneyLines($sentBy) ?></td>
        <td class="r nowrap"><?= $moneyLines($feeBy) ?></td>
        <td class="r" colspan="2"><?php foreach ($received as $r): ?><div class="nowrap"><?= e(fmt_amount($r['amount'], $r['dec'])) ?> <small><?= e($r['currency']) ?> · <?= e($r['name']) ?></small></div><?php endforeach; ?></td>
      </tr>
    </tfoot>
    <?php endif; ?>
  </table>
  <?php if ($scope === 'all'): ?><p class="doc-footnote">* <?= e(t('totals_note')) ?></p><?php endif; ?>

  <section class="doc-end">
    <div class="doc-note">
      <h4><?= e(t('important_note')) ?></h4>
      <p><?= e(setting('statement_note')) ?></p>
    </div>
    <div class="doc-sign">
      <?= company_stamp(t('verified'), date('d.m.Y')) ?>
      <div class="doc-sign-line"><?= e(t('authorized_signature')) ?></div>
    </div>
  </section>

  <footer class="doc-footer">
    <span><?= e(t('computer_generated')) ?></span>
    <span><?= e($statementNo) ?> · <?= date('d/m/Y H:i') ?></span>
  </footer>
</div>
<script src="<?= e(asset('js/app.js')) ?>"></script>
</body>
</html>
