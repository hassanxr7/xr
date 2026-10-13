<?php
require dirname(__DIR__) . '/app/bootstrap.php';

$me = require_admin();

if (is_post()) {
    csrf_check();
    $name = mb_substr(input('name'), 0, 100);
    $email = mb_substr(input('email'), 0, 150);
    $current = (string) ($_POST['current_password'] ?? '');
    $new = (string) ($_POST['new_password'] ?? '');

    if ($name === '') {
        flash('error', t('err_name'));
    } else {
        update('admins', ['name' => $name, 'email' => $email ?: null], 'id = ?', [$me['id']]);
        if ($new !== '') {
            if (!password_verify($current, $me['password_hash'])) {
                flash('error', t('err_current_password'));
                redirect('admin/profile.php');
            }
            if (strlen($new) < 8) {
                flash('error', t('a_err_admin_password'));
                redirect('admin/profile.php');
            }
            update('admins', ['password_hash' => password_hash($new, PASSWORD_DEFAULT)], 'id = ?', [$me['id']]);
            session_regenerate_id(true);
            flash('success', t('password_changed'));
        } else {
            flash('success', t('saved'));
        }
    }
    redirect('admin/profile.php');
}

$pageTitle = t('profile');
require APP_PATH . '/views/admin_header.php';
?>
<form method="post" class="card medium" style="margin:0">
  <?= csrf_field() ?>
  <div class="card-body">
    <div class="form-row">
      <div class="form-group"><label><?= e(t('full_name')) ?></label><input class="input" name="name" value="<?= e($me['name']) ?>" required></div>
      <div class="form-group"><label><?= e(t('username')) ?></label><input class="input" value="<?= e($me['username']) ?>" readonly></div>
    </div>
    <div class="form-group"><label><?= e(t('email')) ?></label><input class="input" type="email" name="email" value="<?= e($me['email']) ?>"></div>
    <h4 class="mt-3"><?= e(t('change_password')) ?></h4>
    <div class="form-row">
      <div class="form-group"><label><?= e(t('current_password')) ?></label><input class="input" type="password" name="current_password" autocomplete="current-password"></div>
      <div class="form-group"><label><?= e(t('new_password')) ?></label><input class="input" type="password" name="new_password" minlength="8" autocomplete="new-password"><div class="help"><?= e(t('a_password_blank')) ?></div></div>
    </div>
    <button class="btn btn-primary" type="submit"><?= e(t('save')) ?></button>
  </div>
</form>
<?php require APP_PATH . '/views/admin_footer.php'; ?>
