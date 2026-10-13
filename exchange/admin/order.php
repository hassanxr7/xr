<?php
require dirname(__DIR__) . '/app/bootstrap.php';

$adm = require_admin();
expire_orders();

$order = row('SELECT * FROM orders WHERE id = ?', [(int) ($_GET['id'] ?? 0)]);
if (!$order) {
    flash('error', t('order_not_found'));
    redirect('admin/orders.php');
}
$self = 'admin/order.php?id=' . $order['id'];

if (is_post()) {
    csrf_check();
    $newStatus = input('quick') !== '' ? input('quick') : input('status');
    $message = mb_substr(input('message'), 0, 500);
    $extra = [
        'payout_ref' => mb_substr(input('payout_ref'), 0, 190) ?: null,
        'admin_note' => mb_substr(input('admin_note'), 0, 5000) ?: null,
    ];
    if (!array_key_exists($newStatus, statuses())) {
        flash('error', t('a_invalid_status'));
        redirect($self);
    }
    if ($newStatus === 'rejected' && $message === '') {
        flash('error', t('a_reject_reason'));
        redirect($self);
    }
    set_order_status($order, $newStatus, $message, 'admin', (int) $adm['id'], $extra);
    flash('success', t('saved'));
    redirect($self);
}

$customer = row('SELECT * FROM users WHERE id = ?', [$order['user_id']]);
$custStats = row("SELECT COUNT(*) AS n, SUM(status = 'completed') AS done FROM orders WHERE user_id = ?", [$order['user_id']]);
$logs = rows('SELECT l.*, a.name AS admin_name FROM order_logs l LEFT JOIN admins a ON l.actor = \'admin\' AND a.id = l.actor_id WHERE l.order_id = ? ORDER BY l.id DESC', [$order['id']]);
$fromGw = $order['from_gateway_id'] ? row('SELECT * FROM gateways WHERE id = ?', [$order['from_gateway_id']]) : null;
$toGw = $order['to_gateway_id'] ? row('SELECT * FROM gateways WHERE id = ?', [$order['to_gateway_id']]) : null;
$fd = (int) $order['from_decimals'];
$td = (int) $order['to_decimals'];
$isOpen = in_array($order['status'], ['awaiting_payment', 'pending', 'processing'], true);

$pageTitle = t('order') . ' ' . $order['order_no'];
require APP_PATH . '/views/admin_header.php';
?>
<div class="toolbar-row">
  <a class="btn btn-ghost btn-sm" href="<?= e(url('admin/orders.php')) ?>"><?= icon('arrow-left', 16) ?> <?= e(t('a_orders')) ?></a>
  <div class="btn-group">
    <a class="btn btn-outline btn-sm" target="_blank" href="<?= e(url('receipt.php?no=' . urlencode($order['order_no']))) ?>"><?= icon('print', 16) ?> <?= e(t('print_receipt')) ?></a>
    <a class="btn btn-outline btn-sm" target="_blank" href="<?= e(url('statement.php?user=' . $order['user_id'])) ?>"><?= icon('file', 16) ?> <?= e(t('nav_statement')) ?></a>
  </div>
</div>

