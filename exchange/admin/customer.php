<?php
require dirname(__DIR__) . '/app/bootstrap.php';

require_admin();

$u = row('SELECT * FROM users WHERE id = ?', [(int) ($_GET['id'] ?? 0)]);
if (!$u) {
    redirect('admin/customers.php');
}
$self = 'admin/customer.php?id=' . $u['id'];

if (is_post()) {
    csrf_check();
    $action = input('action');
    if ($action === 'toggle') {
        update('users', ['status' => $u['status'] === 'active' ? 'blocked' : 'active'], 'id = ?', [$u['id']]);
        flash('success', t('saved'));
    } elseif ($action === 'password') {
        $pw = (string) ($_POST['new_password'] ?? '');
        if (strlen($pw) < 8) {
            flash('error', t('err_password_short'));
        } else {
            update('users', ['password_hash' => password_hash($pw, PASSWORD_DEFAULT)], 'id = ?', [$u['id']]);
            flash('success', t('password_changed'));
        }
    } elseif ($action === 'profile') {
        $name = mb_substr(input('name'), 0, 100);
        $phone = normalize_phone(input('phone'));
        $email = mb_substr(input('email'), 0, 150);
        if (mb_strlen($name) < 3) {
            flash('error', t('err_name'));
        } elseif (!preg_match('/^\+?[0-9]{7,15}$/', $phone)) {
            flash('error', t('err_phone'));
        } elseif (val('SELECT 1 FROM users WHERE phone = ? AND id <> ?', [$phone, $u['id']])) {
            flash('error', t('err_phone_taken'));
        } elseif ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            flash('error', t('err_email'));
        } else {
            update('users', ['name' => $name, 'phone' => $phone, 'email' => $email ?: null], 'id = ?', [$u['id']]);
            flash('success', t('saved'));
        }
    }
    redirect($self);
}

$stats = row(
    "SELECT COUNT(*) AS total, SUM(status = 'completed') AS completed,
            COALESCE(SUM(CASE WHEN status = 'completed' THEN send_amount END), 0) AS volume,
            COALESCE(SUM(CASE WHEN status = 'completed' THEN fee_amount END), 0) AS fees
     FROM orders WHERE user_id = ?",
    [$u['id']]
);
$p = paginate((int) $stats['total'], 15);
$orders = rows("SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT {$p['per']} OFFSET {$p['offset']}", [$u['id']]);

$pageTitle = $u['name'];
require APP_PATH . '/views/admin_header.php';
?>
<div class="toolbar-row">
  <a class="btn btn-ghost btn-sm" href="<?= e(url('admin/customers.php')) ?>"><?= icon('arrow-left', 16) ?> <?= e(t('a_customers')) ?></a>
  <div class="btn-group">
    <a class="btn btn-primary btn-sm" target="_blank" href="<?= e(url('statement.php?user=' . $u['id'])) ?>"><?= icon('print', 16) ?> <?= e(t('a_print_statement')) ?></a>
    <form method="post" class="inline" data-confirm="<?= e(t('a_confirm_toggle_user')) ?>"><?= csrf_field() ?><input type="hidden" name="action" value="toggle">
      <button class="btn btn-sm <?= $u['status'] === 'active' ? 'btn-danger' : 'btn-success' ?>" type="submit"><?= $u['status'] === 'active' ? icon('lock', 15) . ' ' . e(t('a_block')) : icon('check', 15) . ' ' . e(t('a_unblock')) ?></button>
    </form>
  </div>
</div>

<div class="grid grid-4">
  <div class="card stat"><span class="stat-ic"><?= icon('list', 20) ?></span><div><span class="stat-label"><?= e(t('total_orders')) ?></span><span class="stat-value"><?= (int) $stats['total'] ?></span></div></div>
  <div class="card stat"><span class="stat-ic blue"><?= icon('check-circle', 20) ?></span><div><span class="stat-label"><?= e(t('st_completed')) ?></span><span class="stat-value"><?= (int) $stats['completed'] ?></span></div></div>
  <div class="card stat"><span class="stat-ic violet"><?= icon('wallet', 20) ?></span><div><span class="stat-label"><?= e(t('total_exchanged')) ?></span><span class="stat-value">$<?= e(fmt_amount($stats['volume'])) ?></span></div></div>
  <div class="card stat"><span class="stat-ic orange"><?= icon('chart', 20) ?></span><div><span class="stat-label"><?= e(t('total_fees')) ?></span><span class="stat-value">$<?= e(fmt_amount($stats['fees'])) ?></span></div></div>
