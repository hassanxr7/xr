<?php
require __DIR__ . '/app/bootstrap.php';

$me = require_user();

if (is_post()) {
    csrf_check();
    $action = input('action');

    if ($action === 'profile') {
        $name = mb_substr(input('name'), 0, 100);
        $email = mb_substr(input('email'), 0, 150);
        if (mb_strlen($name) < 3) {
            flash('error', t('err_name'));
        } elseif ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            flash('error', t('err_email'));
        } else {
            update('users', ['name' => $name, 'email' => $email !== '' ? $email : null], 'id = ?', [$me['id']]);
            flash('success', t('saved'));
        }
    } elseif ($action === 'password') {
        $current = (string) ($_POST['current_password'] ?? '');
        $new = (string) ($_POST['new_password'] ?? '');
        $confirm = (string) ($_POST['password_confirm'] ?? '');
        if (!password_verify($current, $me['password_hash'])) {
            flash('error', t('err_current_password'));
        } elseif (strlen($new) < 8) {
            flash('error', t('err_password_short'));
        } elseif ($new !== $confirm) {
            flash('error', t('err_password_match'));
        } else {
            update('users', ['password_hash' => password_hash($new, PASSWORD_DEFAULT)], 'id = ?', [$me['id']]);
            session_regenerate_id(true);
            flash('success', t('password_changed'));
        }
    }
    redirect('profile.php');
}

$pageTitle = t('profile');
$robotsMeta = 'noindex, follow';
require APP_PATH . '/views/header.php';
?>
<div class="page">
  <div class="container medium">
    <div class="page-head">
      <div><h1><?= e(t('profile')) ?></h1><p><?= e(t('member_since', ['date' => fmt_date($me['created_at'], false)])) ?></p></div>
      <a class="btn btn-outline btn-sm" href="<?= e(url('account.php')) ?>"><?= icon('arrow-left', 16) ?> <?= e(t('my_account')) ?></a>
    </div>
    <div class="grid grid-2">
      <form method="post" class="card">
        <?= csrf_field() ?>
        <input type="hidden" name="action" value="profile">
        <div class="card-head"><h3><?= icon('user', 18) ?> <?= e(t('personal_info')) ?></h3></div>
        <div class="card-body">
          <div class="form-group"><label for="name"><?= e(t('full_name')) ?></label><input class="input" id="name" name="name" value="<?= e($me['name']) ?>" required></div>
          <div class="form-group"><label><?= e(t('phone')) ?></label><input class="input" value="<?= e($me['phone']) ?>" readonly><div class="help"><?= e(t('phone_locked')) ?></div></div>
          <div class="form-group"><label for="email"><?= e(t('email')) ?></label><input class="input" id="email" name="email" type="email" value="<?= e($me['email']) ?>"></div>
          <button class="btn btn-primary" type="submit"><?= e(t('save')) ?></button>
        </div>
      </form>
      <form method="post" class="card">
        <?= csrf_field() ?>
        <input type="hidden" name="action" value="password">
        <div class="card-head"><h3><?= icon('lock', 18) ?> <?= e(t('change_password')) ?></h3></div>
        <div class="card-body">
          <div class="form-group"><label for="cp"><?= e(t('current_password')) ?></label><input class="input" id="cp" name="current_password" type="password" required autocomplete="current-password"></div>
          <div class="form-group"><label for="np"><?= e(t('new_password')) ?></label><input class="input" id="np" name="new_password" type="password" required autocomplete="new-password"></div>
          <div class="form-group"><label for="pc"><?= e(t('password_confirm')) ?></label><input class="input" id="pc" name="password_confirm" type="password" required autocomplete="new-password"></div>
          <button class="btn btn-primary" type="submit"><?= e(t('change_password')) ?></button>
        </div>
      </form>
    </div>
  </div>
</div>
<?php require APP_PATH . '/views/footer.php'; ?>
