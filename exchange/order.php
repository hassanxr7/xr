<?php
require __DIR__ . '/app/bootstrap.php';

$me = require_user();
expire_orders();

$order = row('SELECT * FROM orders WHERE order_no = ? AND user_id = ?', [qs('no'), $me['id']]);
if (!$order) {
    http_response_code(404);
    flash('error', t('order_not_found'));
    redirect('account.php');
}
$fromGw = $order['from_gateway_id'] ? row('SELECT * FROM gateways WHERE id = ?', [$order['from_gateway_id']]) : null;
$self = 'order.php?no=' . urlencode($order['order_no']);
$waafipayOn = waafipay_active_for($fromGw);
$sovamoneyOn = sovamoney_active_for($fromGw);
$nebdexMethods = nebdex_active_for($fromGw) ? nebdex_methods_for($fromGw) : [];
$realtimePayOn = $waafipayOn || $sovamoneyOn || $nebdexMethods !== [];

if (is_post()) {
    csrf_check();
    $action = input('action');

    if ($action === 'nebdex_initiate' && $order['status'] === 'awaiting_payment' && $nebdexMethods !== []) {
        $methodId = (int) input('method_id');
        $chosen = null;
        foreach ($nebdexMethods as $m) {
            if ((int) $m['id'] === $methodId) {
                $chosen = $m;
                break;
            }
        }
        if (!$chosen) {
            flash('error', t('nebdex_failed', ['msg' => 'Invalid payment method.']));
            redirect($self);
        }
        $email = input('customer_email');
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            flash('error', t('err_email'));
            redirect($self);
        }
        $result = nebdex_initiate_payment($order, $me, $chosen['method_code'], $email);
        if ($result['success'] && $result['redirect_url']) {
            redirect($result['redirect_url']);
        }
        flash('error', t('nebdex_failed', ['msg' => $result['message']]));
        redirect($self);
    }

    if ($action === 'sovamoney_initiate' && $order['status'] === 'awaiting_payment' && $sovamoneyOn) {
        $email = input('customer_email');
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            flash('error', t('err_email'));
            redirect($self);
        }
        $result = sovamoney_initiate_payment($order, $email, $me);
        if ($result['success'] && $result['url']) {
            redirect($result['url']);
        }
        flash('error', t('sovamoney_failed', ['msg' => $result['message']]));
        redirect($self);
    }

    if ($action === 'waafipay_purchase' && $order['status'] === 'awaiting_payment' && $waafipayOn) {
        $result = waafipay_purchase(
            $order['sender_account'],
            (float) $order['send_amount'],
            $order['from_currency'],
            $order['order_no'],
            'Hufan Exchange order ' . $order['order_no']
        );
        if ($result['success']) {
            set_order_status($order, 'processing', t('log_waafipay_paid', ['ref' => $result['transaction_id'] ?: $order['order_no']]), 'customer', (int) $me['id'], [
                'payment_ref' => $result['transaction_id'] ?: $order['order_no'],
            ]);
            telegram_notify(order_telegram_text(row('SELECT * FROM orders WHERE id = ?', [$order['id']]), '💳 WaafiPay payment confirmed'));
            $payout = sovamoney_payout_order((int) $order['id']);
            flash('success', $payout['status'] === 'success' ? t('sovamoney_payout_done_customer') : t('waafipay_success'));
        } else {
            order_log((int) $order['id'], 'awaiting_payment', t('log_waafipay_failed', ['msg' => $result['message']]), 'customer', (int) $me['id']);
            flash('error', t('waafipay_failed', ['msg' => $result['message']]));
        }
        redirect($self);
    }

    if ($action === 'cancel' && $order['status'] === 'awaiting_payment') {
        set_order_status($order, 'cancelled', t('log_customer_cancelled'), 'customer', (int) $me['id']);
        flash('info', t('order_cancelled'));
    }
    redirect($self);
}

