<?php
/** Printable receipt for a single order (owner or admin). */
require __DIR__ . '/app/bootstrap.php';

$adm = admin();
$no = qs('no');
if ($adm) {
    $order = row('SELECT * FROM orders WHERE order_no = ?', [$no]);
} else {
    $me = require_user();
    $order = row('SELECT * FROM orders WHERE order_no = ? AND user_id = ?', [$no, $me['id']]);
}
if (!$order) {
    http_response_code(404);
    exit('Order not found');
}
$customer = row('SELECT * FROM users WHERE id = ?', [$order['user_id']]);
$fd = (int) $order['from_decimals'];
$td = (int) $order['to_decimals'];
$isDone = $order['status'] === 'completed';
$isClosed = in_array($order['status'], ['cancelled', 'rejected', 'expired'], true);

$docTitle = t('receipt') . ' ' . $order['order_no'];
$docHeading = t('receipt_title');
$docSubheading = t('receipt_title_alt');
$docMeta = [
    t('receipt_no') => $order['order_no'],
    t('date')       => fmt_date($order['created_at']),
    t('printed')    => date('d/m/Y H:i'),
];
$autoPrint = isset($_GET['print']);

require APP_PATH . '/views/doc_head.php';
?>
<div class="toolbar no-print">
  <div class="toolbar-inner">
    <a class="tb-back" href="<?= e($adm ? url('admin/order.php?id=' . $order['id']) : url('order.php?no=' . urlencode($order['order_no']))) ?>"><?= icon('arrow-left', 16) ?> <?= e(t('back')) ?></a>
    <span class="tb-spacer"></span>
    <span class="tb-lang"><a href="<?= e(query_with(['lang' => lang() === 'so' ? 'en' : 'so'])) ?>"><?= icon('globe', 14) ?> <?= lang() === 'so' ? 'English' : 'Soomaali' ?></a></span>
    <button type="button" class="tb-btn tb-primary" data-print><?= icon('print', 16) ?> <?= e(t('print_pdf')) ?></button>
  </div>
</div>

<div class="sheet sheet-receipt">
  <?php require APP_PATH . '/views/doc_letterhead.php'; ?>

  <div class="rc-status rc-<?= $isDone ? 'done' : ($isClosed ? 'closed' : 'open') ?>">
    <span class="rc-ic"><?= icon($isDone ? 'check' : ($isClosed ? 'x' : 'clock'), 22) ?></span>
    <div>
      <strong><?= e(statuses()[$order['status']] ?? $order['status']) ?></strong>
      <span><?= e($isDone ? t('rc_done_text') : ($isClosed ? t('rc_closed_text') : t('rc_open_text'))) ?></span>
    </div>
    <?php if ($isDone): ?><div class="rc-stamp"><?= e(t('paid_stamp')) ?></div><?php endif; ?>
  </div>

  <section class="rc-flow">
    <div class="rc-side">
      <small><?= e(t('you_send')) ?></small>
      <strong><?= e(fmt_amount($order['send_amount'], $fd)) ?> <em><?= e($order['from_currency']) ?></em></strong>
      <span><?= e($order['from_name']) ?></span>
    </div>
    <div class="rc-arrow"><?= icon('arrow-right', 22) ?></div>
    <div class="rc-side rc-side-to">
      <small><?= e(t('you_receive')) ?></small>
      <strong><?= e(fmt_amount($order['receive_amount'], $td)) ?> <em><?= e($order['to_currency']) ?></em></strong>
      <span><?= e($order['to_name']) ?></span>
    </div>
  </section>

  <section class="doc-parties">
    <div class="doc-box">
      <h4><?= e(t('customer')) ?></h4>
      <div class="doc-party-name"><?= e($customer['name'] ?? '—') ?></div>
      <div><?= e(t('customer_id')) ?>: <strong>CUS-<?= str_pad((string) $order['user_id'], 6, '0', STR_PAD_LEFT) ?></strong></div>
      <div><?= e(t('phone')) ?>: <?= e($customer['phone'] ?? '—') ?></div>
    </div>
    <div class="doc-box">
      <h4><?= e(t('transaction')) ?></h4>
      <div><?= e(t('order_no')) ?>: <strong class="mono"><?= e($order['order_no']) ?></strong></div>
      <div><?= e(t('date')) ?>: <?= e(fmt_date($order['created_at'])) ?></div>
      <?php if ($order['completed_at']): ?><div><?= e(t('completed_at')) ?>: <?= e(fmt_date($order['completed_at'])) ?></div><?php endif; ?>
    </div>
  </section>

  <table class="rc-table">
    <tr><th><?= e(t('amount_sent')) ?></th><td><?= e(money($order['send_amount'], $order['from_currency'], $fd)) ?></td></tr>
    <tr><th><?= e(t('fee')) ?></th><td>− <?= e(money($order['fee_amount'], $order['from_currency'], $fd)) ?></td></tr>
    <tr><th><?= e(t('net_amount')) ?></th><td><?= e(money((float) $order['send_amount'] - (float) $order['fee_amount'], $order['from_currency'], $fd)) ?></td></tr>
    <tr><th><?= e(t('rate')) ?></th><td>1 <?= e($order['from_currency']) ?> = <?= e(fmt_amount($order['rate'], 4)) ?> <?= e($order['to_currency']) ?></td></tr>
    <tr class="rc-total"><th><?= e(t('amount_received')) ?></th><td><?= e(money($order['receive_amount'], $order['to_currency'], $td)) ?></td></tr>
    <tr><th><?= e(t('sender_account', ['gw' => $order['from_name']])) ?></th><td class="mono"><?= e($order['sender_account']) ?></td></tr>
    <tr><th><?= e($order['receiver_label'] ?: t('receiver_account')) ?></th><td class="mono"><?= e($order['receiver_account']) ?></td></tr>
    <?php if ($order['payment_ref']): ?><tr><th><?= e(t('payment_ref')) ?></th><td class="mono"><?= e($order['payment_ref']) ?></td></tr><?php endif; ?>
    <?php if ($order['payout_ref']): ?><tr><th><?= e(t('payout_ref')) ?></th><td class="mono"><?= e($order['payout_ref']) ?></td></tr><?php endif; ?>
  </table>

  <section class="doc-end">
    <div class="doc-note">
      <h4><?= e(t('thank_you')) ?></h4>
      <p><?= e(t('receipt_note', ['url' => preg_replace('#^https?://#', '', full_url('track.php'))])) ?></p>
    </div>
    <div class="doc-sign">
      <?php if ($isDone): ?><div class="doc-stamp"><span><?= e(mb_strtoupper(setting('site_name', 'XR Exchange'))) ?></span><strong><?= e(t('paid_stamp')) ?></strong><span><?= date('d.m.Y', strtotime($order['completed_at'])) ?></span></div><?php endif; ?>
      <div class="doc-sign-line"><?= e(t('authorized_signature')) ?></div>
    </div>
  </section>

  <footer class="doc-footer">
    <span><?= e(t('computer_generated')) ?></span>
    <span><?= e($order['order_no']) ?> · <?= date('d/m/Y H:i') ?></span>
  </footer>
</div>
<script src="<?= e(asset('js/app.js')) ?>"></script>
</body>
</html>
