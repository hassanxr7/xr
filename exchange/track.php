<?php
require __DIR__ . '/app/bootstrap.php';

expire_orders();
$found = null;
$no = strtoupper(qs('no'));
$phone = normalize_phone(qs('phone'));

if ($no !== '' && $phone !== '') {
    if (throttle_blocked('track', 'track', 20, 10, false)) {
        flash('error', t('too_many_attempts'));
    } else {
        $found = row(
            'SELECT o.* FROM orders o JOIN users u ON u.id = o.user_id WHERE o.order_no = ? AND (u.phone = ? OR o.sender_account = ?)',
            [$no, $phone, $phone]
        );
        if (!$found) {
            throttle_hit('track', 'track');
            flash('error', t('order_not_found'));
        }
    }
}

$pageTitle = t('nav_track');
$robotsMeta = 'noindex, follow';
require APP_PATH . '/views/header.php';
?>
<div class="page">
  <div class="container medium">
    <div class="page-head"><div><h1><?= e(t('track_title')) ?></h1><p><?= e(t('track_sub')) ?></p></div></div>
    <form method="get" class="card card-body">
      <div class="form-row">
        <div class="form-group"><label for="no"><?= e(t('order_no')) ?></label><input class="input mono" id="no" name="no" value="<?= e($no) ?>" placeholder="HX261013ABCDE" required></div>
        <div class="form-group"><label for="phone"><?= e(t('phone')) ?></label><input class="input" id="phone" name="phone" type="tel" value="<?= e($phone) ?>" placeholder="61xxxxxxx" required></div>
      </div>
      <button class="btn btn-primary" type="submit"><?= icon('search', 17) ?> <?= e(t('track_btn')) ?></button>
    </form>

    <?php if ($found): ?>
    <div class="card mt-3">
      <div class="order-hero">
        <div class="order-no"><?= e(t('order_no')) ?><strong><?= e($found['order_no']) ?></strong></div>
        <?= status_badge($found['status']) ?>
      </div>
      <div class="card-body" style="border-top:1px solid var(--line)">
        <dl class="kv">
          <div><dt><?= e(t('date')) ?></dt><dd><?= e(fmt_date($found['created_at'])) ?></dd></div>
          <div><dt><?= e(t('exchange')) ?></dt><dd><?= e($found['from_name']) ?> → <?= e($found['to_name']) ?></dd></div>
          <div><dt><?= e(t('you_send')) ?></dt><dd><?= e(money($found['send_amount'], $found['from_currency'], (int) $found['from_decimals'])) ?></dd></div>
          <div><dt><?= e(t('you_receive')) ?></dt><dd class="big"><?= e(money($found['receive_amount'], $found['to_currency'], (int) $found['to_decimals'])) ?></dd></div>
          <?php if ($found['completed_at']): ?><div><dt><?= e(t('completed_at')) ?></dt><dd><?= e(fmt_date($found['completed_at'])) ?></dd></div><?php endif; ?>
        </dl>
        <?php if (user() && (int) user()['id'] === (int) $found['user_id']): ?>
          <a class="btn btn-outline btn-sm mt-2" href="<?= e(url('order.php?no=' . urlencode($found['order_no']))) ?>"><?= icon('eye', 15) ?> <?= e(t('view_order')) ?></a>
        <?php else: ?>
          <p class="help mt-2"><?= e(t('track_login_hint')) ?></p>
        <?php endif; ?>
      </div>
    </div>
    <?php endif; ?>
  </div>
</div>
<?php require APP_PATH . '/views/footer.php'; ?>
