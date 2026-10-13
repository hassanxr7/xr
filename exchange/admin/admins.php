<?php
require dirname(__DIR__) . '/app/bootstrap.php';

$me = require_admin();

if (is_post()) {
    csrf_check();
    $action = input('action');
    if ($action === 'add') {
        $name = mb_substr(input('name'), 0, 100);
        $username = strtolower(preg_replace('/[^a-z0-9_.]/i', '', input('username')));
        $password = (string) ($_POST['password'] ?? '');
        if ($name === '' || strlen($username) < 3) {
            flash('error', t('a_err_required'));
        } elseif (strlen($password) < 8) {
            flash('error', t('a_err_admin_password'));
        } elseif (val('SELECT 1 FROM admins WHERE username = ?', [$username])) {
            flash('error', t('a_err_username_taken'));
        } else {
            insert('admins', [
                'name' => $name, 'username' => $username, 'email' => mb_substr(input('email'), 0, 150) ?: null,
                'password_hash' => password_hash($password, PASSWORD_DEFAULT), 'is_active' => 1, 'created_at' => now(),
            ]);
            flash('success', t('saved'));
        }
    } elseif ($action === 'toggle') {
        $id = (int) input('id');
        if ($id === (int) $me['id']) {
            flash('error', t('a_err_self'));
        } else {
            q('UPDATE admins SET is_active = 1 - is_active WHERE id = ?', [$id]);
            flash('success', t('saved'));
        }
    }
    redirect('admin/admins.php');
}

$admins = rows('SELECT * FROM admins ORDER BY id');
$pageTitle = t('a_admins');
require APP_PATH . '/views/admin_header.php';
?>
<div class="grid grid-main">
  <div class="card">
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th><?= e(t('full_name')) ?></th><th><?= e(t('username')) ?></th><th><?= e(t('email')) ?></th><th><?= e(t('a_last_login')) ?></th><th><?= e(t('status')) ?></th><th></th></tr></thead>
        <tbody>
        <?php foreach ($admins as $a): ?>
          <tr>
            <td><strong><?= e($a['name']) ?></strong><?= (int) $a['id'] === (int) $me['id'] ? ' <span class="small muted">(' . e(t('a_you')) . ')</span>' : '' ?></td>
            <td class="mono"><?= e($a['username']) ?></td>
            <td class="small"><?= e($a['email'] ?: '—') ?></td>
            <td class="small nowrap"><?= e(fmt_date($a['last_login_at'])) ?></td>
            <td><span class="badge badge-<?= $a['is_active'] ? 'active' : 'inactive' ?>"><?= e($a['is_active'] ? t('active') : t('inactive')) ?></span></td>
            <td class="actions">
              <?php if ((int) $a['id'] !== (int) $me['id']): ?>
              <form method="post" class="inline" data-confirm="<?= e(t('a_confirm_toggle_user')) ?>"><?= csrf_field() ?><input type="hidden" name="action" value="toggle"><input type="hidden" name="id" value="<?= (int) $a['id'] ?>"><button class="btn btn-outline btn-sm" type="submit"><?= $a['is_active'] ? icon('lock', 14) : icon('check', 14) ?></button></form>
              <?php endif; ?>
            </td>
          </tr>
        <?php endforeach; ?>
        </tbody>
      </table>
    </div>
  </div>
  <form method="post" class="card">
    <?= csrf_field() ?><input type="hidden" name="action" value="add">
    <div class="card-head"><h3><?= icon('plus', 18) ?> <?= e(t('a_add_admin')) ?></h3></div>
    <div class="card-body">
      <div class="form-group"><label><?= e(t('full_name')) ?></label><input class="input" name="name" required></div>
      <div class="form-group"><label><?= e(t('username')) ?></label><input class="input" name="username" required autocomplete="off"></div>
      <div class="form-group"><label><?= e(t('email')) ?></label><input class="input" type="email" name="email"></div>
      <div class="form-group"><label><?= e(t('password')) ?></label><input class="input" type="password" name="password" required minlength="8" autocomplete="new-password"></div>
      <button class="btn btn-primary" type="submit"><?= e(t('a_add_admin')) ?></button>
    </div>
  </form>
</div>
<?php require APP_PATH . '/views/admin_footer.php'; ?>