$logs = rows('SELECT * FROM order_logs WHERE order_id = ? ORDER BY id DESC', [$order['id']]);
$fd = (int) $order['from_decimals'];
$td = (int) $order['to_decimals'];
$payTo = $fromGw['pay_to'] ?? $order['pay_to'];
$ussd = ussd_code($fromGw['ussd_template'] ?? null, $payTo, (float) $order['send_amount'], $fd);
$steps = order_progress_steps();
$stepIndex = array_search($order['status'], $steps, true);
$wa = whatsapp_link(t('wa_order', ['no' => $order['order_no']]));

$pageTitle = t('order') . ' ' . $order['order_no'];
$robotsMeta = 'noindex, follow';
require APP_PATH . '/views/header.php';
?>
<div class="page">
  <div class="container">
    <div class="page-head">
      <div>
        <h1><?= e(t('order_details')) ?></h1>
        <p><a href="<?= e(url('account.php')) ?>"><?= icon('arrow-left', 14) ?> <?= e(t('my_orders')) ?></a></p>
      </div>
      <div class="btn-group">
        <?php if ($wa): ?><a class="btn btn-outline btn-sm" href="<?= e($wa) ?>" target="_blank" rel="noopener"><?= icon('whatsapp', 16) ?> <?= e(t('get_help')) ?></a><?php endif; ?>
        <a class="btn btn-dark btn-sm" href="<?= e(url('receipt.php?no=' . urlencode($order['order_no']))) ?>" target="_blank"><?= icon('print', 16) ?> <?= e(t('print_receipt')) ?></a>
      </div>
    </div>

    <div class="grid grid-main">
      <div class="grid">
        <div class="card">
          <div class="order-hero">
            <div class="order-no"><?= e(t('order_no')) ?><strong><?= e($order['order_no']) ?></strong></div>
            <div><?= status_badge($order['status']) ?></div>
          </div>
          <div class="flow">
            <div class="flow-side">
              <?= gw_badge($order['from_name'], $fromGw['color'] ?? null, $fromGw['logo'] ?? null, 'lg') ?>
              <div><small><?= e(t('you_send')) ?></small><strong><?= e(money($order['send_amount'], $order['from_currency'], $fd)) ?></strong><div class="muted small"><?= e($order['from_name']) ?></div></div>
            </div>
            <span class="flow-arrow"><?= icon('arrow-right', 18) ?></span>
            <?php $toGw = $order['to_gateway_id'] ? row('SELECT color, logo FROM gateways WHERE id = ?', [$order['to_gateway_id']]) : null; ?>
            <div class="flow-side">
              <?= gw_badge($order['to_name'], $toGw['color'] ?? null, $toGw['logo'] ?? null, 'lg') ?>
              <div><small><?= e(t('you_receive')) ?></small><strong><?= e(money($order['receive_amount'], $order['to_currency'], $td)) ?></strong><div class="muted small"><?= e($order['to_name']) ?></div></div>
            </div>
          </div>
          <?php if ($stepIndex !== false): ?>
          <div class="progress">
            <?php foreach ($steps as $i => $s): ?>
              <div class="progress-step <?= $i < $stepIndex || $order['status'] === 'completed' ? 'done' : ($i === $stepIndex ? 'current' : '') ?>">
                <span class="progress-dot"><?= $i < $stepIndex || $order['status'] === 'completed' ? icon('check', 14) : '' ?></span>
                <?= e(statuses()[$s]) ?>
              </div>
            <?php endforeach; ?>
          </div>
          <?php endif; ?>
        </div>

        <?php if ($order['status'] === 'awaiting_payment'): ?>
        <div class="pay-box">
          <div class="btn-group" style="justify-content:space-between">
            <h3 class="mb-0"><?= icon('wallet', 20) ?> <?= e(t('pay_now_title', ['gw' => $order['from_name']])) ?></h3>
            <span class="countdown"><?= icon('clock', 15) ?> <span data-countdown="<?= order_expires_at($order) ?>">--:--</span></span>
          </div>
          <p class="muted mt-2"><?= e(t('pay_now_text', ['amount' => money($order['send_amount'], $order['from_currency'], $fd), 'gw' => $order['from_name']])) ?></p>

          <div class="grid grid-2">
            <div class="pay-target">
              <div><small><?= e(t('pay_to_number')) ?></small><strong><?= e($payTo ?: '—') ?></strong><?php if (!empty($fromGw['pay_to_name'])): ?><div class="small muted"><?= e($fromGw['pay_to_name']) ?></div><?php endif; ?></div>
              <?php if ($payTo): ?><button type="button" class="btn btn-outline btn-sm copy-btn" data-copy="<?= e($payTo) ?>"><?= icon('copy', 15) ?></button><?php endif; ?>
            </div>
            <div class="pay-target">
              <div><small><?= e(t('amount')) ?></small><strong><?= e(money($order['send_amount'], $order['from_currency'], $fd)) ?></strong></div>
              <button type="button" class="btn btn-outline btn-sm copy-btn" data-copy="<?= e(number_format((float) $order['send_amount'], $fd, '.', '')) ?>"><?= icon('copy', 15) ?></button>
            </div>
          </div>
          <?php if ($ussd !== ''): ?>
          <div class="pay-target">
            <div><small><?= e(t('ussd_code')) ?></small><strong class="mono"><?= e($ussd) ?></strong></div>
            <div class="btn-group">
              <button type="button" class="btn btn-outline btn-sm copy-btn" data-copy="<?= e($ussd) ?>"><?= icon('copy', 15) ?></button>
              <a class="btn btn-primary btn-sm" href="tel:<?= e(str_replace('#', '%23', $ussd)) ?>"><?= icon('phone', 15) ?> <?= e(t('dial')) ?></a>
            </div>
          </div>
          <?php endif; ?>
          <?php if (!empty($fromGw['instructions'])): ?><p class="small muted"><?= icon('info', 13) ?> <?= e($fromGw['instructions']) ?></p><?php endif; ?>

          <?php if ($waafipayOn): ?>
          <form method="post" class="mt-3" data-paywait="<?= e(t('waafipay_waiting')) ?>">
            <?= csrf_field() ?>
            <input type="hidden" name="action" value="waafipay_purchase">
            <button class="btn btn-primary btn-lg btn-block" type="submit"><?= icon('bolt', 18) ?> <?= e(t('waafipay_pay_now', ['number' => $order['sender_account']])) ?></button>
            <p class="help text-center mt-2"><?= icon('info', 13) ?> <?= e(t('waafipay_help')) ?></p>
          </form>
          <?php endif; ?>
          <?php if ($sovamoneyOn): ?>
          <form method="post" class="mt-3" data-paywait="<?= e(t('sovamoney_waiting')) ?>">
            <?= csrf_field() ?>
            <input type="hidden" name="action" value="sovamoney_initiate">
            <div class="form-group">
              <label for="customer_email"><?= e(t('sovamoney_email_label')) ?></label>
              <input class="input" id="customer_email" type="email" name="customer_email" value="<?= e($me['email'] ?? '') ?>" placeholder="<?= e(t('sovamoney_email_ph')) ?>" required>
            </div>
            <button class="btn btn-primary btn-lg btn-block" type="submit"><?= icon('bolt', 18) ?> <?= e(t('sovamoney_pay_now')) ?></button>
            <p class="help text-center mt-2"><?= icon('info', 13) ?> <?= e(t('sovamoney_help')) ?></p>
          </form>
          <?php endif; ?>
          <?php if ($nebdexMethods !== []): ?>
          <form method="post" class="mt-3" data-paywait="<?= e(t('nebdex_waiting')) ?>">
            <?= csrf_field() ?>
            <input type="hidden" name="action" value="nebdex_initiate">
            <div class="form-group">
              <label for="nebdex_email"><?= e(t('nebdex_email_label')) ?></label>
              <input class="input" id="nebdex_email" type="email" name="customer_email" value="<?= e($me['email'] ?? '') ?>" placeholder="<?= e(t('sovamoney_email_ph')) ?>" required>
            </div>
            <?php foreach ($nebdexMethods as $m): ?>
            <button class="btn btn-primary btn-lg btn-block mb-2" type="submit" name="method_id" value="<?= (int) $m['id'] ?>"><?= icon('bolt', 18) ?> <?= e(t('nebdex_pay_now', ['gw' => $order['from_name'], 'label' => $m['label']])) ?></button>
            <?php endforeach; ?>
            <p class="help text-center mt-2"><?= icon('info', 13) ?> <?= e(t('nebdex_help')) ?></p>
          </form>
          <?php endif; ?>
          <?php if (!$realtimePayOn): ?>
          <div class="alert alert-info mt-3"><?= icon('info') ?><span><?= e(t('no_payment_method')) ?></span></div>
          <?php endif; ?>
          <form method="post" class="text-center mt-2" data-confirm="<?= e(t('confirm_cancel')) ?>">
            <?= csrf_field() ?>
            <input type="hidden" name="action" value="cancel">
            <button class="btn btn-ghost btn-sm" type="submit"><?= icon('x', 15) ?> <?= e(t('cancel_order')) ?></button>
          </form>
        </div>
        <?php elseif (in_array($order['status'], ['pending', 'processing'], true)): ?>
          <div class="alert alert-info"><?= icon('clock') ?><span><?= e(t('msg_' . $order['status'])) ?></span></div>
        <?php elseif ($order['status'] === 'completed'): ?>
          <div class="alert alert-success"><?= icon('check-circle') ?><span><?= e(t('msg_completed')) ?></span></div>
        <?php else: ?>
          <div class="alert alert-error"><?= icon('x-circle') ?><span><?= e(t('msg_closed')) ?></span></div>
        <?php endif; ?>

        <div class="card">
          <div class="card-head"><h3><?= icon('file', 18) ?> <?= e(t('details')) ?></h3></div>
          <div class="card-body">
            <dl class="kv">
              <div><dt><?= e(t('date')) ?></dt><dd><?= e(fmt_date($order['created_at'])) ?></dd></div>
              <div><dt><?= e(t('you_send')) ?></dt><dd><?= e(money($order['send_amount'], $order['from_currency'], $fd)) ?></dd></div>
              <div><dt><?= e(t('fee')) ?></dt><dd><?= e(money($order['fee_amount'], $order['from_currency'], $fd)) ?></dd></div>
              <div><dt><?= e(t('rate')) ?></dt><dd>1 <?= e($order['from_currency']) ?> = <?= e(fmt_amount($order['rate'], 4)) ?> <?= e($order['to_currency']) ?></dd></div>
              <div><dt><?= e(t('you_receive')) ?></dt><dd class="big"><?= e(money($order['receive_amount'], $order['to_currency'], $td)) ?></dd></div>
              <div><dt><?= e(t('sender_account', ['gw' => $order['from_name']])) ?></dt><dd class="mono"><?= e($order['sender_account']) ?></dd></div>
              <div><dt><?= e($order['receiver_label'] ?: t('receiver_account')) ?></dt><dd class="mono"><?= e($order['receiver_account']) ?></dd></div>
              <?php if ($order['payment_ref']): ?><div><dt><?= e(t('payment_ref')) ?></dt><dd class="mono"><?= e($order['payment_ref']) ?></dd></div><?php endif; ?>
              <?php if ($order['payout_ref']): ?><div><dt><?= e(t('payout_ref')) ?></dt><dd class="mono"><?= e($order['payout_ref']) ?></dd></div><?php endif; ?>
              <?php if ($order['completed_at']): ?><div><dt><?= e(t('completed_at')) ?></dt><dd><?= e(fmt_date($order['completed_at'])) ?></dd></div><?php endif; ?>
              <?php if ($order['customer_note']): ?><div><dt><?= e(t('note')) ?></dt><dd><?= e($order['customer_note']) ?></dd></div><?php endif; ?>
            </dl>
          </div>
        </div>
      </div>

      <aside class="card">
        <div class="card-head"><h3><?= icon('clock', 18) ?> <?= e(t('history')) ?></h3></div>
        <div class="card-body">
          <ul class="timeline">
            <?php foreach ($logs as $log): ?>
            <li>
              <div><?= status_badge($log['status']) ?></div>
              <div class="tl-time"><?= e(fmt_date($log['created_at'])) ?></div>
              <?php if ($log['note']): ?><div class="tl-note"><?= e($log['note']) ?></div><?php endif; ?>
            </li>
            <?php endforeach; ?>
          </ul>
        </div>
      </aside>
    </div>
  </div>
</div>
<?php require APP_PATH . '/views/footer.php'; ?>
