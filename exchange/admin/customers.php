<?php
require dirname(__DIR__) . '/app/bootstrap.php';

require_admin();

$search = qs('q');
$status = qs('status');
$where = ['1=1'];
$params = [];
if ($search !== '') {
    $like = like_param($search);
    $where[] = "(u.name LIKE ? ESCAPE '!' OR u.phone LIKE ? ESCAPE '!' OR u.email LIKE ? ESCAPE '!')";
    array_push($params, $like, $like, $like);
}
if (in_array($status, ['active', 'blocked'], true)) {
    $where[] = 'u.status = ?';
    $params[] = $status;
}
$whereSql = implode(' AND ', $where);
$p = paginate((int) val("SELECT COUNT(*) FROM users u WHERE $whereSql", $params), 25);
$users = rows(
    "SELECT u.*,
        (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) AS orders_count,
        (SELECT COALESCE(SUM(send_amount), 0) FROM orders o WHERE o.user_id = u.id AND o.status = 'completed') AS volume
     FROM users u WHERE $whereSql ORDER BY u.id DESC LIMIT {$p['per']} OFFSET {$p['offset']}",
    $params
);

$pageTitle = t('a_customers');
require APP_PATH . '/views/admin_header.php';
?>
<div class="card">
  <form method="get" class="filters">
    <div class="form-group" style="flex:3"><label><?= e(t('search')) ?></label><input class="input" name="q" value="<?= e($search) ?>" placeholder="<?= e(t('a_customer_search_ph')) ?>"></div>
    <div class="form-group"><label><?= e(t('status')) ?></label>
      <select class="input" name="status"><option value=""><?= e(t('all')) ?></option><option value="active" <?= $status === 'active' ? 'selected' : '' ?>><?= e(t('u_active')) ?></option><option value="blocked" <?= $status === 'blocked' ? 'selected' : '' ?>><?= e(t('u_blocked')) ?></option></select>
    </div>
    <button class="btn btn-primary btn-sm" type="submit"><?= icon('search', 15) ?> <?= e(t('apply')) ?></button>
  </form>
  <?php if (!$users): ?>
    <div class="empty"><?= icon('users', 36) ?><p><?= e(t('a_no_customers')) ?></p></div>
  <?php else: ?>
  <div class="table-wrap">
    <table class="table">
      <thead><tr><th>ID</th><th><?= e(t('full_name')) ?></th><th><?= e(t('phone')) ?></th><th><?= e(t('email')) ?></th><th class="num"><?= e(t('total_orders')) ?></th><th class="num"><?= e(t('total_exchanged')) ?></th><th><?= e(t('status')) ?></th><th><?= e(t('a_joined')) ?></th><th></th></tr></thead>
      <tbody>
      <?php foreach ($users as $u): ?>
        <tr>
          <td class="mono small">CUS-<?= str_pad((string) $u['id'], 6, '0', STR_PAD_LEFT) ?></td>
          <td><a href="<?= e(url('admin/customer.php?id=' . $u['id'])) ?>"><strong><?= e($u['name']) ?></strong></a></td>
          <td><?= e($u['phone']) ?></td>
          <td class="small"><?= e($u['email'] ?: '—') ?></td>
          <td class="num"><?= (int) $u['orders_count'] ?></td>
          <td class="num">$<?= e(fmt_amount($u['volume'])) ?></td>
          <td><span class="badge badge-<?= e($u['status']) ?>"><?= e(t('u_' . $u['status'])) ?></span></td>
          <td class="small nowrap"><?= e(fmt_date($u['created_at'], false)) ?></td>
          <td class="actions">
            <a class="btn btn-outline btn-sm" target="_blank" href="<?= e(url('statement.php?user=' . $u['id'])) ?>" title="<?= e(t('nav_statement')) ?>"><?= icon('print', 15) ?></a>
            <a class="btn btn-outline btn-sm" href="<?= e(url('admin/customer.php?id=' . $u['id'])) ?>"><?= icon('eye', 15) ?></a>
          </td>
        </tr>
      <?php endforeach; ?>
      </tbody>
    </table>
  </div>
  <?= pagination_links($p) ?>
  <?php endif; ?>
</div>
<?php require APP_PATH . '/views/admin_footer.php'; ?>
