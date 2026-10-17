<?php
require __DIR__ . '/app/bootstrap.php';

$pairId = (int) ($_GET['pair'] ?? $_POST['pair'] ?? 0);
$pair = $pairId ? find_pair($pairId) : null;
if (!$pair) {
    flash('error', t('pair_unavailable'));
    redirect('');
}
$me = require_user();

$fromDec = (int) $pair['from_decimals'];
$toDec = (int) $pair['to_decimals'];
$amountRaw = str_replace(',', '', (string) ($_POST['amount'] ?? $_GET['amount'] ?? ''));
$amount = is_numeric($amountRaw) ? (float) $amountRaw : (float) $pair['min_amount'];

$old = [
    // Pre-fill the customer's phone when the paying method is a mobile-money number (e.g. EVC Plus).
    'sender_account'   => matches_pattern($pair['from_account_pattern'], $me['phone']) ? $me['phone'] : '',
    'receiver_account' => '',
    'receiver_confirm' => '',
    'customer_note'    => '',
];
$errors = [];

if (is_post()) {
    csrf_check();
    $old = [
        'sender_account'   => mb_substr(input('sender_account'), 0, 190),
        'receiver_account' => mb_substr(input('receiver_account'), 0, 190),
        'receiver_confirm' => mb_substr(input('receiver_confirm'), 0, 190),
        'customer_note'    => mb_substr(input('customer_note'), 0, 500),
    ];
    if (preg_match('/^[0-9+\s\-()]+$/', $old['sender_account'])) {
        $old['sender_account'] = normalize_phone($old['sender_account']);
    }
    $q = quote($pair, $amount);

    if (!is_numeric($amountRaw) || $q['send'] <= 0) {
        $errors[] = t('js_invalid');
    } elseif ($q['send'] < (float) $pair['min_amount']) {
        $errors[] = t('err_min', ['amount' => money($pair['min_amount'], $pair['from_currency'], $fromDec)]);
    } elseif ($q['send'] > (float) $pair['max_amount']) {
        $errors[] = t('err_max', ['amount' => money($pair['max_amount'], $pair['from_currency'], $fromDec)]);
    } elseif ($q['receive'] <= 0) {
        $errors[] = t('js_invalid');
    } elseif ($q['receive'] > (float) $pair['to_reserve']) {
        $errors[] = t('err_reserve', ['amount' => money($pair['to_reserve'], $pair['to_currency'], $toDec)]);
    }
    if ($old['sender_account'] === '' || !matches_pattern($pair['from_account_pattern'], $old['sender_account'])) {
        $errors[] = t('err_sender', ['gw' => $pair['from_name']]);
    }
    if ($old['receiver_account'] === '') {
        $errors[] = t('err_receiver_required', ['label' => $pair['to_account_label']]);
    } elseif (!matches_pattern($pair['to_account_pattern'], $old['receiver_account'])) {
        $errors[] = t('err_receiver_format', ['label' => $pair['to_account_label']]);
    } elseif ($old['receiver_account'] !== $old['receiver_confirm']) {
        $errors[] = t('err_receiver_match');
    }
    if (empty($_POST['agree'])) {
        $errors[] = t('err_terms');
    }
    $openOrders = (int) val("SELECT COUNT(*) FROM orders WHERE user_id = ? AND status = 'awaiting_payment'", [$me['id']]);
    if ($openOrders >= 3) {
        $errors[] = t('err_too_many_open');
    }

    $receiverLabel = $pair['to_account_label'];
    if (!$errors && $pair['to_code'] === 'sovamoney' && sovamoney_payout_enabled()) {
        $check = sovamoney_verify_uid($old['receiver_account']);
        if ($check['ok']) {
            $old['receiver_account'] = mb_substr($check['uid'], 0, 190);
            if ($check['name'] !== '') {
                $receiverLabel = mb_substr($pair['to_account_label'] . ' — ' . $check['name'], 0, 120);
            }
        } else {
            $errors[] = t($check['reached'] ? 'sova_uid_not_found' : 'sova_uid_unreachable');
        }
    }

    if (!$errors) {
        $orderNo = generate_order_no();
        $id = insert('orders', [
            'order_no'         => $orderNo,
            'user_id'          => $me['id'],
            'pair_id'          => $pair['id'],
            'from_gateway_id'  => $pair['from_gateway_id'],
            'to_gateway_id'    => $pair['to_gateway_id'],
            'from_name'        => $pair['from_name'],
            'from_currency'    => $pair['from_currency'],
            'from_decimals'    => $fromDec,
            'to_name'          => $pair['to_name'],
            'to_currency'      => $pair['to_currency'],
            'to_decimals'      => $toDec,
            'send_amount'      => $q['send'],
            'fee_amount'       => $q['fee'],
            'rate'             => $pair['rate'],
            'receive_amount'   => $q['receive'],
            'sender_account'   => $old['sender_account'],
            'receiver_account' => $old['receiver_account'],
            'receiver_label'   => $receiverLabel,
            'pay_to'           => $pair['from_pay_to'],
            'customer_note'    => $old['customer_note'] !== '' ? $old['customer_note'] : null,
            'status'           => 'awaiting_payment',
            'ip'               => client_ip(),
            'created_at'       => now(),
            'updated_at'       => now(),
        ]);
        order_log($id, 'awaiting_payment', null, 'customer', (int) $me['id']);
        telegram_notify(order_telegram_text(row('SELECT * FROM orders WHERE id = ?', [$id]), '🆕 New order'));
        flash('success', t('order_created'));
        redirect('order.php?no=' . urlencode($orderNo));
    }
}

