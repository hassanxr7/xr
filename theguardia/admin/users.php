<?php
require __DIR__ . '/_init.php';

$me = require_role('admin');

if (is_post()) {
    csrf_check();
    $id = (int) input('id');
    $email = strtolower(trim((string) input('email')));
    $name = trim((string) input('name'));
    $role = array_key_exists((string) input('role'), ROLES) ? (string) input('role') : 'writer';
    $pass = (string) ($_POST['password'] ?? '');
    if (input('do') === 'toggle' && $id && $id !== (int) $me['id']) {
        q("UPDATE users SET status = CASE status WHEN 'active' THEN 'blocked' ELSE 'active' END WHERE id = ?", [$id]);
        flash('success', __('Account updated.'));
        redirect('admin/users.php');
    }
    if ($name === '' || !filter_var($email, FILTER_VALIDATE_EMAIL) || (!$id && strlen($pass) < 10) || ($pass !== '' && strlen($pass) < 10)) {
        flash('error', __('Enter a name, a valid email and a password of at least 10 characters.'));
        redirect('admin/users.php' . ($id ? '?edit=' . $id : ''));
    }
    if (val('SELECT id FROM users WHERE email = ? AND id <> ?', [$email, $id])) {
        flash('error', __('Another account already uses this email.'));
        redirect('admin/users.php');
    }
    $data = ['name' => $name, 'email' => $email, 'role' => $id === (int) $me['id'] ? 'admin' : $role, 'title' => trim((string) input('title')) ?: null, 'bio' => trim((string) input('bio')) ?: null];
    if ($pass !== '') {
        $data['password_hash'] = password_hash($pass, PASSWORD_DEFAULT);
    }
    if ($id) {
        update('users', $data, 'id = ?', [$id]);
    } else {
        insert('users', $data + ['slug' => unique_slug('users', slugify($name, 60) ?: 'author'), 'created_at' => now()]);
    }
    audit('save user', $email);
    flash('success', __('Account saved.'));
    redirect('admin/users.php');
}

$list = rows("SELECT u.*, (SELECT COUNT(*) FROM articles a WHERE a.author_id = u.id AND a.status = 'published') n FROM users u ORDER BY u.role DESC, u.name");
$edit = (int) input('edit') ? row('SELECT * FROM users WHERE id = ?', [(int) input('edit')]) : null;
$roles = ['writer' => __('Writer — writes drafts, sends them for review'), 'editor' => __('Editor — publishes, manages sections, imports, alerts'), 'admin' => __('Admin — everything, including ads, settings and team')];
admin_header(__('Team'));
?>
<div class="page-head"><h1><?= __('Team') ?></h1></div>
<div class="grid-2">
  <section class="card"><table class="list"><thead><tr><th><?= __('Name') ?></th><th><?= __('Role') ?></th><th class="num"><?= __('Stories') ?></th><th></th></tr></thead><tbody>
  <?php foreach ($list as $u): $agent = str_ends_with($u['email'], '@agents.invalid'); ?>
    <tr><td><a class="strong" href="?edit=<?= (int) $u['id'] ?>"><?= e($u['name']) ?></a><?= $agent ? ' <span class="ai-badge">AI</span>' : '' ?><div class="muted small"><?= e($agent ? $u['title'] : $u['email']) ?><?= $u['last_login'] ? ' · ' . e(time_ago($u['last_login'])) : '' ?></div></td>
      <td><?= e($u['role']) ?><?= $u['status'] !== 'active' ? ' <span class="st st-draft">' . __('blocked') . '</span>' : '' ?></td><td class="num"><?= fmt_num($u['n']) ?></td>
      <td><?php if ((int) $u['id'] !== (int) $me['id'] && !$agent): ?><form method="post" class="inline"><?= csrf_field() ?><input type="hidden" name="id" value="<?= (int) $u['id'] ?>"><button class="a-btn a-btn-sm" name="do" value="toggle"><?= $u['status'] === 'active' ? __('Block') : __('Unblock') ?></button></form><?php endif; ?></td></tr>
  <?php endforeach; ?>
  </tbody></table></section>
  <form method="post" class="card a-form" autocomplete="off">
    <?= csrf_field() ?><input type="hidden" name="id" value="<?= (int) ($edit['id'] ?? 0) ?>">
    <h2><?= $edit ? __('Edit account') : __('Add a team member') ?></h2>
    <?= field('name', __('Name (shown as author)'), $edit['name'] ?? '', 'text', ['required' => true]) ?>
    <?= field('email', __('Email (sign-in)'), $edit['email'] ?? '', 'email', ['required' => true]) ?>
    <?= field('password', $edit ? __('New password (leave empty to keep)') : __('Password (10+ characters)'), '', 'password', ['autocomplete' => 'new-password']) ?>
    <?= select_field('role', __('Role'), $roles, $edit['role'] ?? 'writer') ?>
    <?= field('title', __('Job title (shown on stories)'), $edit['title'] ?? '', 'text', ['placeholder' => __('e.g. Court reporter')]) ?>
    <?= field('bio', __('Short bio (author page — good for Google trust)'), $edit['bio'] ?? '', 'textarea', ['rows' => 3]) ?>
    <button class="a-btn a-btn-primary"><?= __('Save') ?></button>
    <?php if ($edit): ?><a class="a-btn" href="?"><?= __('Cancel') ?></a><?php endif; ?>
  </form>
</div>
<?php admin_footer(); ?>
