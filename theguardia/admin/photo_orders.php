<?php
require __DIR__ . '/_init.php';

require_role('editor');

if (is_post()) {
    csrf_check();
    $id = (int) input('id');
    if (input('do') === 'paid') {
        order_mark_paid($id);
        flash('success', __('Order marked as paid. The buyer received the download link by email.'));
    } elseif (input('do') === 'cancel') {
        q("UPDATE photo_orders SET status = 'cancelled' WHERE id = ?", [$id]);
        flash('success', __('Order cancelled.'));
    } elseif (input('do') === 'resend') {
        q("UPDATE photo_orders SET status = 'pending', download_token = NULL WHERE id = ? AND status = 'paid'", [$id]);
        order_mark_paid($id);
        flash('success', __('A new download link was sent.'));
    }
    audit('photo order ' . input('do'), (string) $id);
    redirect('admin/photo_orders.php');
}

$status = (string) input('status');
$list = rows('SELECT o.*, p.title FROM photo_orders o JOIN photos p ON p.id = o.photo_id' . ($status !== '' ? ' WHERE o.status = ?' : '') . ' ORDER BY o.id DESC LIMIT 200', $status !== '' ? [$status] : []);
$revenue = rows("SELECT currency, SUM(amount) s, COUNT(*) n FROM photo_orders WHERE status = 'paid' GROUP BY currency");
admin_header(__('Photo orders'));
?>
<div class="page-head"><h1><?= __('Photo orders') ?></h1>
  <div><?php foreach ($revenue as $r): ?><span class="st st-published"><?= e(money((int) $r['s'], $r['currency'])) ?> · <?= fmt_num($r['n']) ?> <?= __('sales') ?></span> <?php endforeach; ?></div></div>
<nav class="tabs"><?php foreach (['' => __('All'), 'request' => __('Requests'), 'pending' => __('Waiting for payment'), 'paid' => __('Paid'), 'cancelled' => __('Cancelled')] as $k => $l): ?><a href="?status=<?= $k ?>"<?= $status === $k ? ' class="on"' : '' ?>><?= e($l) ?></a><?php endforeach; ?></nav>
<section class="card"><div class="table-wrap"><table class="list">
  <thead><tr><th><?= __('Order') ?></th><th><?= __('Buyer') ?></th><th><?= __('Licence') ?></th><th class="num"><?= __('Amount') ?></th><th><?= __('Status') ?></th><th></th></tr></thead><tbody>
  <?php foreach ($list as $o): ?>
    <tr><td><strong><?= e($o['ref']) ?></strong><div class="muted small"><?= e($o['title']) ?> · <?= e(fmt_date($o['created_at'], 'M j, H:i')) ?></div></td>
      <td><?= e($o['buyer_name']) ?><div class="muted small"><a href="mailto:<?= e($o['buyer_email']) ?>"><?= e($o['buyer_email']) ?></a> <?= e($o['buyer_org']) ?></div><?= $o['buyer_note'] ? '<div class="small">' . e(str_limit($o['buyer_note'], 120)) . '</div>' : '' ?></td>
      <td><?= e(LICENCES[$o['licence']][0] ?? $o['licence']) ?></td><td class="num"><?= e(money((int) $o['amount'], $o['currency'])) ?></td>
      <td><?= e($o['status']) ?><?= $o['status'] === 'paid' ? '<div class="muted small">' . (int) $o['downloads'] . ' ' . __('downloads') . '</div>' : '' ?></td>
      <td class="nowrap"><form method="post" class="inline"><?= csrf_field() ?><input type="hidden" name="id" value="<?= (int) $o['id'] ?>">
        <?php if (in_array($o['status'], ['request', 'pending'], true)): ?><button class="a-btn a-btn-sm js-confirm" name="do" value="paid" data-confirm="<?= e(__('Did you receive the payment? The buyer will get the download link.')) ?>"><?= __('Mark paid') ?></button>
          <button class="a-btn a-btn-sm" name="do" value="cancel"><?= __('Cancel') ?></button><?php endif; ?>
        <?php if ($o['status'] === 'paid'): ?><button class="a-btn a-btn-sm" name="do" value="resend"><?= __('New link') ?></button><?php endif; ?>
      </form></td></tr>
  <?php endforeach; ?>
  <?php if (!$list): ?><tr><td colspan="6" class="muted"><?= __('No orders yet.') ?></td></tr><?php endif; ?>
</tbody></table></div></section>
<?php admin_footer(); ?>
