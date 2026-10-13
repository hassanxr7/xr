<?php
require __DIR__ . '/app/bootstrap.php';

if (user()) {
    redirect('account.php');
}

$phone = '';
if (is_post()) {
    csrf_check();
    $phone = normalize_phone(input('phone'));
    $password = (string) ($_POST['password'] ?? '');

    if (throttle_blocked('user', $phone)) {
        flash('error', t('too_many_attempts'));
    } else {
        $u = $phone !== '' ? row('SELECT * FROM users WHERE phone = ?', [$phone]) : null;
        if ($u && password_verify($password, $u['password_hash'])) {
            if ($u['status'] !== 'active') {
                flash('error', t('account_blocked'));
            } else {
                throttle_clear('user', $phone);
                if (password_needs_rehash($u['password_hash'], PASSWORD_DEFAULT)) {
                    update('users', ['password_hash' => password_hash($password, PASSWORD_DEFAULT)], 'id = ?', [$u['id']]);
                }
                login_user($u);
                flash('success', t('welcome_back', ['name' => $u['name']]));
                redirect(safe_next($_GET['next'] ?? '', 'account.php'));
            }
        } else {
            throttle_hit('user', $phone);
            flash('error', t('login_failed'));
        }
    }
}

$pageTitle = t('login');
require APP_PATH . '/views/header.php';
?>
<div class="auth-wrap">
  <div class="card auth-card">
    <h1><?= e(t('login_title')) ?></h1>
    <p class="sub"><?= e(t('login_sub')) ?></p>
    <form method="post" novalidate>
      <?= csrf_field() ?>
      <div class="form-group">
        <label for="phone"><?= e(t('phone')) ?></label>
        <input class="input" id="phone" name="phone" type="tel" inputmode="tel" placeholder="61xxxxxxx" value="<?= e($phone) ?>" required autofocus>
      </div>
      <div class="form-group">
        <label for="password"><?= e(t('password')) ?></label>
        <input class="input" id="password" name="password" type="password" required autocomplete="current-password">
      </div>
      <button class="btn btn-primary btn-lg btn-block" type="submit"><?= icon('lock', 18) ?> <?= e(t('login')) ?></button>
    </form>
    <p class="auth-foot"><?= e(t('no_account')) ?> <a href="<?= e(url('register.php' . (isset($_GET['next']) ? '?next=' . urlencode((string) $_GET['next']) : ''))) ?>"><?= e(t('register')) ?></a></p>
    <?php if ($wa = whatsapp_link(t('wa_forgot'))): ?>
    <p class="auth-foot small"><a href="<?= e($wa) ?>" target="_blank" rel="noopener"><?= e(t('forgot_password')) ?></a></p>
    <?php endif; ?>
  </div>
</div>
<?php require APP_PATH . '/views/footer.php'; ?>
