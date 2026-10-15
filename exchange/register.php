<?php
require __DIR__ . '/app/bootstrap.php';

if (user()) {
    redirect('account.php');
}

$old = ['name' => '', 'phone' => '', 'email' => ''];
$errors = [];
if (is_post()) {
    csrf_check();
    $old = [
        'name'  => mb_substr(input('name'), 0, 100),
        'phone' => normalize_phone(input('phone')),
        'email' => mb_substr(input('email'), 0, 150),
    ];
    $password = (string) ($_POST['password'] ?? '');
    $confirm = (string) ($_POST['password_confirm'] ?? '');

    if (throttle_blocked('register', 'register', 5, 60, false)) {
        $errors[] = t('too_many_attempts');
    }
    if (mb_strlen($old['name']) < 3) {
        $errors[] = t('err_name');
    }
    if (!preg_match('/^\+?[0-9]{7,15}$/', $old['phone'])) {
        $errors[] = t('err_phone');
    } elseif (val('SELECT 1 FROM users WHERE phone = ?', [$old['phone']])) {
        $errors[] = t('err_phone_taken');
    }
    if ($old['email'] !== '' && !filter_var($old['email'], FILTER_VALIDATE_EMAIL)) {
        $errors[] = t('err_email');
    }
    if (strlen($password) < 8) {
        $errors[] = t('err_password_short');
    } elseif ($password !== $confirm) {
        $errors[] = t('err_password_match');
    }
    if (empty($_POST['agree'])) {
        $errors[] = t('err_terms');
    }

    if (!$errors) {
        $id = insert('users', [
            'name'          => $old['name'],
            'phone'         => $old['phone'],
            'email'         => $old['email'] !== '' ? $old['email'] : null,
            'password_hash' => password_hash($password, PASSWORD_DEFAULT),
            'status'        => 'active',
            'created_at'    => now(),
        ]);
        throttle_hit('register', 'register');
        login_user(row('SELECT * FROM users WHERE id = ?', [$id]));
        flash('success', t('register_success'));
        redirect(safe_next($_GET['next'] ?? '', 'account.php'));
    }
}

$pageTitle = t('register');
$robotsMeta = 'noindex, follow';
require APP_PATH . '/views/header.php';
?>
<div class="auth-wrap">
  <div class="card auth-card">
    <h1><?= e(t('register_title')) ?></h1>
    <p class="sub"><?= e(t('register_sub')) ?></p>
    <?php foreach ($errors as $err): ?>
      <div class="alert alert-error"><?= icon('alert') ?><span><?= e($err) ?></span></div>
    <?php endforeach; ?>
    <form method="post" novalidate>
      <?= csrf_field() ?>
      <div class="form-group">
        <label for="name"><?= e(t('full_name')) ?></label>
        <input class="input" id="name" name="name" value="<?= e($old['name']) ?>" required autocomplete="name">
      </div>
      <div class="form-group">
        <label for="phone"><?= e(t('phone')) ?></label>
        <input class="input" id="phone" name="phone" type="tel" inputmode="tel" placeholder="61xxxxxxx" value="<?= e($old['phone']) ?>" required>
        <div class="help"><?= e(t('phone_help')) ?></div>
      </div>
      <div class="form-group">
        <label for="email"><?= e(t('email')) ?> <span class="muted">(<?= e(t('optional')) ?>)</span></label>
        <input class="input" id="email" name="email" type="email" value="<?= e($old['email']) ?>" autocomplete="email">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="password"><?= e(t('password')) ?></label>
          <input class="input" id="password" name="password" type="password" required autocomplete="new-password">
        </div>
        <div class="form-group">
          <label for="password_confirm"><?= e(t('password_confirm')) ?></label>
          <input class="input" id="password_confirm" name="password_confirm" type="password" required autocomplete="new-password">
        </div>
      </div>
      <div class="form-group">
        <label class="check"><input type="checkbox" name="agree" value="1"> <span><?= e(t('agree_terms')) ?> <a href="<?= e(url('terms.php')) ?>" target="_blank"><?= e(t('terms')) ?></a></span></label>
      </div>
      <button class="btn btn-primary btn-lg btn-block" type="submit"><?= e(t('register')) ?></button>
    </form>
    <p class="auth-foot"><?= e(t('have_account')) ?> <a href="<?= e(url('login.php' . (isset($_GET['next']) ? '?next=' . urlencode((string) $_GET['next']) : ''))) ?>"><?= e(t('login')) ?></a></p>
  </div>
</div>
<?php require APP_PATH . '/views/footer.php'; ?>
