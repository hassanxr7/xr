<?php
require __DIR__ . '/_init.php';

$u = require_role('writer');

if (is_post()) {
    csrf_check();
    $data = ['name' => trim((string) input('name')) ?: $u['name'], 'title' => trim((string) input('title')) ?: null, 'bio' => trim((string) input('bio')) ?: null];
    $new = (string) ($_POST['new_password'] ?? '');
    if ($new !== '') {
        if (!password_verify((string) ($_POST['current_password'] ?? ''), $u['password_hash'])) {
            flash('error', __('Your current password is wrong.'));
            redirect('admin/profile.php');
        }
        if (strlen($new) < 10) {
            flash('error', __('The new password must be at least 10 characters.'));
            redirect('admin/profile.php');
        }
        $data['password_hash'] = password_hash($new, PASSWORD_DEFAULT);
    }
    update('users', $data, 'id = ?', [$u['id']]);
    $_SESSION['admin_lang'] = input('lang') === 'so' ? 'so' : 'en';
    flash('success', __('Profile saved.'));
    redirect('admin/profile.php');
}
admin_header(__('My profile'));
?>
<div class="page-head"><h1><?= __('My profile') ?></h1><a class="a-btn" href="<?= e(author_url($u)) ?>" target="_blank" rel="noopener"><?= __('Author page') ?> ↗</a></div>
<form method="post" class="card a-form narrow" autocomplete="off">
  <?= csrf_field() ?>
  <?= field('name', __('Name'), $u['name'], 'text', ['required' => true]) ?>
  <?= field('title', __('Job title'), $u['title'] ?? '') ?>
  <?= field('bio', __('Short bio'), $u['bio'] ?? '', 'textarea', ['rows' => 4]) ?>
  <?= select_field('lang', __('Dashboard language'), ['en' => 'English', 'so' => 'Soomaali'], admin_lang()) ?>
  <h3><?= __('Change password') ?></h3>
  <?= field('current_password', __('Current password'), '', 'password', ['autocomplete' => 'current-password']) ?>
  <?= field('new_password', __('New password'), '', 'password', ['autocomplete' => 'new-password']) ?>
  <button class="a-btn a-btn-primary"><?= __('Save') ?></button>
</form>
<?php admin_footer(); ?>
