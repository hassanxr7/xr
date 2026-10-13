<?php
require dirname(__DIR__) . '/app/bootstrap.php';

if (admin()) {
    redirect('admin/');
}

$username = '';
if (is_post()) {
    csrf_check();
    $username = mb_substr(input('username'), 0, 50);
    $password = (string) ($_POST['password'] ?? '');
    if (throttle_blocked('admin', $username)) {
        flash('error', t('too_many_attempts'));
    } else {
        $a = row('SELECT * FROM admins WHERE username = ? AND is_active = 1', [$username]);
        if ($a && password_verify($password, $a['password_hash'])) {
            throttle_clear('admin', $username);
            login_admin($a);
            redirect(safe_next($_GET['next'] ?? '', 'admin/'));
        }
        throttle_hit('admin', $username);
        flash('error', t('login_failed'));
    }
}
?><!doctype html>
<html lang="<?= e(lang()) ?>">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Admin · <?= e(setting('site_name', 'XR Exchange')) ?></title>
<link rel="icon" href="<?= e(asset('img/favicon.svg')) ?>" type="image/svg+xml">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap">
<link rel="stylesheet" href="<?= e(asset('css/app.css')) ?>">
<link rel="stylesheet" href="<?= e(asset('css/admin.css')) ?>">
<style>:root{--brand:<?= e(brand_color()) ?>}</style>
</head>
<body>
<div class="login-wrap">
  <form method="post" class="card login-card">
    <?= csrf_field() ?>
    <div class="brand"><?= site_logo() ?></div>
    <h1 class="text-center" style="font-size:20px"><?= e(t('a_login_title')) ?></h1>
    <p class="text-center muted"><?= e(t('a_login_sub')) ?></p>
    <?= render_flashes() ?>
    <div class="form-group"><label for="username"><?= e(t('username')) ?></label><input class="input" id="username" name="username" value="<?= e($username) ?>" required autofocus autocomplete="username"></div>
    <div class="form-group"><label for="password"><?= e(t('password')) ?></label><input class="input" id="password" name="password" type="password" required autocomplete="current-password"></div>
    <button class="btn btn-primary btn-lg btn-block" type="submit"><?= icon('lock', 18) ?> <?= e(t('login')) ?></button>
    <p class="text-center small mt-2"><a href="<?= e(url('')) ?>"><?= icon('arrow-left', 14) ?> <?= e(t('a_view_site')) ?></a></p>
  </form>
</div>
</body>
</html>