<div class="grid grid-main">
  <div class="grid">
    <div class="card">
      <div class="order-hero">
        <div class="order-no"><?= e(t('order_no')) ?><strong><?= e($order['order_no']) ?></strong></div>
        <div class="btn-group"><?= status_badge($order['status']) ?><span class="small muted"><?= e(fmt_date($order['created_at'])) ?></span></div>
      </div>
      <div class="flow">
        <div class="flow-side"><?= gw_badge($order['from_name'], $fromGw['color'] ?? null, $fromGw['logo'] ?? null, 'lg') ?><div><small><?= e(t('a_customer_sends')) ?></small><strong><?= e(money($order['send_amount'], $order['from_currency'], $fd)) ?></strong><div class="muted small"><?= e($order['from_name']) ?></div></div></div>
        <span class="flow-arrow"><?= icon('arrow-right', 18) ?></span>
        <div class="flow-side"><?= gw_badge($order['to_name'], $toGw['color'] ?? null, $toGw['logo'] ?? null, 'lg') ?><div><small><?= e(t('a_we_pay')) ?></small><strong><?= e(money($order['receive_amount'], $order['to_currency'], $td)) ?></strong><div class="muted small"><?= e($order['to_name']) ?></div></div></div>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h3><?= icon('file', 18) ?> <?= e(t('details')) ?></h3></div>
      <div class="card-body">
        <dl class="kv">
          <div><dt><?= e(t('a_customer_sends')) ?></dt><dd><?= e(money($order['send_amount'], $order['from_currency'], $fd)) ?></dd></div>
          <div><dt><?= e(t('fee')) ?></dt><dd><?= e(money($order['fee_amount'], $order['from_currency'], $fd)) ?></dd></div>
          <div><dt><?= e(t('rate')) ?></dt><dd>1 <?= e($order['from_currency']) ?> = <?= e(fmt_amount($order['rate'], 4)) ?> <?= e($order['to_currency']) ?></dd></div>
          <div><dt><?= e(t('a_we_pay')) ?></dt><dd class="big"><?= e(money($order['receive_amount'], $order['to_currency'], $td)) ?> <button type="button" class="btn btn-ghost btn-sm copy-btn" data-copy="<?= e(number_format((float) $order['receive_amount'], $td, '.', '')) ?>"><?= icon('copy', 14) ?></button></dd></div>
          <div><dt><?= e(t('sender_account', ['gw' => $order['from_name']])) ?></dt><dd class="mono"><?= e($order['sender_account']) ?></dd></div>
          <div><dt><?= e(t('a_paid_to')) ?></dt><dd class="mono"><?= e($order['pay_to'] ?: '—') ?></dd></div>
          <div><dt><?= e($order['receiver_label'] ?: t('receiver_account')) ?></dt><dd class="mono"><?= e($order['receiver_account']) ?> <button type="button" class="btn btn-ghost btn-sm copy-btn" data-copy="<?= e($order['receiver_account']) ?>"><?= icon('copy', 14) ?></button></dd></div>
          <div><dt><?= e(t('payment_ref')) ?></dt><dd class="mono"><?= e($order['payment_ref'] ?: '—') ?></dd></div>
          <div><dt><?= e(t('payout_ref')) ?></dt><dd class="mono"><?= e($order['payout_ref'] ?: '—') ?></dd></div>
          <div><dt><?= e(t('a_paid_at')) ?></dt><dd><?= e(fmt_date($order['paid_at'])) ?></dd></div>
          <div><dt><?= e(t('completed_at')) ?></dt><dd><?= e(fmt_date($order['completed_at'])) ?></dd></div>
          <?php if ($order['customer_note']): ?><div><dt><?= e(t('note')) ?></dt><dd><?= e($order['customer_note']) ?></dd></div><?php endif; ?>
          <div><dt>IP</dt><dd class="mono small"><?= e($order['ip'] ?: '—') ?></dd></div>
        </dl>
      </div>
    </div>

    <?php if ($order['proof_file']): ?>
    <div class="card">
      <div class="card-head"><h3><?= icon('upload', 18) ?> <?= e(t('proof')) ?></h3><a class="btn btn-ghost btn-sm" target="_blank" href="<?= e(url('proof.php?id=' . $order['id'])) ?>"><?= icon('external', 15) ?></a></div>
      <div class="card-body"><a target="_blank" href="<?= e(url('proof.php?id=' . $order['id'])) ?>"><img class="proof-img" src="<?= e(url('proof.php?id=' . $order['id'])) ?>" alt="proof"></a></div>
    </div>
    <?php endif; ?>
  </div>

  <div class="grid">
    <form method="post" class="card">
      <?= csrf_field() ?>
      <div class="card-head"><h3><?= icon('edit', 18) ?> <?= e(t('a_update_order')) ?></h3></div>
      <div class="card-body">
        <?php if ($isOpen): ?>
        <div class="btn-group" style="margin-bottom:16px">
          <?php if ($order['status'] !== 'processing'): ?><button class="btn btn-outline btn-sm" name="quick" value="processing" type="submit"><?= icon('refresh', 15) ?> <?= e(t('st_processing')) ?></button><?php endif; ?>
          <button class="btn btn-success btn-sm" name="quick" value="completed" type="submit" data-confirm-click="<?= e(t('a_confirm_complete')) ?>"><?= icon('check', 15) ?> <?= e(t('a_mark_completed')) ?></button>
        </div>
        <?php endif; ?>
        <div class="form-group">
          <label for="status"><?= e(t('status')) ?></label>
          <select class="input" id="status" name="status">
            <?php foreach (statuses() as $k => $label): ?><option value="<?= e($k) ?>" <?= $order['status'] === $k ? 'selected' : '' ?>><?= e($label) ?></option><?php endforeach; ?>
          </select>
        </div>
        <div class="form-group">
          <label for="payout_ref"><?= e(t('payout_ref')) ?></label>
          <input class="input mono" id="payout_ref" name="payout_ref" value="<?= e($order['payout_ref']) ?>" placeholder="<?= e(t('a_payout_ph')) ?>">
        </div>
        <div class="form-group">
          <label for="message"><?= e(t('a_message_customer')) ?></label>
          <textarea class="input" id="message" name="message" rows="2" maxlength="500" placeholder="<?= e(t('a_message_ph')) ?>"></textarea>
        </div>
        <div class="form-group">
          <label for="admin_note"><?= e(t('a_internal_note')) ?></label>
          <textarea class="input" id="admin_note" name="admin_note" rows="2"><?= e($order['admin_note']) ?></textarea>
        </div>
        <button class="btn btn-primary btn-block" type="submit"><?= e(t('save')) ?></button>
      </div>
    </form>

    <div class="card">
      <div class="card-head"><h3><?= icon('user', 18) ?> <?= e(t('customer')) ?></h3><a class="btn btn-ghost btn-sm" href="<?= e(url('admin/customer.php?id=' . $order['user_id'])) ?>"><?= icon('eye', 15) ?></a></div>
      <div class="card-body">
        <dl class="kv">
          <div><dt><?= e(t('full_name')) ?></dt><dd><?= e($customer['name'] ?? '—') ?></dd></div>
          <div><dt><?= e(t('phone')) ?></dt><dd><a href="tel:<?= e($customer['phone'] ?? '') ?>"><?= e($customer['phone'] ?? '—') ?></a></dd></div>
          <?php if (!empty($customer['email'])): ?><div><dt><?= e(t('email')) ?></dt><dd><?= e($customer['email']) ?></dd></div><?php endif; ?>
          <div><dt><?= e(t('total_orders')) ?></dt><dd><?= (int) $custStats['n'] ?> (<?= (int) $custStats['done'] ?> <?= e(t('st_completed')) ?>)</dd></div>
          <div><dt><?= e(t('status')) ?></dt><dd><span class="badge badge-<?= e($customer['status'] ?? 'active') ?>"><?= e(t('u_' . ($customer['status'] ?? 'active'))) ?></span></dd></div>
        </dl>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h3><?= icon('clock', 18) ?> <?= e(t('history')) ?></h3></div>
      <div class="card-body">
        <ul class="timeline">
          <?php foreach ($logs as $log): ?>
          <li>
            <div><?= status_badge($log['status']) ?> <span class="small muted">· <?= e($log['actor'] === 'admin' ? ($log['admin_name'] ?: 'Admin') : t('actor_' . $log['actor'])) ?></span></div>
            <div class="tl-time"><?= e(fmt_date($log['created_at'])) ?></div>
            <?php if ($log['note']): ?><div class="tl-note"><?= e($log['note']) ?></div><?php endif; ?>
          </li>
          <?php endforeach; ?>
        </ul>
      </div>
    </div>
  </div>
</div>
<?php require APP_PATH . '/views/admin_footer.php'; ?>