</div>

<div class="grid grid-main section-gap">
  <div class="card">
    <div class="card-head"><h3><?= icon('list', 18) ?> <?= e(t('a_orders')) ?></h3></div>
    <?php if (!$orders): ?>
      <div class="empty"><?= icon('list', 30) ?><p><?= e(t('no_orders')) ?></p></div>
    <?php else: ?>
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th><?= e(t('order_no')) ?></th><th><?= e(t('exchange')) ?></th><th class="num"><?= e(t('sent')) ?></th><th class="num"><?= e(t('received')) ?></th><th><?= e(t('status')) ?></th><th><?= e(t('date')) ?></th></tr></thead>
        <tbody>
        <?php foreach ($orders as $o): ?>
          <tr>
            <td><a class="mono" href="<?= e(url('admin/order.php?id=' . $o['id'])) ?>"><strong><?= e($o['order_no']) ?></strong></a></td>
            <td class="nowrap"><?= e($o['from_name']) ?> → <?= e($o['to_name']) ?></td>
            <td class="num"><?= e(money($o['send_amount'], $o['from_currency'], (int) $o['from_decimals'])) ?></td>
            <td class="num"><strong><?= e(money($o['receive_amount'], $o['to_currency'], (int) $o['to_decimals'])) ?></strong></td>
            <td><?= status_badge($o['status']) ?></td>
            <td class="small nowrap"><?= e(fmt_date($o['created_at'])) ?></td>
          </tr>
        <?php endforeach; ?>
        </tbody>
      </table>
    </div>
    <?= pagination_links($p) ?>
    <?php endif; ?>
  </div>

  <div class="grid">
    <form method="post" class="card">
      <?= csrf_field() ?><input type="hidden" name="action" value="profile">
      <div class="card-head"><h3><?= icon('user', 18) ?> <?= e(t('personal_info')) ?></h3><span class="badge badge-<?= e($u['status']) ?>"><?= e(t('u_' . $u['status'])) ?></span></div>
      <div class="card-body">
        <div class="form-group"><label><?= e(t('full_name')) ?></label><input class="input" name="name" value="<?= e($u['name']) ?>"></div>
        <div class="form-group"><label><?= e(t('phone')) ?></label><input class="input" name="phone" value="<?= e($u['phone']) ?>"></div>
        <div class="form-group"><label><?= e(t('email')) ?></label><input class="input" name="email" type="email" value="<?= e($u['email']) ?>"></div>
        <p class="small muted">CUS-<?= str_pad((string) $u['id'], 6, '0', STR_PAD_LEFT) ?> · <?= e(t('a_joined')) ?> <?= e(fmt_date($u['created_at'])) ?> · <?= e(t('a_last_login')) ?> <?= e(fmt_date($u['last_login_at'])) ?></p>
        <button class="btn btn-primary btn-sm" type="submit"><?= e(t('save')) ?></button>
      </div>
    </form>
    <form method="post" class="card">
      <?= csrf_field() ?><input type="hidden" name="action" value="password">
      <div class="card-head"><h3><?= icon('lock', 18) ?> <?= e(t('a_reset_password')) ?></h3></div>
      <div class="card-body">
        <div class="form-group"><label><?= e(t('new_password')) ?></label><input class="input" name="new_password" type="text" autocomplete="off" minlength="8" required></div>
        <button class="btn btn-outline btn-sm" type="submit"><?= e(t('a_reset_password')) ?></button>
      </div>
    </form>
  </div>
</div>
<?php require APP_PATH . '/views/admin_footer.php'; ?>
