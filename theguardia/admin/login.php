<?php
require __DIR__ . '/_init.php';

if (user()) {
    redirect('admin/');
}
$error = '';
if (is_post()) {
    csrf_check();
    $email = strtolower(trim((string) input('email')));
    $pass = (string) ($_POST['password'] ?? '');
    if (!rate_limit('login', 8, 900)) {
        $error = __('Too many attempts. Wait 15 minutes and try again.');
    } else {
        $u = row("SELECT * FROM users WHERE email = ? AND status = 'active'", [$email]);
        if ($u && password_verify($pass, $u['password_hash'])) {
            session_regenerate_id(true);
            $_SESSION['uid'] = (int) $u['id'];
            update('users', ['last_login' => now()], 'id = ?', [$u['id']]);
            if (password_needs_rehash($u['password_hash'], PASSWORD_DEFAULT)) {
                update('users', ['password_hash' => password_hash($pass, PASSWORD_DEFAULT)], 'id = ?', [$u['id']]);
            }
            audit('login');
            $next = (string) input('next');
            // Only local paths (no "//host" or "/\host" tricks).
            redirect(preg_match('~^/(?![/\\\\])~', $next) ? $next : url('admin/'));
        }
        $error = __('Wrong email or password.');
    }
}
admin_header(__('Sign in'));
?>
<div class="a-login">
  <img src="<?= e(url('assets/img/logo.svg')) ?>" alt="<?= e(site_name()) ?>" width="240" height="83">
  <h1><?= __('Newsroom sign in') ?></h1>
  <?php if (isset($_GET['installed'])): ?><div class="a-flash a-flash-success"><?= __('Installation complete. Sign in with your admin account. Delete the install/ folder for security.') ?></div><?php endif; ?>
  <?php if ($error): ?><div class="a-flash a-flash-error"><?= e($error) ?></div><?php endif; ?>
  <form method="post" class="a-form">
    <?= csrf_field() ?>
    <input type="hidden" name="next" value="<?= e((string) input('next')) ?>">
    <?= field('email', __('Email'), (string) input('email'), 'email', ['required' => true, 'autocomplete' => 'username', 'autofocus' => true]) ?>
    <?= field('password', __('Password'), '', 'password', ['required' => true, 'autocomplete' => 'current-password']) ?>
    <button class="a-btn a-btn-primary a-btn-block" type="submit"><?= __('Sign in') ?></button>
  </form>
  <p class="hint"><a href="?lang=<?= admin_lang() === 'en' ? 'so' : 'en' ?>"><?= admin_lang() === 'en' ? 'Soomaali' : 'English' ?></a></p>
</div>
<?php admin_footer(); ?>