$q = quote($pair, $amount);
$pageTitle = t('new_exchange');
$robotsMeta = 'noindex, follow';
require APP_PATH . '/views/header.php';
?>
<div class="page">
  <div class="container">
    <div class="page-head">
      <div>
        <h1><?= e(t('new_exchange')) ?></h1>
        <p><?= e($pair['from_name']) ?> → <?= e($pair['to_name']) ?></p>
      </div>
      <a class="btn btn-outline btn-sm" href="<?= e(url('')) ?>#exchange"><?= icon('arrow-left', 16) ?> <?= e(t('change_pair')) ?></a>
    </div>

    <?php foreach ($errors as $err): ?>
      <div class="alert alert-error"><?= icon('alert') ?><span><?= e($err) ?></span></div>
    <?php endforeach; ?>

    <form method="post" class="grid grid-main" data-calc novalidate>
      <?= csrf_field() ?>
      <input type="hidden" name="pair" value="<?= (int) $pair['id'] ?>">

      <div class="card">
        <div class="card-head"><h2><?= icon('wallet', 18) ?> <?= e(t('exchange_details')) ?></h2></div>
        <div class="card-body">
          <div class="calc-box">
            <label class="calc-label" for="amount"><?= e(t('you_send')) ?></label>
            <div class="calc-row">
              <input class="calc-amount" id="amount" type="text" inputmode="decimal" name="amount" data-send value="<?= e(number_format($q['send'], $fromDec, '.', '')) ?>" autocomplete="off">
              <div class="gw-select"><?= gw_badge($pair['from_name'], $pair['from_color'], $pair['from_logo'], 'sm') ?><strong class="small"><?= e($pair['from_name']) ?></strong>&nbsp;</div>
            </div>
          </div>
          <div class="calc-mid"><span class="swap-btn" aria-hidden="true" style="cursor:default"><?= icon('arrow-right', 18) ?></span><span class="calc-rate" data-rate-line></span></div>
          <div class="calc-box">
            <label class="calc-label" for="receive"><?= e(t('you_receive')) ?></label>
            <div class="calc-row">
              <input class="calc-amount" id="receive" type="text" inputmode="decimal" data-receive autocomplete="off">
              <div class="gw-select"><?= gw_badge($pair['to_name'], $pair['to_color'], $pair['to_logo'], 'sm') ?><strong class="small"><?= e($pair['to_name']) ?></strong>&nbsp;</div>
            </div>
          </div>
          <div class="calc-error mt-2" data-error hidden></div>

          <div class="form-row mt-3">
            <div class="form-group">
              <label for="sender_account"><?= e(t('sender_account', ['gw' => $pair['from_name']])) ?></label>
              <input class="input mono" id="sender_account" name="sender_account" value="<?= e($old['sender_account']) ?>" placeholder="<?= e($pair['from_account_placeholder']) ?>" required autocomplete="off" spellcheck="false">
              <div class="help"><?= e(t('sender_account_help')) ?></div>
            </div>
            <div class="form-group">
              <label><?= e(t('pay_with')) ?></label>
              <input class="input" value="<?= e($pair['from_name']) ?> (<?= e($pair['from_currency']) ?>)" readonly>
            </div>
          </div>

          <div class="form-group">
            <label for="receiver_account"><?= e($pair['to_account_label']) ?></label>
            <input class="input mono" id="receiver_account" name="receiver_account" value="<?= e($old['receiver_account']) ?>" placeholder="<?= e($pair['to_account_placeholder']) ?>" required autocomplete="off" spellcheck="false"<?php if ($pair['to_code'] === 'sovamoney' && sovamoney_payout_enabled()): ?> data-sova-verify="<?= e(url('sovamoney_verify.php')) ?>" data-sova-checking="<?= e(t('sova_uid_checking')) ?>"<?php endif; ?>>
            <?php if ($pair['to_instructions']): ?><div class="help"><?= icon('info', 13) ?> <?= e($pair['to_instructions']) ?></div><?php endif; ?>
            <div class="help" data-sova-result hidden aria-live="polite"></div>
          </div>
          <div class="form-group">
            <label for="receiver_confirm"><?= e(t('confirm_field', ['label' => $pair['to_account_label']])) ?></label>
            <input class="input mono" id="receiver_confirm" name="receiver_confirm" value="<?= e($old['receiver_confirm']) ?>" required autocomplete="off" spellcheck="false">
          </div>
          <div class="form-group">
            <label for="customer_note"><?= e(t('note')) ?> <span class="muted">(<?= e(t('optional')) ?>)</span></label>
            <textarea class="input" id="customer_note" name="customer_note" rows="2" maxlength="500"><?= e($old['customer_note']) ?></textarea>
          </div>
          <label class="check"><input type="checkbox" name="agree" value="1"> <span><?= e(t('agree_exchange')) ?> <a href="<?= e(url('terms.php')) ?>" target="_blank"><?= e(t('terms')) ?></a></span></label>
        </div>
      </div>

      <aside class="card">
        <div class="card-head"><h2><?= icon('file', 18) ?> <?= e(t('summary')) ?></h2></div>
        <div class="card-body">
          <dl class="kv">
            <div><dt><?= e(t('you_send')) ?></dt><dd data-total-send>—</dd></div>
            <div><dt><?= e(t('fee')) ?></dt><dd data-fee>—</dd></div>
            <div><dt><?= e(t('rate')) ?></dt><dd>1 <?= e($pair['from_currency']) ?> = <?= e(fmt_amount($pair['rate'], 4)) ?> <?= e($pair['to_currency']) ?></dd></div>
            <div><dt><?= e(t('limits')) ?></dt><dd data-limits>—</dd></div>
            <div><dt><?= e(t('you_receive')) ?></dt><dd class="big" data-total-receive>—</dd></div>
          </dl>
          <button type="submit" class="btn btn-primary btn-lg btn-block mt-2" data-submit><?= e(t('create_order')) ?> <?= icon('arrow-right', 18) ?></button>
          <p class="help text-center mt-2"><?= icon('clock', 13) ?> <?= e(t('pay_within', ['min' => (int) setting('order_expiry_minutes', '60')])) ?></p>
        </div>
      </aside>
    </form>
  </div>
</div>
<script type="application/json" id="hufan-data">{"pairs": <?= json_encode(pairs_for_js([$pair]), JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_UNICODE) ?>, "i18n": <?= json_encode(['min' => t('js_min'), 'max' => t('js_max'), 'reserve' => t('js_reserve'), 'invalid' => t('js_invalid')], JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_UNICODE) ?>}</script>
<?php require APP_PATH . '/views/footer.php'; ?>
